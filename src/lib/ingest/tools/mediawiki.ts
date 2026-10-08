/**
 * mediawiki_lookup: the Director's only tool.
 *
 * Wraps the MediaWiki API for any wiki — Wikipedia (`en.wikipedia.org`, API at
 * `/w/api.php`) or Fandom (`<name>.fandom.com`, API at `/api.php`).
 *
 *   mode "search" -> find candidate pages for a name
 *   mode "page"   -> fetch a page's text, preferring the Characters section
 *
 * No per-call fee; the caller caches results per book.
 */

const USER_AGENT = "audiobook-ingest/0.1";
const JSON_HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json" };
const MAX_TEXT_CHARS = 4000;

export type WikiLookupArgs = {
  query: string;
  site?: string;
  mode?: "search" | "page";
};

export type WikiHit = { title: string; url: string; snippet: string };

export type WikiLookupResult = {
  site: string;
  mode: "search" | "page";
  hits?: WikiHit[];
  text?: string | null;
};

function hostOf(site: string): string {
  return site
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function apiBase(host: string): string {
  return /(^|\.)wikipedia\.org$/.test(host)
    ? `https://${host}/w/api.php`
    : `https://${host}/api.php`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const SECTION_END =
  /^(production|media|reception|references|external links|notes|see also|further reading|bibliography|gallery|navigation)$/i;

function extractCharactersSection(text: string): string | null {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^characters$/i.test(line.trim()));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && SECTION_END.test(line.trim()));
  const section = lines.slice(start, end > 0 ? end : undefined).join("\n").trim();
  return section.length > 40 ? section : null;
}

async function callApi(
  base: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const url = new URL(base);
  url.search = new URLSearchParams({ ...params, format: "json", formatversion: "2" }).toString();
  const response = await fetch(url, { headers: JSON_HEADERS, signal });
  if (!response.ok) throw new Error(`MediaWiki ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

async function search(
  base: string,
  site: string,
  query: string,
  signal?: AbortSignal,
): Promise<WikiHit[]> {
  const data = await callApi(
    base,
    { action: "query", list: "search", srsearch: query, srlimit: "5" },
    signal,
  );
  const list =
    ((data.query as { search?: { title?: string; snippet?: string }[] } | undefined)?.search) ?? [];
  return list
    .filter((hit) => typeof hit.title === "string")
    .map((hit) => ({
      title: hit.title as string,
      url: `https://${site}/wiki/${encodeURIComponent((hit.title as string).replace(/ /g, "_"))}`,
      snippet: htmlToText(hit.snippet ?? ""),
    }));
}

async function parseFull(
  base: string,
  title: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const data = await callApi(
    base,
    {
      action: "parse",
      page: title,
      prop: "text",
      disabletoc: "1",
      disableeditsection: "1",
      redirects: "1",
    },
    signal,
  );
  const node = (data.parse as { text?: string | { "*"?: string } } | undefined)?.text;
  const html = typeof node === "string" ? node : node?.["*"];
  return html ? htmlToText(html).slice(0, MAX_TEXT_CHARS) : null;
}

async function page(base: string, title: string, signal?: AbortSignal): Promise<string | null> {
  // Prefer a Characters section (article pages). Fall back to the whole page
  // (Fandom has no TextExtracts), then to the plaintext extract.
  try {
    const sectionData = await callApi(
      base,
      { action: "parse", page: title, prop: "sections", redirects: "1" },
      signal,
    );
    const sections =
      ((sectionData.parse as { sections?: { index?: string; line?: string }[] } | undefined)
        ?.sections) ?? [];
    const target = sections.find((s) => /^characters$/i.test((s.line ?? "").trim()));
    if (target?.index) {
      const textData = await callApi(
        base,
        {
          action: "parse",
          page: title,
          section: String(target.index),
          prop: "text",
          disabletoc: "1",
          disableeditsection: "1",
          redirects: "1",
        },
        signal,
      );
      const node = (textData.parse as { text?: string | { "*"?: string } } | undefined)?.text;
      const html = typeof node === "string" ? node : node?.["*"];
      if (html) return htmlToText(html).slice(0, MAX_TEXT_CHARS);
    }
  } catch {
    // fall through
  }

  const full = await parseFull(base, title, signal).catch(() => null);
  if (full) return full;

  const extractData = await callApi(
    base,
    { action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: title },
    signal,
  );
  const pages =
    ((extractData.query as { pages?: { extract?: string }[] } | undefined)?.pages) ?? [];
  const extract = pages[0]?.extract ?? null;
  if (!extract) return null;

  const section = extractCharactersSection(extract);
  return (section ?? extract).slice(0, MAX_TEXT_CHARS);
}

export async function mediawikiLookup(
  args: WikiLookupArgs,
  options: { fallbackSite?: string; signal?: AbortSignal } = {},
): Promise<WikiLookupResult> {
  const site = hostOf(args.site ?? options.fallbackSite ?? "en.wikipedia.org");
  const base = apiBase(site);
  const mode = args.mode ?? "search";

  if (mode === "page") {
    const text = await page(base, args.query, options.signal);
    return { site, mode, text };
  }

  const hits = await search(base, site, args.query, options.signal);
  return { site, mode, hits };
}
