import { notFound } from "next/navigation";
import { BookText } from "lucide-react";

import { ChapterList } from "@/components/chapters/chapter-list";
import { PlayBookButton } from "@/components/chapters/play-book-button";
import { formatAuthors, formatChars } from "@/lib/format";
import { getBook } from "@/lib/store/books";

export const dynamic = "force-dynamic";

export default async function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) notFound();

  const ready = book.chapters.filter((chapter) => chapter.status === "ready").length;
  const firstReady = book.chapters.find((chapter) => chapter.status === "ready")?.idx ?? null;

  return (
    <div className="flex w-full flex-col gap-8 px-6 pt-8 pb-12">
      <header className="flex flex-col gap-6 md:flex-row md:items-end">
        <div className="relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-md bg-card">
          {book.coverContentType ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/books/${book.id}/cover`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-secondary">
              <BookText className="size-8" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-xs font-bold tracking-wide text-text-secondary uppercase">Book</p>
          <h1 className="font-heading text-4xl leading-tight font-bold tracking-tight">
            {book.title}
          </h1>
          <p className="text-sm text-text-secondary">
            {formatAuthors(book.author)} · {book.chapterCount} chapters ·{" "}
            {formatChars(book.charCount)}
          </p>
          <div className="flex items-center gap-3">
            {firstReady !== null ? (
              <PlayBookButton bookId={book.id} firstReadyIdx={firstReady} />
            ) : null}
            <p className="text-xs text-text-secondary">
              {ready}/{book.chapterCount} ready
            </p>
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold tracking-tight">Chapters</h2>
        <div className="rounded-lg bg-card/40 p-1">
          <ChapterList bookId={book.id} chapters={book.chapters} />
        </div>
      </section>
    </div>
  );
}
