"use client";

import Link from "next/link";
import { ListMusic, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { cn } from "cn";

import { Button, buttonVariants } from "@/components/ui/button";
import { usePlayer } from "@/components/player/player-provider";

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function NowPlayingBar() {
  const player = usePlayer();
  const { data, playing, currentTime, duration, volume, needsGesture, upNext } = player;

  if (!data || data.units.length === 0) {
    return (
      <footer className="flex h-[72px] shrink-0 items-center justify-center border-t border-border bg-background px-4">
        <p className="text-xs text-text-secondary">
          {data ? "Nothing rendered in this chapter yet" : "Nothing playing"}
        </p>
      </footer>
    );
  }

  const playHref = `/book/${data.bookId}/play/${data.idx}`;

  return (
    <footer className="relative flex h-[72px] shrink-0 items-center gap-4 border-t border-border bg-background px-4">
      {upNext !== null ? (
        <div className="absolute inset-x-0 bottom-full flex items-center justify-center gap-3 border-t border-border bg-card px-4 py-2 text-xs">
          <span className="text-text-secondary">Next chapter in {upNext}s</span>
          <button
            type="button"
            className="font-bold text-brand hover:underline"
            onClick={() => player.playNextChapter()}
          >
            Play now
          </button>
          <button
            type="button"
            className="text-text-secondary hover:text-foreground"
            onClick={() => player.cancelUpNext()}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {/* Left: art + titles */}
      <div className="flex min-w-0 items-center gap-3 md:w-[30%]">
        <Link
          href={playHref}
          className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-secondary"
        >
          {data.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </Link>
        <div className="min-w-0">
          <Link href={playHref} className="block truncate text-sm hover:underline">
            {data.chapterTitle}
          </Link>
          <p className="truncate text-xs text-text-secondary">{data.bookTitle}</p>
        </div>
      </div>

      {/* Center: transport + scrubber */}
      <div className="flex flex-1 flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => player.prevUnit()} aria-label="Previous part">
            <SkipBack className="size-4 fill-current" />
          </Button>
          <Button
            size="icon"
            className="rounded-full"
            onClick={() => player.toggle()}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => player.nextUnit()} aria-label="Next part">
            <SkipForward className="size-4 fill-current" />
          </Button>
        </div>
        {needsGesture ? (
          <p className="hidden text-[10px] text-text-secondary md:block">
            Autoplay blocked — tap play
          </p>
        ) : (
          <div className="hidden w-full max-w-md items-center gap-2 md:flex">
            <span className="w-9 text-right text-[10px] tabular-nums text-text-secondary">
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
            <span className="w-9 text-[10px] tabular-nums text-text-secondary">{fmt(duration)}</span>
          </div>
        )}
      </div>

      {/* Right: volume + queue */}
      <div className="hidden items-center justify-end gap-3 md:flex md:w-[30%]">
        <Volume2 className="size-4 text-text-secondary" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(event) => player.setVolume(Number(event.target.value))}
          aria-label="Volume"
          className="h-1 w-24 cursor-pointer accent-primary"
        />
        <Link
          href={playHref}
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
          aria-label="Now playing"
        >
          <ListMusic className="size-4" />
        </Link>
      </div>
    </footer>
  );
}
