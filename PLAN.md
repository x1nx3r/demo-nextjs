# PLAN — EPUB → Audiobook (mobile-first)

Working name: **TBD**. Owner: udin. Status: draft for review.

## 1. Goal

Mobile-first web app that turns an EPUB into an audiobook with a *context-aware,
personalized, humane* reading. The user imports an EPUB, then ingests and converts
chapters explicitly.

Workflow (as requested):

```
EPUB import  ->  [ Ingest ]  ->  [ Convert ]  ->  [ Play ]
```

- **Import** — upload EPUB, parse spine, register chapters. Cheap, instant, no TTS cost.
- **Ingest** — explicit per-chapter action. Split chapter into chunks and run the
  context-characterization pass (LLM tags dialogue/narration/questions/emphasis).
  Cheap, fast.
- **Convert** — explicit per-chapter action. Synthesize each chunk with ElevenLabs,
  cache it, assemble the chapter's audio. Metered, slow, and **resumable**.
- **Play** — stream cached audio with synced highlighting, resume, lock-screen controls.

Each chapter row walks `[Ingest] -> [Convert] -> [Play]`, persisted in RustFS, so the
flow survives reloads and serverless restarts.

## 2. Hosting & constraints (Vercel + RustFS)

Deployed on Vercel; storage and all state live in a **self-hosted RustFS**
(S3-compatible) instance. Consequences:

- Functions are stateless and ephemeral: **no local disk persistence**.
- `maxDuration`: Hobby 300s; Pro 300s default / 800s max (1800s beta).
- Long TTS conversions are broken into durable steps so a single timeout can't kill
  a chapter. Use **Vercel Workflows** (durable, pause/resume, retries). Fallback if
  unavailable: client-driven batch tick route (each call well under 300s).
- **No database.** Books, chapters, chunk tags, job progress and settings are JSON
  objects in RustFS; large binaries (EPUB, MP3, cover) sit beside them.
- **Recoverable by construction.** Every chunk is cached at a hash-addressed key and
  progress is checkpointed as it goes, so an interruption (quota, timeout, redeploy)
  never corrupts a chapter — it just stops and resumes.
- **Auth**: a single hardcoded-user gate (`Udin` / `Password123!`) keeps the app and
  our credits from being open to the world. Dev-only; replace before public launch.
- Secrets live only in server env / route handlers: `RUSTFS_ENDPOINT`,
  `RUSTFS_REGION`, `RUSTFS_BUCKET`, `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY`,
  `AUTH_SECRET`, `ELEVENLABS_API_KEY`, `OPENCODE_API_KEY`. Never `NEXT_PUBLIC_`.

## 3. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router (repo-local docs required, see AGENTS.md), React 19, TS |
| Styling | Tailwind v4 + shadcn/ui, Catppuccin **Macchiato** theme |
| Storage & state | RustFS (S3) via `@aws-sdk/client-s3`, `forcePathStyle: true`, SigV4 |
| Jobs | Vercel Workflows (durable); fallback: `/api/jobs/tick` batch loop |
| Context LLM | OpenCode Go, OpenAI-compatible, `glm-5.3-flash`, JSON output |
| TTS v1 | ElevenLabs `eleven_flash_v2_5` (0.5 credits/char) + `eleven_multilingual_v2` option |
| Auth | Hardcoded single-user gate (`Udin` / `Password123!`), cookie session |

## 4. Object layout in RustFS

No database — everything is keyed objects. IDs are derived from keys, not generated
by a DB (chapters addressed by `bookId` + `idx`).

```
books/{bookId}/meta.json                  book metadata + chapter index
books/{bookId}/source.epub                original upload
books/{bookId}/cover.jpg
books/{bookId}/progress.json              resume position
books/{bookId}/chapters/{idx}/meta.json   title, status, char count, ingest summary
books/{bookId}/chapters/{idx}/text.json   source paragraphs
books/{bookId}/chapters/{idx}/chunks.json chunk list: text, tags, audio ref, status
jobs/{bookId}/{idx}.json                  conversion job progress (done/total/resumeFrom)
cache/audio/{contentHash}.mp3             global dedup audio cache (hash-addressed)
settings.json                             voice, speed, pause multiplier
```

- **Library listing**: `ListObjectsV2(prefix="books/", delimiter="/")` to get book
  IDs, then read each `meta.json`. No central index object to keep in sync.
- **Concurrency**: last-write-wins is acceptable for single-user v1. For safer
  updates use `If-Match` on the object ETag (conditional put) when rewriting
  `chunks.json` / `progress.json`.
