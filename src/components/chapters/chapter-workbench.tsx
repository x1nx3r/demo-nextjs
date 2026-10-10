"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Info,
  Loader2,
  Play,
  Sparkles,
  Square,
  Wand2,
  XCircle,
} from "lucide-react";

import { CastRail } from "@/components/chapters/cast-rail";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { formatChars } from "@/lib/format";
import type { ChapterScript, RenderUnit } from "@/lib/ingest/types";
import type { ChapterStatus } from "@/lib/store/books";
import type { ChapterJob, JobEvent } from "@/lib/store/jobs";
import type { Cast, VoiceRef } from "@/lib/tts/types";

type ChapterView = {
  title: string;
  charCount: number;
  status: ChapterStatus;
  unitCount?: number;
  unitsDone?: number;
};

const PHASE_LABEL: Record<ChapterStatus, string> = {
  imported: "Imported",
  ingested: "Planned",
  converting: "Rendering",
  partial: "Partial",
  ready: "Ready",
  failed: "Failed",
};

function unitChars(unit: RenderUnit): number {
  return unit.type === "speech"
    ? unit.text.length
    : unit.lines.reduce((sum, line) => sum + line.text.length, 0);
}

function time(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}

function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const LEVEL_STYLES: Record<JobEvent["level"], { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "text-muted-foreground" },
  warn: { icon: AlertTriangle, className: "text-warning" },
  error: { icon: XCircle, className: "text-destructive" },
};

