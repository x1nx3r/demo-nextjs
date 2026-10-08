/**
 * Per-chapter job state, persisted in RustFS. The worker (planner, convert)
 * appends events and progress here; the UI polls it. Because it is durable, a
 * reload, a redeploy or a timeout never loses progress: the job plus the
 * script's per-unit audio refs are enough to resume.
 */

import { jobKey } from "@/lib/storage/keys";

import { getJson, putJson } from "./objects";

export type JobLevel = "info" | "warn" | "error";
export type JobPhase = "idle" | "planning" | "rendering";

export type JobEvent = {
  at: number;
  level: JobLevel;
  phase: JobPhase;
  message: string;
};

export type ChapterJob = {
  bookId: string;
  idx: number;
  phase: JobPhase;
  running: boolean;
  done: number;
  total: number;
  chars: number;
  startedAt: number;
  updatedAt: number;
  events: JobEvent[];
};

const MAX_EVENTS = 250;

export async function getJob(bookId: string, idx: number): Promise<ChapterJob | null> {
  return getJson<ChapterJob>(jobKey(bookId, idx));
}

export function newJob(bookId: string, idx: number, phase: JobPhase): ChapterJob {
  const now = Date.now();
  return {
    bookId,
    idx,
    phase,
    running: true,
    done: 0,
    total: 0,
    chars: 0,
    startedAt: now,
    updatedAt: now,
    events: [],
  };
}

export async function saveJob(job: ChapterJob): Promise<void> {
  await putJson(jobKey(job.bookId, job.idx), job);
}

/**
 * Load the existing job and start a new run, or create one. Events are kept
 * across phases so the activity log is a full history; only the timing resets.
 */
export async function loadOrCreateJob(
  bookId: string,
  idx: number,
  phase: JobPhase,
): Promise<ChapterJob> {
  const existing = await getJob(bookId, idx);
  const now = Date.now();
  if (existing && Array.isArray(existing.events)) {
    existing.phase = phase;
    existing.running = true;
    existing.startedAt = now;
    existing.updatedAt = now;
    return existing;
  }
  return newJob(bookId, idx, phase);
}

export async function logEvent(job: ChapterJob, level: JobLevel, message: string): Promise<void> {
  job.events.push({ at: Date.now(), level, phase: job.phase, message });
  if (job.events.length > MAX_EVENTS) job.events.splice(0, job.events.length - MAX_EVENTS);
  job.updatedAt = Date.now();
  await saveJob(job);
}

export async function setProgress(
  job: ChapterJob,
  patch: Partial<Pick<ChapterJob, "done" | "total" | "chars" | "phase" | "running">>,
): Promise<void> {
  Object.assign(job, patch);
  job.updatedAt = Date.now();
  await saveJob(job);
}