- **Chunk cache key**: `sha256(normalized_text + model + voice + voice_settings)` so
  cache hits are free and changing voice/settings re-renders only what changed. The
  object key itself is the hash — a `HEAD` before synthesis is the cache check.

## 5. Pipeline detail

Chapter status: `imported -> ingested -> converting -> ready`, plus `partial`
(interrupted, resumable) and `failed` (terminal until retried).

### Import
Upload EPUB -> parse zip (`container.xml` -> OPF -> spine) -> extract title/author/
cover/chapters (strip XHTML to paragraphs, keep heading hierarchy). Put
`source.epub`, `cover.jpg`, `meta.json`, and each chapter's `text.json`; chapter
status `imported`. Return immediately.

### Ingest (per chapter, explicit)
Triggered by the chapter's `[Ingest]` button.
1. Chunk: paragraphs -> merge short ones -> split on sentence boundaries to
   <= 2400 chars (safe under the 2500 per-generation cap).
2. Tag: batch ~10 chunks per LLM call to `glm-5.3-flash`, JSON out:
   `{ idx, kind: dialogue|narration|heading|quote|list|footnote, emotion: ..., speakerHint?, pauseAfter: none|short|long, rateDelta }`.
3. Write `chunks.json` (tagged); chapter status `ingested`.

### Convert (per chapter, explicit + resumable)
Triggered by the chapter's `[Convert]` button.
1. `POST /api/chapters/:id/convert` sets status `converting`, writes
   `jobs/{bookId}/{idx}.json` (`done`/`total`), starts the workflow.
2. Workflow processes **one chunk at a time**:
   - `HEAD cache/audio/{hash}.mp3`; on miss call ElevenLabs
     `POST /v1/text-to-speech/{voice_id}` (`xi-api-key`), flash model, settings from
     tags; `PUT` the MP3 to RustFS at its hash key.
   - **checkpoint** before continuing: rewrite `chunks.json` (chunk now has an audio
     ref) and the job object (`done`, `resumeFrom`). Nothing in memory only.
   - transient 429/5xx retry with backoff.
3. On completion chapter status `ready`; UI button becomes **Play**.
4. **Quota-safe failure.** A hard quota/credit error (or repeated failures) stops the
   run cleanly: already-synthesized chunks stay cached and valid, chapter becomes
   `partial` with `resumeFrom` set, and the button offers **Resume convert**. No
   re-billing for completed chunks, no corruption.
5. Cost guard: estimate chars before starting; compare to remaining monthly budget;
   warn/block if over; default to flash model to stretch credits.

### Play
- Read `chunks.json` -> list `cache/audio/*` keys -> play sequentially via one
  `HTMLAudioElement` (tiny inter-chunk gaps for v1).
- Audio streamed through `/api/audio/:hash`, a server-side RustFS proxy that
  forwards `Range` (required for seeking on mobile Safari). Presigned GET URLs are a
  later optimization if RustFS is reachable from the browser.
- `MediaSession` metadata + play/pause/prev/next/skip handlers (lock screen).
- Persist `progress.json` (chapter idx + position ms), throttled; resume on open.
- Highlight current chunk; upgrade to per-word via ElevenLabs `with-timestamps`
  alignment (also gives accurate durations). Prefetch next chunk.

## 6. API surface

All routes sit behind the login gate (session cookie).

```
POST   /api/auth/login                hardcoded Udin / Password123!
POST   /api/auth/logout
POST   /api/books                     multipart EPUB -> parse + chapters
GET    /api/books                     library list (derived from RustFS)
GET    /api/books/:id                 book + chapters + statuses + progress
DELETE /api/books/:id
POST   /api/chapters/:id/ingest       chunk + tag (explicit per-chapter action)
POST   /api/chapters/:id/convert      start or resume conversion, returns job status
GET    /api/chapters/:id              chunks + tags + audio refs + status
GET    /api/chapters/:id/events       SSE progress (optional; else poll)
GET    /api/audio/:hash               stream MP3 from RustFS (Range-aware proxy)
GET/PUT /api/books/:id/progress       resume position
GET/PUT /api/settings                 voice, speed, pause multiplier
```

`:id` for a chapter is `{bookId}/{idx}` (composite, since there is no DB row id).

## 7. Design — shadcn/ui + Catppuccin Macchiato

Palette (Macchiato) mapped onto shadcn CSS tokens in `globals.css`:

