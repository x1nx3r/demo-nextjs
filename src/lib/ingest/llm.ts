/**
 * LLM capability client. OpenAI-compatible chat completions with JSON mode,
 * retries, and a provider seam.
 *
 * Providers:
 *   - openrouter  (default)  https://openrouter.ai/api/v1
 *   - opencode-go            https://opencode.ai/zen/go/v1
 *
 * Env (capability-first, legacy names kept as aliases):
 *   LLM_PROVIDER, LLM_BASE_URL, LLM_API_KEY
 *   LLM_DIRECTOR_MODEL, LLM_PLANNER_MODEL
 *   OPENROUTER_API_KEY, OPENCODE_API_KEY, OPENCODE_GO_BASE_URL, INGEST_MODEL
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Set for role:"tool" replies. */
  tool_call_id?: string;
  /** Assistant tool calls, echoed back in a tool loop. */
  tool_calls?: unknown;
};

export type ChatJsonOptions = {
  model?: string;
  temperature?: number;
  /** "none" disables reasoning; "low"|"medium"|"high" sets it. */
  reasoningEffort?: string;
  maxTokens?: number;
  /** Tool definitions for a tool-calling loop (Director). */
  tools?: unknown[];
  toolChoice?: unknown;
  /** Stable id per conversation; sent as x-opencode-session on Go. */
  sessionId?: string;
  signal?: AbortSignal;
};

export class LlmError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "LlmError";
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

export type LlmProviderId = "openrouter" | "opencode-go";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const GO_BASE = "https://opencode.ai/zen/go/v1";
const GO_DEFAULT_MODEL = "deepseek-v4.1-flash";
const OPENROUTER_DEFAULT_PLANNER = "nvidia/nemotron-3-super-120b-a12b:free";
const OPENROUTER_DEFAULT_DIRECTOR = "nvidia/nemotron-3-ultra-550b-a55b:free";
const USER_AGENT = "demo-nextjs-ingest/0.1";
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 600;

export function getLlmProvider(): LlmProviderId {
  return (process.env.LLM_PROVIDER ?? "openrouter").toLowerCase() === "opencode-go"
    ? "opencode-go"
    : "openrouter";
}

