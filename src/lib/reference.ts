/**
 * Resolve the optional character reference the user pastes at import.
 *
 * Accepts free text as-is. If it is an http(s) URL, the page is fetched
 * server-side and stripped to text. Wikipedia links go through the MediaWiki
 * API: first the "Characters" section by index, then the plaintext extract as a
 * fallback, so we keep the relevant part and avoid page chrome.
 */

const MAX_REFERENCE_CHARS = 12000;
const USER_AGENT = "chattypub-ingest/0.1";
const JSON_HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json" };

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
  /^(production|media|reception|references|external links|notes|see also|further reading|bibliography)$/i;

function extractCharactersSection(text: string): string | null {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^characters$/i.test(line.trim()));
  if (start < 0) return null;

  const end = lines.findIndex(
    (line, index) => index > start && SECTION_END.test(line.trim()),
  );
  const section = lines
    .slice(start, end > 0 ? end : undefined)
    .join("\n")
    .trim();

  return section.length > 40 ? section : null;
}

type ParseResponse = {
  parse?: {
    sections?: { index?: string; line?: string }[];
    text?: string | { "*"?: string };
  };
};

async function wikipediaCharsSection(base: string, title: string, signal?: AbortSignal): Promise<string | null> {
  const sectionsUrl = new URL(base);
  sectionsUrl.search = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "sections",
    redirects: "1",
    format: "json",
    formatversion: "2",
  }).toString();

  const sectionsRes = await fetch(sectionsUrl, { headers: JSON_HEADERS, signal });
  if (!sectionsRes.ok) return null;
  const sections = ((await sectionsRes.json()) as ParseResponse).parse?.sections ?? [];
  const target = sections.find((section) => /^characters$/i.test(String(section.line ?? "").trim()));
  if (!target?.index) return null;

  const textUrl = new URL(base);
  textUrl.search = new URLSearchParams({
    action: "parse",
    page: title,
    section: String(target.index),
    prop: "text",
    disabletoc: "1",
    disableeditsection: "1",
    redirects: "1",
    format: "json",
    formatversion: "2",
  }).toString();

  const textRes = await fetch(textUrl, { headers: JSON_HEADERS, signal });
  if (!textRes.ok) return null;
  const text = ((await textRes.json()) as ParseResponse).parse?.text;
  const html = typeof text === "string" ? text : text?.["*"];
  return typeof html === "string" && html.length > 0 ? htmlToText(html) : null;
}

async function wikipediaFullExtract(base: string, title: string, signal?: AbortSignal): Promise<string | null> {
  const url = new URL(base);
  url.search = new URLSearchParams({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    redirects: "1",
    format: "json",
    formatversion: "2",
    titles: title,
  }).toString();

  const response = await fetch(url, { headers: JSON_HEADERS, signal });
  if (!response.ok) return null;
  const data = (await response.json()) as { query?: { pages?: { extract?: string }[] } };
  const extract = data.query?.pages?.[0]?.extract;
  return typeof extract === "string" && extract.length > 0 ? extract : null;
}

async function fetchWikipediaContext(url: URL, signal?: AbortSignal): Promise<string | null> {
  if (!url.hostname.includes("wikipedia.org")) return null;
  const match = url.pathname.match(/^\/wiki\/(.+)$/);
  if (!match) return null;

  const title = decodeURIComponent(match[1]);
  const lang = url.hostname.split(".")[0];
  const base = `https://${lang}.wikipedia.org/w/api.php`;

  const section = await wikipediaCharsSection(base, title, signal);
  if (section) return section;
  return wikipediaFullExtract(base, title, signal);
}

export async function resolveReferenceContext(
  input: string,
  signal?: AbortSignal,
): Promise<string> {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  let text = await fetchWikipediaContext(url, signal);
  if (!text) {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal,
    });
    if (!response.ok) {
      throw new Error(`Could not fetch reference (${response.status})`);
    }
    text = htmlToText(await response.text());
  }

  const section = extractCharactersSection(text);
  return (section ?? text).slice(0, MAX_REFERENCE_CHARS);
}