| Token | Hex | Source |
|---|---|---|
| `--background` / `--foreground` | `#24273a` / `#cad3f5` | Base / Text |
| `--card` | `#1e2030` | Mantle |
| `--popover` | `#24273a` | Base |
| `--primary` / `--primary-foreground` | `#c6a0f6` / `#181926` | Mauve / Crust |
| `--secondary` | `#363a4f` | Surface0 |
| `--muted` / `--muted-foreground` | `#363a4f` / `#a5adcb` | Surface0 / Subtext0 |
| `--accent` | `#494d64` | Surface1 (hover) |
| `--destructive` | `#ed8796` | Red |
| `--border` / `--input` | `#494d64` | Surface1 |
| `--ring` | `#b7bdf8` | Lavender |
| success (custom) | `#a6da95` | Green |
| charts | Blue `#8aadf4`, Teal `#8bd5ca`, Peach `#f5a97f`, Mauve, Green | — |

Screens (mobile-first, bottom nav, safe-area insets, large tap targets):

1. **Library `/`** — book grid/list, prominent import FAB, empty state.
2. **Book `/book/:id`** — chapter list. Primary action per row walks
   `[Ingest] -> [Convert] -> spinner+progress -> [Play]`, plus a **Resume convert**
   state after a partial/quota interruption. Voice + reading settings in a bottom
   sheet.
3. **Player `/book/:id/play/:idx`** — cover, synced text/highlight, transport
   (back 15 / play / fwd 15), speed, chapter jump. Mini-player persists across routes.
4. **Login `/login`** — minimal Macchiato card, hardcoded gate.

## 8. Repo layout (under existing `src/`)

```
src/app/                      routes + api route handlers
src/components/ui/            shadcn primitives
src/components/{library,chapters,player}/
src/lib/storage/              s3.ts (client), keys.ts (object layout), objects.ts (get/put/list)
src/lib/store/                books.ts, chapters.ts, jobs.ts, progress.ts, settings.ts
src/lib/epub/                 parse.ts, chunk.ts
src/lib/ingest/               prompt.ts, tag.ts
src/lib/tts/                  types.ts, elevenlabs.ts, engine.ts
src/lib/jobs/                 workflow.ts, tick.ts (fallback)
src/lib/auth.ts               hardcoded single-user session
src/lib/budget.ts             monthly char meter (settings.json)
```

## 9. Phases (each ends in a reviewable PR)

- **P0 Foundation** — `npm install`, read `node_modules/next/dist/docs/` (Next 16
  rules), shadcn init + Macchiato tokens, RustFS S3 client + object-layout helpers,
  hardcoded login gate (`Udin` / `Password123!`), env template, `/api/health`
  (checks RustFS reachable + bucket exists).
- **P1 Import** — EPUB parse + persist objects, library + book chapter-list UI.
- **P2 Ingest** — explicit per-chapter ingest action + chunker + OpenCode Go tagging,
  chapter statuses and action progression.
- **P3 Convert** — ElevenLabs engine + RustFS cache + checkpointed Workflow +
  quota-safe partial/resume + progress UI (Convert -> Play).
- **P4 Play** — chapter player, Range proxy, MediaSession, resume, highlight, speed.
- **P5 Polish** — budget meter, resume/error UX, README/AGENTS updates, and swap the
  hardcoded gate for Auth.js/Clerk before any public deploy.

## 10. Risks & open questions

- **DB-less state**: no transactions and no queries — rely on key layout,
  `ListObjectsV2`, and conditional writes. Fine for single-user; revisit if
  multi-user (per-user prefixes at minimum).
- **RustFS reachability/TLS**: Vercel functions must reach the endpoint. Keep the
  key server-side and proxy audio; do not assume the browser can hit RustFS directly.
- **Path-style addressing**: RustFS/MinIO need `forcePathStyle: true`; confirm region
  string (e.g. `us-east-1`) and SigV4.
- **Range support** through the audio proxy is mandatory for mobile seeking.
- **Hardcoded credentials**: `Udin` / `Password123!` is dev-only and unsafe in
  public — it exists mainly to stop the Convert button from burning credits. Replace
  with real auth before any public deploy.
- **ElevenLabs free tier**: 10k credits/mo (~10 min), per-generation cap 2,500 chars,
  **no commercial license**, API access on free tier uncertain. Mitigation: flash
  model, aggressive cache/dedup, engine interface so we can swap providers.
- **Workflows availability**: confirm on our Vercel plan; fallback tick loop provided.
- **Next.js 16**: APIs/conventions differ from training data — read local docs first.
- **DRM EPUBs**: unsupported; fail gracefully.

## 11. Decisions needed

1. Auth when going public: Auth.js (self-hosted) vs Clerk (managed). (Hardcoded gate
   is fine for now.)
2. Default voice + reading settings for v1.

Resolved: RustFS endpoint `https://cdn.x1nx3r.dev` (public via Cloudflare), bucket
`audiobook`, region `us-east-1`. Bucket creation pending a valid access key.
