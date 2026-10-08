"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Play, Sparkles, Wand2 } from "lucide-react";

import { usePlayer } from "@/components/player/player-provider";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { formatChars } from "@/lib/format";
import type { ChapterMeta, ChapterStatus } from "@/lib/store/books";

const STATUS_LABELS: Record<ChapterStatus, string> = {
  imported: "Imported",
  ingested: "Planned",
  converting: "Rendering",
  partial: "Partial",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_CLASSES: Record<ChapterStatus, string> = {
  imported: "bg-secondary text-text-secondary",
  ingested: "bg-info/15 text-info",
  converting: "bg-warning/15 text-warning",
  partial: "bg-warning/15 text-warning",
  ready: "bg-primary/15 text-primary",
  failed: "bg-destructive/15 text-destructive",
};

type Progress = { done: number; total: number };

export function ChapterRow({ bookId, chapter }: { bookId: string; chapter: ChapterMeta }) {
  const router = useRouter();
  const player = usePlayer();
  const [status, setStatus] = useState<ChapterStatus>(chapter.status);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const href = `/book/${bookId}/chapter/${chapter.idx}`;
  const canPlay = status === "ready" || (status === "partial" && (chapter.unitsDone ?? 0) > 0);

  function stopPolling() {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }

  function startPolling() {
    stopPolling();
    timer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/chapters/${bookId}/${chapter.idx}`, { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as { script?: { units?: { audio?: string | null }[] } };
        const units = payload.script?.units ?? [];
        if (units.length > 0) {
          setProgress({ done: units.filter((u) => u.audio).length, total: units.length });
        }
      } catch {
        // ignore transient poll errors
      }
    }, 1500);
  }

  async function run(action: "ingest" | "convert") {
    setBusy(true);
    setError(null);
    if (action === "convert") {
      setStatus("converting");
      startPolling();
    }

    try {
      const res = await fetch(`/api/chapters/${bookId}/${chapter.idx}/${action}`, { method: "POST" });
      const payload = (await res.json().catch(() => null)) as
        | { status?: ChapterStatus; error?: string }
        | null;

      if (!res.ok && res.status !== 202) {
        setError(payload?.error ?? "Something went wrong");
      } else if (payload?.status) {
        setStatus(payload.status);
      }
    } catch {
      setError("Network error");
    } finally {
      stopPolling();
      setBusy(false);
      setProgress(null);
      router.refresh();
    }
  }

  const showProgress = status === "converting" || (busy && progress);

  return (
    <li className="group flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-card-alt">
      <div className="relative flex size-6 shrink-0 items-center justify-center">
        <span
          className={cn(
            "text-xs tabular-nums text-text-secondary",
            canPlay && "group-hover:opacity-0",
          )}
        >
          {chapter.idx + 1}
        </span>
        {canPlay ? (
          <button
            type="button"
            aria-label={`Play ${chapter.title}`}
            onClick={() => player.load({ bookId, idx: chapter.idx })}
            className="absolute inset-0 flex items-center justify-center text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Play className="size-4 fill-current" />
          </button>
        ) : null}
      </div>

      <Link href={href} className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{chapter.title}</p>
        <p className="truncate text-xs text-text-secondary">
          {formatChars(chapter.charCount)}
          {chapter.unitCount ? ` · ${chapter.unitCount} units` : ""}
          {showProgress && progress ? ` · ${progress.done}/${progress.total} rendered` : ""}
        </p>
      </Link>

      {error ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-destructive" role="alert">
          <AlertCircle className="size-3.5" />
          {error}
        </span>
      ) : null}

      <span
        className={cn(
          "hidden shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-bold sm:inline",
          STATUS_CLASSES[status],
        )}
      >
        {STATUS_LABELS[status]}
      </span>

      <div className="flex shrink-0 items-center gap-2">
        {status === "imported" || status === "failed" ? (
          <Button size="sm" variant="secondary" className="gap-1.5" disabled={busy} onClick={() => run("ingest")}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
            {busy ? "Planning…" : "Plan"}
          </Button>
        ) : status === "converting" ? (
          <Button size="sm" variant="secondary" className="gap-1.5" disabled>
            <Loader2 className="size-3.5 animate-spin" />
            Rendering…
          </Button>
        ) : status === "ready" ? null : (
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={busy}
            onClick={() => run("convert")}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {busy ? "Rendering…" : status === "partial" ? "Resume" : "Render"}
          </Button>
        )}
      </div>
    </li>
  );
}
