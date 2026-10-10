/**
 * Article parser: fetch a URL, extract the main content, and return a
 * single-chapter `ParsedBook`.
 *
 * This is a heuristic extractor. It prefers `<article>` then `<main>`, removes
 * chrome (nav, header, footer, aside, scripts), and keeps headings and
 * paragraphs. It is not as thorough as a readability engine, but it has no
 * extra dependency.
 */

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

import type { ParsedBook, ParsedParagraph } from "@/lib/epub/parse";

const USER_AGENT = "audiobook-ingest/0.1";
const MAX_HTML = 3_000_000;
const MAX_COVER_BYTES = 4_000_000;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
};

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
  return decodeEntities(html.replace(/<[^>]*>/g, " "));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function metaContent(html: string, key: string): string | null {
  const k = escapeRegExp(key);
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]).trim();
  }
  return null;
}

function titleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() || null : null;
}

function htmlLang(html: string): string | null {
  const match = html.match(/<html[^>]*\blang=["']([a-zA-Z-]+)["']/i);
  return match ? match[1] : null;
}

/** Prefer `<article>`, then `<main>`, else the whole document. */
function pickMain(html: string): string {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article && article[1].length > 200) return article[1];
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main && main[1].length > 200) return main[1];
  return html;
}

const HEADING_MARK = "\u0001";

function paragraphsFrom(html: string): ParsedParagraph[] {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");

  const marked = cleaned.replace(
    /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_match, _level, inner: string) => `\n${HEADING_MARK}${inner}${HEADING_MARK}\n`,
  );
  const withBreaks = marked
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|section|article|blockquote|h[1-6]|figcaption)>/gi, "\n");

  const paragraphs: ParsedParagraph[] = [];
  for (const raw of stripTags(withBreaks).split(/\n+/)) {
    const heading = raw.includes(HEADING_MARK);
    const text = raw.replaceAll(HEADING_MARK, "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (heading || text.length >= 20) paragraphs.push({ text, heading });
  }
  return paragraphs;
}

export async function fetchArticle(url: string): Promise<{ html: string; finalUrl: string }> {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const response = await fetch(target, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Could not fetch the page (${response.status})`);
  const type = response.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
    throw new Error("That link is not an HTML page");
  }
  const html = (await response.text()).slice(0, MAX_HTML);
  return { html, finalUrl: response.url || target };
}

export function parseArticle(html: string, url: string): ParsedBook {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "Article";
    }
  })();

  let title = metaContent(html, "og:title") ?? titleTag(html) ?? null;
  let author =
    metaContent(html, "author") ?? metaContent(html, "article:author") ?? metaContent(html, "og:site_name");
  let language = htmlLang(html);
  let paragraphs: ParsedParagraph[] = [];

  // Readability removes chrome and keeps the article body. Fall back to the
  // heuristic extractor when it cannot find one.
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document).parse();
    if (article?.content && (article.textContent ?? "").length > 200) {
      title = article.title?.trim() || title;
      author = article.byline?.trim() || author;
      language = article.lang || language;
      paragraphs = paragraphsFrom(article.content);
    }
  } catch {
    // fall through to the heuristic
  }

  if (paragraphs.length === 0) {
    paragraphs = paragraphsFrom(pickMain(html));
  }
  if (paragraphs.length === 0) {
    throw new Error("No readable text found on that page");
  }

  const firstHeading = paragraphs.find((paragraph) => paragraph.heading)?.text ?? null;
  const finalTitle = title ?? firstHeading ?? host;

  return {
    title: finalTitle,
    author,
    language,
    cover: null,
    chapters: [{ title: finalTitle, paragraphs }],
  };
}

/** The page's social image, if it declares one. */
export async function fetchArticleImage(
  html: string,
): Promise<{ data: Uint8Array; contentType: string } | null> {
  const url = metaContent(html, "og:image") ?? metaContent(html, "twitter:image");
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
    if (!response.ok) return null;
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength === 0 || data.byteLength > MAX_COVER_BYTES) return null;
    return { data, contentType: response.headers.get("content-type") ?? "image/jpeg" };
  } catch {
    return null;
  }
}
