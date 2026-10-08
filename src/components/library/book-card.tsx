"use client";

import Link from "next/link";
import { BookText, Play } from "lucide-react";

import { usePlayer } from "@/components/player/player-provider";
import { formatAuthors } from "@/lib/format";
import type { BookMeta } from "@/lib/store/books";

export function BookCard({ book }: { book: BookMeta }) {
  const player = usePlayer();
  const firstReady = book.chapters.find((chapter) => chapter.status === "ready")?.idx ?? null;

  return (
    <div className="group relative flex flex-col gap-3 rounded-lg p-3 transition-colors hover:bg-card">
      <div className="relative">
        <Link
          href={`/book/${book.id}`}
          className="block aspect-[2/3] overflow-hidden rounded-md bg-secondary"
        >
          {book.coverContentType ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/books/${book.id}/cover`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-text-secondary">
              <BookText className="size-8" />
            </span>
          )}
        </Link>
        {firstReady !== null ? (
          <button
            type="button"
            aria-label={`Play ${book.title}`}
            onClick={() => player.load({ bookId: book.id, idx: firstReady })}
            className="absolute right-3 bottom-3 flex size-11 translate-y-2 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-elevated transition-all group-hover:translate-y-0 group-hover:opacity-100 hover:brightness-110 focus-visible:translate-y-0 focus-visible:opacity-100"
          >
            <Play className="size-5 fill-current" />
          </button>
        ) : null}
      </div>

      <div className="min-w-0">
        <Link href={`/book/${book.id}`} className="block truncate text-sm font-bold hover:underline">
          {book.title}
        </Link>
        <p className="truncate text-xs text-text-secondary">{formatAuthors(book.author)}</p>
        <p className="truncate text-xs text-text-secondary">{book.chapterCount} chapters</p>
      </div>
    </div>
  );
}
