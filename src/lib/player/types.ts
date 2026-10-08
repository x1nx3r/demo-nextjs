import type { PauseAfter } from "@/lib/ingest/types";

export type PlayableLine = { text: string; speakerHint: string | null };

export type PlayableUnit = {
  id: number;
  type: "speech" | "dialogue";
  text: string;
  lines: PlayableLine[];
  pauseAfter: PauseAfter;
  hash: string;
};

/** Everything the global player needs for one chapter. */
export type NowPlayingData = {
  bookId: string;
  idx: number;
  bookTitle: string;
  author: string;
  coverUrl: string | null;
  chapterTitle: string;
  units: PlayableUnit[];
  prevIdx: number | null;
  nextIdx: number | null;
};
