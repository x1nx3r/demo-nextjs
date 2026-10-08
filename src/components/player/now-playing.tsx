"use client";

import { useEffect } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { usePlayer } from "@/components/player/player-provider";

const SPEEDS = [0.8, 1, 1.25, 1.5, 2];

function stripTags(value: string): string {
  return value.replace(/\[[^\]\n]{1,40}\]/g, "").replace(/\s{2,}/g, " ").trim();
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function NowPlaying({ bookId, idx }: { bookId: string; idx: number }) {
  const player = usePlayer();
  const { data, index, playing, currentTime, duration, speed } = player;

  useEffect(() => {
    if (data && data.bookId === bookId && data.idx === idx) return;
    void player.load({ bookId, idx });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, idx, data?.bookId, data?.idx]);

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-text-secondary">{player.error ?? "Loading…"}</p>
      </div>
    );
  }

  if (data.units.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-text-secondary">This chapter has no audio yet.</p>
      </div>
    );
  }

  const current = data.units[index];

  return (
    <div className="flex w-full flex-col gap-8 px-6 pt-8 pb-12">
      <header className="flex flex-col gap-6 md:flex-row md:items-end">
        <div className="relative aspect-square w-40 shrink-0 overflow-hidden rounded-md bg-card">
          {data.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-bold tracking-wide text-text-secondary uppercase">
            {data.bookTitle}
          </p>
          <h1 className="font-heading text-3xl leading-tight font-bold tracking-tight">
            {data.chapterTitle}
          </h1>
          <p className="text-sm text-text-secondary">
            {data.author} · Part {index + 1} of {data.units.length}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => player.prevUnit()}
            aria-label="Previous part"
          >
            <SkipBack className="size-5 fill-current" />
          </Button>
          <Button
            size="icon-lg"
            className="rounded-full"
            onClick={() => player.toggle()}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => player.nextUnit()}
            aria-label="Next part"
          >
            <SkipForward className="size-5 fill-current" />
          </Button>

          <span className="ml-2 w-10 text-right text-xs tabular-nums text-text-secondary">
            {fmt(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={Number.isFinite(duration) ? duration : 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => player.seek(Number(event.target.value))}
            aria-label="Seek"
            className="h-1 flex-1 cursor-pointer accent-primary"
          />
          <span className="w-10 text-xs tabular-nums text-text-secondary">{fmt(duration)}</span>

          <div className="ml-2 hidden items-center gap-1 sm:flex">
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => player.setSpeed(value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
                  speed === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-text-secondary hover:text-foreground",
                )}
              >
                {value}×
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold tracking-wide text-text-secondary uppercase">Queue</h2>
        <ul className="flex flex-col">
          {data.units.map((unit, i) => (
            <li key={unit.id}>
              <button
                type="button"
                onClick={() => player.jumpTo(i)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors",
                  i === index ? "bg-secondary" : "hover:bg-secondary/60",
                )}
              >
                <span className="w-6 shrink-0 pt-0.5 text-right text-xs tabular-nums text-text-secondary">
                  {i === index && playing ? (
                    <span className="text-brand">▶</span>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="min-w-0">
                  {unit.lines.map((line, li) => (
                    <span
                      key={li}
                      className={cn(
                        "block truncate text-sm",
                        i === index ? "text-foreground" : "text-foreground/80",
                      )}
                    >
                      {line.speakerHint ? (
                        <span className="mr-1.5 text-xs font-bold text-brand/90">
                          {line.speakerHint}
                        </span>
                      ) : null}
                      {stripTags(line.text)}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
