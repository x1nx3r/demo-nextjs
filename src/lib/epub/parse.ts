import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { posix } from "node:path";

export type ParsedParagraph = { text: string; heading: boolean };
export type ParsedChapter = { title: string; paragraphs: ParsedParagraph[] };
export type ParsedBook = {
  title: string;
  author: string | null;
  language: string | null;
  cover: { data: Uint8Array; contentType: string } | null;
  chapters: ParsedChapter[];
};

type XmlNode = Record<string, unknown>;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
};

function toArray<T = unknown>(value: unknown): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? (value as T[]) : [value as T];
}

function attr(node: unknown, name: string): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const value = (node as XmlNode)[`@_${name}`];
  return typeof value === "string" ? value : undefined;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const text = (value as XmlNode)["#text"];
    if (typeof text === "string") return text;
    if (typeof text === "number") return String(text);
  }
  return "";
}

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
    if (code.startsWith("#")) {
      const isHex = code[1] === "x" || code[1] === "X";
      const value = parseInt(isHex ? code.slice(2) : code.slice(1), isHex ? 16 : 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code] ?? match;
  });
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ""));
}

function resolvePath(baseDir: string, href: string): string {
  const clean = href.split("#")[0];
  return posix.normalize(posix.join(baseDir, clean)).replace(/^\.\//, "");
}

const HEADING_MARK = "\u0001";

function extractParagraphs(xhtml: string): ParsedParagraph[] {
  const cleaned = xhtml
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  const marked = cleaned.replace(
    /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_match, _level, inner: string) => `\n${HEADING_MARK}${inner}${HEADING_MARK}\n`,
  );

  const withBreaks = marked
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/(p|div|li|section|article|blockquote|h[1-6]|tr|td|figcaption|header|footer|ul|ol|table)>/gi,
      "\n",
    );

  const paragraphs: ParsedParagraph[] = [];
  for (const rawLine of stripTags(withBreaks).split(/\n+/)) {
    const heading = rawLine.includes(HEADING_MARK);
    const text = rawLine.replaceAll(HEADING_MARK, "").replace(/\s+/g, " ").trim();
    if (text) paragraphs.push({ text, heading });
  }
  return paragraphs;
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path) ?? zip.file(decodeURIComponent(path));
  return file ? file.async("string") : null;
}

export async function parseEpub(data: Uint8Array | ArrayBuffer): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(data);

  const containerXml = await readText(zip, "META-INF/container.xml");
  if (!containerXml) {
    throw new Error("Not a valid EPUB: missing META-INF/container.xml");
  }

  const container = xmlParser.parse(containerXml) as XmlNode;
  const rootfiles = toArray<XmlNode>(getNode(container, "container", "rootfiles", "rootfile"));
  const opfPath = attr(rootfiles[0], "full-path");
  if (!opfPath) {
    throw new Error("Not a valid EPUB: missing OPF rootfile");
  }

  const opfXml = await readText(zip, opfPath);
  if (!opfXml) {
    throw new Error("Not a valid EPUB: missing OPF package document");
  }

  const opf = xmlParser.parse(opfXml) as XmlNode;
  const pkg = asNode(opf.package);
  const metadata = asNode(pkg.metadata);
  const baseDir = posix.dirname(opfPath);

  const title = textOf(metadata["dc:title"] ?? metadata.title) || "Untitled";
  const author = textOf(metadata["dc:creator"] ?? metadata.creator) || null;
  const language = textOf(metadata["dc:language"] ?? metadata.language) || null;

  const items = toArray<XmlNode>(asNode(pkg.manifest).item);
  const byId = new Map<string, XmlNode>();
  for (const item of items) {
    const id = attr(item, "id");
    if (id) byId.set(id, item);
  }

  const cover = await readCover(zip, items, byId, metadata, baseDir);
  const chapters = await readChapters(zip, pkg, byId, baseDir);

  if (chapters.length === 0) {
    throw new Error("No readable chapters found in EPUB");
  }

  return { title, author, language, cover, chapters };
}