function resolveConfig(): { provider: LlmProviderId; baseUrl: string; apiKey: string } | null {
  const provider = getLlmProvider();

  if (provider === "opencode-go") {
    const apiKey = process.env.LLM_API_KEY ?? process.env.OPENCODE_API_KEY;
    if (!apiKey) return null;
    const baseUrl = process.env.LLM_BASE_URL ?? process.env.OPENCODE_GO_BASE_URL ?? GO_BASE;
    return { provider, baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
  }

  const apiKey = process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.LLM_BASE_URL ?? OPENROUTER_BASE;
  return { provider, baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export function isIngestConfigured(): boolean {
  return resolveConfig() !== null;
}

/** Model for the per-chunk script planner (JSON, big output). */
export function getPlannerModel(): string {
  if (process.env.LLM_PLANNER_MODEL) return process.env.LLM_PLANNER_MODEL;
  if (process.env.INGEST_MODEL) return process.env.INGEST_MODEL;
  return getLlmProvider() === "opencode-go" ? GO_DEFAULT_MODEL : OPENROUTER_DEFAULT_PLANNER;
}

/** Model for the whole-chapter Director (judgment, tools). */
export function getDirectorModel(): string {
  if (process.env.LLM_DIRECTOR_MODEL) return process.env.LLM_DIRECTOR_MODEL;
  return getLlmProvider() === "opencode-go" ? getPlannerModel() : OPENROUTER_DEFAULT_DIRECTOR;
}

/** Legacy alias. */
export function getIngestModel(): string {
  return getPlannerModel();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * BASE_BACKOFF_MS, 8000);
}

/** Pull the first JSON object out of a model reply, fences or prose and all. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cleaned = (fenced ? fenced[1] : text).trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through to brace slicing
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      // fall through to error
    }
  }

  throw new LlmError("Model did not return valid JSON", { retryable: false });
}

function buildHeaders(
  provider: LlmProviderId,
  apiKey: string,
  sessionId?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };
  if (provider === "opencode-go" && sessionId) {
    headers["x-opencode-session"] = sessionId;
  }
  if (provider === "openrouter") {
    // Optional attribution headers; harmless when unset.
    const referer = process.env.OPENROUTER_REFERER ?? process.env.APP_URL;
    const title = process.env.OPENROUTER_TITLE ?? "chattypub";
    if (referer) headers["HTTP-Referer"] = referer;
    if (title) headers["X-Title"] = title;
  }
  return headers;
}

function applyReasoning(
  provider: LlmProviderId,
  body: Record<string, unknown>,
  effort?: string,
): void {
  if (provider === "opencode-go") {
    body.reasoning_effort = effort ?? "none";
    return;
  }
  // OpenRouter unified reasoning. Omit entirely when unset so a model that does
  // not reason is never sent a field it might reject.
  if (effort == null) return;
  body.reasoning = effort === "none" ? { enabled: false } : { effort };
}

export type ChatResult = {
  content: string;
  toolCalls: unknown[] | null;
};

async function requestChat(
  messages: ChatMessage[],
  options: ChatJsonOptions,
  baseUrl: string,
  apiKey: string,
  provider: LlmProviderId,
  jsonMode: boolean,
): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    model: options.model ?? getPlannerModel(),
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 2048,
  };
  if (jsonMode) body.response_format = { type: "json_object" };
  if (options.tools) body.tools = options.tools;
  if (options.toolChoice != null) body.tool_choice = options.toolChoice;
  applyReasoning(provider, body, options.reasoningEffort);

  let lastError: LlmError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(backoffMs(attempt - 1));

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: buildHeaders(provider, apiKey, options.sessionId),
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (cause) {
      lastError = new LlmError("LLM request failed", { retryable: true, cause });
      continue;
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      const retryable = response.status === 429 || response.status >= 500;
      lastError = new LlmError(`LLM ${response.status}: ${detail}`, {
        status: response.status,
        retryable,
      });
      if (!retryable) throw lastError;
      continue;
    }

    const payload = (await response.json()) as {
      choices?: {
        message?: { content?: string | null; reasoning?: string; tool_calls?: unknown[] };
      }[];
    };
    const message = payload.choices?.[0]?.message;
    const content = message?.content ?? "";
    const toolCalls = message?.tool_calls ?? null;

    if ((typeof content !== "string" || content.trim() === "") && !toolCalls?.length) {
      lastError = new LlmError("LLM returned an empty completion", { retryable: true });
      continue;
    }
    return { content, toolCalls };
  }

  throw lastError ?? new LlmError("LLM request failed after retries", { retryable: true });
}

async function run(
  messages: ChatMessage[],
  options: ChatJsonOptions,
  jsonMode: boolean,
): Promise<ChatResult> {
  const config = resolveConfig();
  if (!config) {
    throw new LlmError(
      "No LLM provider configured (set LLM_API_KEY, or OPENROUTER_API_KEY / OPENCODE_API_KEY)",
      { retryable: false },
    );
  }
  return requestChat(messages, options, config.baseUrl, config.apiKey, config.provider, jsonMode);
}

/** Raw assistant text (no JSON mode). */
export async function chatText(
  messages: ChatMessage[],
  options: ChatJsonOptions = {},
): Promise<string> {
  return (await run(messages, options, false)).content;
}

/** JSON-mode completion, parsed. */
export async function chatJson<T>(
  messages: ChatMessage[],
  options: ChatJsonOptions = {},
): Promise<T> {
  const { content } = await run(messages, options, true);
  return extractJson(content) as T;
}

/** Full result, for tool-calling loops. JSON mode off. */
export async function chat(
  messages: ChatMessage[],
  options: ChatJsonOptions = {},
): Promise<ChatResult> {
  return run(messages, options, false);
}
