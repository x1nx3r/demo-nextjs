import { BookPlus } from "lucide-react";

import { BookGrid } from "@/components/library/book-grid";
import { listBooks } from "@/lib/store/books";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const books = await listBooks();

  return (
    <div className="flex w-full flex-col gap-6 px-6 pt-8 pb-12">
      <header>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {books.length === 0
            ? "No books yet"
            : `${books.length} book${books.length === 1 ? "" : "s"}`}
        </p>
      </header>

      {books.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-card p-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <BookPlus className="size-6" />
          </div>
          <div>
            <p className="font-medium">Your library is empty</p>
            <p className="text-sm text-text-secondary">Import an EPUB to get started.</p>
          </div>
        </div>
      ) : (
        <BookGrid books={books} />
      )}
    </div>
  );
}
