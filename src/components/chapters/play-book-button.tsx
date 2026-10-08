"use client";

import { Play } from "lucide-react";

import { usePlayer } from "@/components/player/player-provider";
import { Button } from "@/components/ui/button";

export function PlayBookButton({
  bookId,
  firstReadyIdx,
}: {
  bookId: string;
  firstReadyIdx: number;
}) {
  const player = usePlayer();
  return (
    <Button
      className="gap-2"
      onClick={() => player.load({ bookId, idx: firstReadyIdx })}
      aria-label="Play book"
    >
      <Play className="size-4 fill-current" />
      Play
    </Button>
  );
}
