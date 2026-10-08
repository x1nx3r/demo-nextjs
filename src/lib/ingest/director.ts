/**
 * Director: the whole-chapter casting pass.
 *
 * Sees the full chapter (plus the user's reference and direction) and returns an
 * append-only cast with inferred characteristics. It has one tool,
 * `mediawiki_lookup`, to resolve names it cannot place from context alone.
 *
 * External knowledge is scoped to casting; it never reaches the planner.
 */

import { chat, extractJson, getDirectorModel, type ChatMessage } from "./llm";
import { mediawikiLookup, type WikiLookupArgs } from "./tools/mediawiki";

export type DirectorEntry = {
  name: string;
  aliases?: string[];
  gender?: string;
  ageBand?: string;
  register?: string;
  importance?: string;
};

export type DirectorOptions = {
  chapterText: string;
  chapterTitle?: string;
  bookTitle?: string;
  reference?: string;
  direction?: string;
  existing?: DirectorEntry[];
  fallbackSite?: string;
  maxIterations?: number;
  sessionId?: string;
  signal?: AbortSignal;
  /** Override the wiki lookup, e.g. to add a per-book cache. */
  lookup?: (args: WikiLookupArgs) => Promise<unknown>;
  debug?: (message: string) => void;
};

const TOOL = {
  type: "function",
  function: {
    name: "mediawiki_lookup",
    description:
      "Look a character up on a wiki. mode 'search' finds candidate pages; mode 'page' returns a page's text, preferring its Characters section.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "A character name or search terms; the page title when mode is 'page'.",
        },
        site: {
          type: "string",
          description:
            "Wiki host, e.g. en.wikipedia.org or 86-eighty-six.fandom.com. Defaults to the reference host.",
        },
        mode: { type: "string", enum: ["search", "page"] },
      },
      required: ["query"],
    },
  },
} as const;

function systemPrompt(): string {
  return [
    "You are the casting director for an audiobook. You read a chapter and decide who the characters are.",
    "You receive: the book title, an optional reference (a character list or wiki text), an optional direction, the cast so far, and the chapter text.",
    "You may call mediawiki_lookup to resolve a name you cannot place from context. Use it sparingly; the reference and the chapter are usually enough.",
    "",
    "Return ONLY a JSON object {\"characters\": [ ... ]} with one object per character:",
    '- name: the canonical display name.',
    '- aliases: other names, titles, and call signs for the same person (for example a real name and a call sign).',
    '- gender: "male" | "female" | "machine" | "unknown". Use "machine" for robots, androids, AIs and synthetic units.',
    '- ageBand: "child" | "young" | "middle-aged" | "old". child = a young child; young = teen to twenties; middle-aged = thirties to fifties; old = sixties and up.',
    '- register: a short phrase for how they speak, e.g. "clipped, matter-of-fact".',
    "- importance: \"lead\" | \"supporting\" | \"minor\".",
    "",
    "Rules:",
    "- Infer gender and ageBand from the text: names, pronouns, titles and description. Use \"unknown\" only when the text gives no signal at all.",
    "- Include every character who speaks or is named, and fold a call sign and a real name into one entry.",
    "- Preserve every entry in the cast so far; add new characters; never rename or drop an existing one.",
    "- Do not invent characters the text does not support.",
    "- The final message must be the JSON object, with no tool call.",
  ].join("\n");
}

function userPrompt(options: DirectorOptions): string {
  return JSON.stringify({
    book: options.bookTitle,
    chapterTitle: options.chapterTitle,
    reference: options.reference?.trim() || undefined,
    direction: options.direction?.trim() || undefined,
    cast: options.existing ?? [],
    chapter: options.chapterText,
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalize(raw: unknown): DirectorEntry[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { characters?: unknown }).characters)
      ? ((raw as { characters: unknown[] }).characters ?? [])
      : [];

  const entries: DirectorEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const name = asString(entry.name);
    if (!name) continue;
    const aliases = Array.isArray(entry.aliases)
      ? entry.aliases.filter((a): a is string => typeof a === "string").map((a) => a.trim()).filter(Boolean)
      : [];
    entries.push({
      name,
      aliases,
      gender: asString(entry.gender),
      ageBand: asString(entry.ageBand),
      register: asString(entry.register),
      importance: asString(entry.importance),
    });
  }
  return entries;
}

export async function runDirector(options: DirectorOptions): Promise<DirectorEntry[]> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(options) },
  ];

  const max = options.maxIterations ?? 5;

  for (let iteration = 0; iteration < max; iteration++) {
    const last = iteration === max - 1;
    options.debug?.(`director turn ${iteration + 1}/${max}`);
    const { content, toolCalls } = await chat(messages, {
      model: getDirectorModel(),
      tools: [TOOL],
      toolChoice: last ? "none" : "auto",
      maxTokens: 4000,
      temperature: 0,
      sessionId: options.sessionId,
      signal: options.signal,
    });

    if (toolCalls && toolCalls.length > 0) {
      messages.push({ role: "assistant", content, tool_calls: toolCalls });
      for (const call of toolCalls as {
        id?: string;
        function?: { name?: string; arguments?: string };
      }[]) {
        let result: unknown = { error: "unknown tool" };
        if (call.function?.name === "mediawiki_lookup") {
          try {
            const args = JSON.parse(call.function.arguments ?? "{}") as WikiLookupArgs;
            options.debug?.(`wiki ${args.mode ?? "search"} ${args.site ?? options.fallbackSite ?? ""} "${args.query}"`);
            result = options.lookup
              ? await options.lookup(args)
              : await mediawikiLookup(args, {
                  fallbackSite: options.fallbackSite,
                  signal: options.signal,
                });
          } catch (error) {
            result = { error: error instanceof Error ? error.message : String(error) };
          }
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 8000),
        });
      }
      continue;
    }

    if (content.trim()) {
      return normalize(extractJson(content));
    }
  }

  return [];
}
