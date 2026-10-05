import Link from "next/link";
import { BookText } from "lucide-react";

import { formatAuthors } from "@/lib/format";
import type { BookMeta } from "@/lib/store/books";

export function BookCard({ book }: { book: BookMeta }) {
  return (
    <Link href={`/book/${book.id}`} className="group flex flex-col gap-2">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
        {book.coverContentType ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/books/${book.id}/cover`}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <BookText className="size-8" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium group-hover:text-primary">
          {book.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {formatAuthors(book.author)}
        </p>
        <p className="text-xs text-muted-foreground">
          {book.chapterCount} chapters
        </p>
      </div>
    </Link>
  );
}