function asNode(value: unknown): XmlNode {
  return value && typeof value === "object" ? (value as XmlNode) : {};
}

function getNode(root: XmlNode, ...keys: string[]): unknown {
  let current: unknown = root;
  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as XmlNode)[key];
  }
  return current;
}

async function readCover(
  zip: JSZip,
  items: XmlNode[],
  byId: Map<string, XmlNode>,
  metadata: XmlNode,
  baseDir: string,
): Promise<ParsedBook["cover"]> {
  const coverMeta = toArray<XmlNode>(metadata.meta).find(
    (meta) => attr(meta, "name") === "cover",
  );
  const coverContent = coverMeta ? attr(coverMeta, "content") : undefined;

  let coverItem =
    items.find((item) =>
      (attr(item, "properties") ?? "").split(/\s+/).includes("cover-image"),
    ) ?? (coverContent ? byId.get(coverContent) : undefined);

  if (!coverItem) {
    coverItem = items.find((item) =>
      (attr(item, "id") ?? "").toLowerCase().includes("cover"),
    );
  }

  if (!coverItem) return null;

  const href = attr(coverItem, "href");
  if (!href) return null;

  const file = zip.file(resolvePath(baseDir, href));
  if (!file) return null;

  return {
    data: await file.async("uint8array"),
    contentType: attr(coverItem, "media-type") ?? "image/jpeg",
  };
}

type TocEntry = { title: string; path: string };

/** Collect every value stored under `key`, at any depth. */
function collectByKey(node: unknown, key: string, out: unknown[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectByKey(item, key, out);
    return;
  }
  for (const [name, value] of Object.entries(node as XmlNode)) {
    if (name === key) out.push(...toArray(value));
    else collectByKey(value, key, out);
  }
}

/** EPUB 3 navigation document: anchors under the nav with epub:type="toc". */
function parseNavAnchors(xml: string, dir: string): TocEntry[] {
  const parsed = xmlParser.parse(xml) as XmlNode;
  const navNodes: XmlNode[] = [];
  collectByKey(parsed, "nav", navNodes);

  const tocNav =
    navNodes.find((node) => (attr(node, "epub:type") ?? attr(node, "type")) === "toc") ??
    navNodes[0];
  if (!tocNav) return [];

  const anchors: XmlNode[] = [];
  collectByKey(tocNav, "a", anchors);

  const entries: TocEntry[] = [];
  for (const anchor of anchors) {
    const href = attr(anchor, "href");
    if (!href) continue;
    entries.push({ title: textOf(anchor).trim() || "Untitled", path: resolvePath(dir, href) });
  }
  return entries;
}

/** EPUB 2 NCX: navPoints in document order, label + content src. */
function parseNcx(xml: string, dir: string): TocEntry[] {
  const parsed = xmlParser.parse(xml) as XmlNode;
  const navPoints: XmlNode[] = [];
  collectByKey(parsed, "navPoint", navPoints);

  const entries: TocEntry[] = [];
  for (const point of navPoints) {
    const label = toArray<XmlNode>(point.navLabel)[0];
    const title = label ? textOf(label.text).trim() : "";
    const content = toArray<XmlNode>(point.content)[0];
    const src = content ? attr(content, "src") : undefined;
    if (src) entries.push({ title: title || "Untitled", path: resolvePath(dir, src) });
  }
  return entries;
}

/** Read the table of contents from the nav document, else the NCX. */
async function readToc(
  zip: JSZip,
  items: XmlNode[],
  baseDir: string,
): Promise<{ entries: TocEntry[]; tocPath: string | null }> {
  const navItem = items.find((item) =>
    (attr(item, "properties") ?? "").split(/\s+/).includes("nav"),
  );
  const ncxItem =
    items.find((item) => (attr(item, "media-type") ?? "") === "application/x-dtbncx+xml") ??
    items.find((item) => (attr(item, "href") ?? "").toLowerCase().endsWith(".ncx"));

  for (const [item, parse] of [
    [navItem, parseNavAnchors],
    [ncxItem, parseNcx],
  ] as const) {
    if (!item) continue;
    const href = attr(item, "href");
    if (!href) continue;

    const path = resolvePath(baseDir, href);
    const xml = await readText(zip, path);
    if (!xml) continue;

    const entries = parse(xml, posix.dirname(path));
    if (entries.length > 0) return { entries, tocPath: path };
  }

  return { entries: [], tocPath: null };
}