export function ChapterWorkbench({
  bookId,
  idx,
  bookTitle,
  chapter,
  initialScript,
  initialJob,
  initialCast,
  initialPool,
}: {
  bookId: string;
  idx: number;
  bookTitle: string;
  chapter: ChapterView;
  initialScript: ChapterScript | null;
  initialJob: ChapterJob | null;
  initialCast: Cast | null;
  initialPool: VoiceRef[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ChapterStatus>(chapter.status);
  const [script, setScript] = useState<ChapterScript | null>(initialScript);
  const [job, setJob] = useState<ChapterJob | null>(initialJob);
  const [busy, setBusy] = useState<null | "ingest" | "convert">(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [cast, setCast] = useState<Cast | null>(initialCast);
  const [castLoading, setCastLoading] = useState(false);
  const [pool, setPool] = useState<VoiceRef[]>(initialPool);
  const [saving, setSaving] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  const activeRef = useRef(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current = busy !== null || status === "converting" || job?.running === true;
  });

  async function refresh() {
    try {
      const [jobRes, chapterRes] = await Promise.all([
        fetch(`/api/chapters/${bookId}/${idx}/job`, { cache: "no-store" }),
        fetch(`/api/chapters/${bookId}/${idx}`, { cache: "no-store" }),
      ]);
      if (jobRes.ok) {
        const payload = (await jobRes.json()) as { job: ChapterJob | null };
        setJob(payload.job);
      }
      if (chapterRes.ok) {
        const payload = (await chapterRes.json()) as { chapter: ChapterView; script: ChapterScript | null };
        setStatus(payload.chapter.status);
        setScript(payload.script);
      }
      setNow(Date.now());
    } catch {
      // ignore transient poll errors
    }
  }

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await refresh();
      if (!stop) timer = setTimeout(tick, activeRef.current ? 1200 : 4000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, idx]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job?.events.length]);

  async function loadCast() {
    setCastLoading(true);
    try {
      const res = await fetch(`/api/books/${bookId}/cast`, { cache: "no-store" });
      if (res.ok) {
        const payload = (await res.json()) as { cast: Cast | null; pool?: VoiceRef[] };
        setCast(payload.cast);
        if (payload.pool) setPool(payload.pool);
      }
    } catch {
      // best-effort
    } finally {
      setCastLoading(false);
    }
  }

  async function changeVoice(target: string, voiceId: string) {
    setSaving(target);
    try {
      const res = await fetch(`/api/books/${bookId}/cast`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, voiceId }),
      });
      if (res.ok) {
        const payload = (await res.json()) as { cast: Cast | null; pool?: VoiceRef[] };
        setCast(payload.cast);
        if (payload.pool) setPool(payload.pool);
        await refresh();
        router.refresh();
      }
    } catch {
      // best-effort
    } finally {
      setSaving(null);
    }
  }

  useEffect(() => {
    void loadCast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  async function act(action: "ingest" | "convert") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/chapters/${bookId}/${idx}/${action}`, { method: "POST" });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok && res.status !== 202) setError(payload?.error ?? "Something went wrong");
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
      await refresh();
      void loadCast();
      router.refresh();
    }
  }

  async function stopRender() {
    setStopping(true);
    try {
      await fetch(`/api/chapters/${bookId}/${idx}/stop`, { method: "POST" });
      await refresh();
    } catch {
      // best-effort
    } finally {
      setStopping(false);
    }
  }

  const units = script?.units ?? [];
  const totalUnits = units.length;
  const renderedUnits = units.filter((u) => u.audio).length;
  const totalChars = units.reduce((sum, u) => sum + unitChars(u), 0);
  const renderedChars = units.filter((u) => u.audio).reduce((sum, u) => sum + unitChars(u), 0);
  const percent = totalUnits > 0 ? (renderedUnits / totalUnits) * 100 : 0;

  const planned = status !== "imported";
  const rendering = status === "converting" || (job?.running === true && job.phase === "rendering");
  const canPlay = renderedUnits > 0;
  const running = job?.running === true;

  const eta = useMemo(() => {
    if (!job || !running || job.done === 0 || job.total === 0 || now === 0) return null;
    const elapsed = now - job.startedAt;
    return (elapsed / job.done) * (job.total - job.done);
  }, [job, running, now]);

  const steps = [
    { label: "Imported", state: "done" as const },
    { label: "Planned", state: planned ? ("done" as const) : ("todo" as const) },
    {
      label: "Rendering",
      state: status === "ready" ? ("done" as const) : rendering ? ("active" as const) : planned && renderedUnits > 0 ? ("done" as const) : ("todo" as const),
    },
    { label: "Playable", state: canPlay ? ("done" as const) : ("todo" as const) },
  ];

  return (
    <div className="flex w-full flex-col gap-6 px-6 pt-8 pb-12 xl:flex-row xl:items-start">
      <main className="flex min-w-0 flex-1 flex-col gap-6">
      <Link
        href={`/book/${bookId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {bookTitle}
      </Link>

      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.7rem] font-medium",
              running ? "bg-warning/15 text-warning" : "bg-secondary text-muted-foreground",
            )}
          >
            {running ? <span className="size-1.5 animate-pulse rounded-full bg-warning" /> : null}
            {running ? (job?.phase === "planning" ? "Planning" : "Rendering") : PHASE_LABEL[status]}
          </span>
          <span className="text-xs text-muted-foreground">{formatChars(chapter.charCount)}</span>
        </div>
        <h1 className="font-heading text-xl leading-snug font-semibold">
          {idx + 1}. {chapter.title}
        </h1>
      </header>

      {/* Phase stepper */}
      <ol className="flex items-center gap-1">
        {steps.map((step, i) => (
          <li key={step.label} className="flex flex-1 items-center gap-1">
            <div className="flex flex-1 flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
                  step.state === "done" && "bg-success/20 text-success",
                  step.state === "active" && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  step.state === "todo" && "bg-secondary text-muted-foreground",
                )}
              >
                {step.state === "done" ? <Check className="size-3.5" /> : step.state === "active" ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
              </span>
              <span className={cn("text-[0.68rem]", step.state === "todo" ? "text-muted-foreground" : "text-foreground")}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 ? <span className="mb-5 h-px flex-1 bg-border" /> : null}
          </li>
        ))}
      </ol>

      {/* Progress */}
      <section className="flex flex-col gap-3 rounded-lg bg-card p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-heading text-2xl font-semibold tabular-nums">
              {renderedUnits}
              <span className="text-base text-muted-foreground">/{totalUnits || "–"}</span>
            </p>
            <p className="text-xs text-muted-foreground">units rendered</p>
          </div>
          <div className="text-right">
            <p className="text-sm tabular-nums">{formatChars(renderedChars)}</p>
            <p className="text-xs text-muted-foreground">
              {totalChars > 0 ? `of ${formatChars(totalChars)}` : "not planned"}
            </p>
          </div>
        </div>

        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full bg-gradient-to-r from-primary to-[var(--ring)] transition-[width] duration-500",
              running && "animate-pulse",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{percent.toFixed(0)}% complete</span>
          <span>
            {totalUnits > 0 ? `${totalUnits - renderedUnits} units left` : ""}
            {eta != null ? ` · ~${duration(eta)} left` : ""}
          </span>
        </div>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {canPlay ? (
          <Link href={`/book/${bookId}/play/${idx}`} className={cn(buttonVariants(), "gap-1.5")}>
            <Play className="size-4 fill-current" />
            {renderedUnits < totalUnits ? "Play partial" : "Play"}
          </Link>
        ) : null}

        {status === "imported" || status === "failed" ? (
          <Button className="gap-1.5" disabled={busy !== null} onClick={() => act("ingest")}>
            {busy === "ingest" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {busy === "ingest" ? "Planning…" : "Plan chapter"}
          </Button>
        ) : status === "ingested" || status === "partial" ? (
          <Button variant="secondary" className="gap-1.5" disabled={busy !== null} onClick={() => act("convert")}>
            {busy === "convert" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busy === "convert" ? "Rendering…" : status === "partial" ? "Resume render" : "Render chapter"}
          </Button>
        ) : status === "converting" ? (
          <Button variant="secondary" disabled className="gap-1.5">
            <Loader2 className="size-4 animate-spin" />
            Rendering…
          </Button>
        ) : null}

        {busy === "convert" || status === "converting" || (job?.running === true && job.phase === "rendering") ? (
          <Button variant="outline" className="gap-1.5" disabled={stopping} onClick={stopRender}>
            {stopping ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-3.5 fill-current" />}
            {stopping ? "Stopping…" : "Stop"}
          </Button>
        ) : null}

        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>

      {/* Activity log */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Activity</h2>
          {job ? <span className="text-xs text-muted-foreground">updated {time(job.updatedAt)}</span> : null}
        </div>
        <div
          ref={logRef}
          className="h-64 overflow-y-auto rounded-lg bg-[#0d0d0d] p-3 font-mono text-xs leading-relaxed"
        >
          {!job || job.events.length === 0 ? (
            <p className="text-muted-foreground">No activity yet.</p>
          ) : (
            job.events.map((event, i) => {
              const style = LEVEL_STYLES[event.level];
              const Icon = style.icon;
              return (
                <div key={i} className="flex items-start gap-2 py-0.5">
                  <span className="shrink-0 text-muted-foreground/60 tabular-nums">{time(event.at)}</span>
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", style.className)} />
                  <span className={style.className === "text-muted-foreground" ? "text-foreground/80" : style.className}>
                    {event.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>
      </main>

      <aside className="w-full xl:w-80 xl:shrink-0">
        <CastRail
          cast={cast}
          pool={pool}
          loading={castLoading}
          saving={saving}
          onChange={changeVoice}
        />
      </aside>
    </div>
  );
}
