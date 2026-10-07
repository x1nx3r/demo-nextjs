import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookText } from "lucide-react";

import { ChapterList } from "@/components/chapters/chapter-list";
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-5 pt-6 pb-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Library
      </Link>

      <header className="flex gap-4">
        <div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
          {book.coverContentType ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/books/${book.id}/cover`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <BookText className="size-6" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-xl leading-snug font-semibold">
            {book.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatAuthors(book.author)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {book.chapterCount} chapters · {formatChars(book.charCount)}
          </p>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Chapters</h2>
          <p className="text-xs text-muted-foreground">
            Ingest and conversion arrive in P2/P3
          </p>
        </div>
        <ChapterList chapters={book.chapters} />
      </section>
    </main>
  );
}