async function readParagraphs(zip: JSZip, paths: string[]): Promise<ParsedParagraph[]> {
  const paragraphs: ParsedParagraph[] = [];
  for (const path of paths) {
    const html = await readText(zip, path);
    if (html) paragraphs.push(...extractParagraphs(html));
  }
  return paragraphs;
}

function titleFromParagraphs(paragraphs: ParsedParagraph[]): string | null {
  return paragraphs.find((paragraph) => paragraph.heading)?.text ?? null;
}

/**
 * Chapter map. The EPUB's own table of contents is authoritative: each TOC
 * anchor starts a chapter that runs until the next anchor, so a chapter made of
 * several spine files is grouped back together and titled from the nav. When no
 * usable TOC exists, fall back to one chapter per spine document.
 */
async function readChapters(
  zip: JSZip,
  pkg: XmlNode,
  byId: Map<string, XmlNode>,
  baseDir: string,
): Promise<ParsedChapter[]> {
  const items = [...byId.values()];
  const spine = toArray<XmlNode>(asNode(pkg.spine).itemref)
    .map((ref) => byId.get(attr(ref, "idref") ?? ""))
    .filter((item): item is XmlNode => Boolean(item))
    .filter((item) => (attr(item, "media-type") ?? "").includes("html"));

  const { entries, tocPath } = await readToc(zip, items, baseDir);
  const docs = spine
    .map((item) => attr(item, "href"))
    .filter((href): href is string => Boolean(href))
    .map((href) => resolvePath(baseDir, href))
    .filter((path) => path !== tocPath);

  if (entries.length > 0 && docs.length > 0) {
    const position = new Map<string, number>();
    docs.forEach((path, index) => {
      if (!position.has(path)) position.set(path, index);
    });

    const anchors = entries
      .map((entry) => ({ title: entry.title, pos: position.get(entry.path) }))
      .filter((anchor): anchor is { title: string; pos: number } => anchor.pos !== undefined)
      .sort((a, b) => a.pos - b.pos)
      .filter((anchor, index, all) => index === 0 || anchor.pos !== all[index - 1].pos);

    if (anchors.length > 0) {
      const chapters: ParsedChapter[] = [];

      if (anchors[0].pos > 0) {
        const paragraphs = await readParagraphs(zip, docs.slice(0, anchors[0].pos));
        if (paragraphs.length > 0) {
          chapters.push({ title: titleFromParagraphs(paragraphs) ?? "Front Matter", paragraphs });
        }
      }

      for (let i = 0; i < anchors.length; i++) {
        const start = anchors[i].pos;
        const end = i + 1 < anchors.length ? anchors[i + 1].pos : docs.length;
        const paragraphs = await readParagraphs(zip, docs.slice(start, end));
        if (paragraphs.length === 0) continue;
        chapters.push({
          title: anchors[i].title || titleFromParagraphs(paragraphs) || `Chapter ${chapters.length + 1}`,
          paragraphs,
        });
      }

      if (chapters.length > 0) return chapters;
    }
  }

  // Fallback: one chapter per spine document.
  const chapters: ParsedChapter[] = [];
  for (const path of docs) {
    const paragraphs = await readParagraphs(zip, [path]);
    if (paragraphs.length === 0) continue;
    chapters.push({
      title: titleFromParagraphs(paragraphs) ?? `Chapter ${chapters.length + 1}`,
      paragraphs,
    });
  }
  return chapters;
}
