import { Button } from "@/components/ui/button";
import { BookCard } from "@/components/library/book-card";
import { UploadEpub } from "@/components/library/upload-epub";
import { listBooks } from "@/lib/store/books";

import { logout } from "./actions";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const books = await listBooks();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-5 pt-8 pb-28">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">EPUB to audiobook</p>
          <h1 className="font-heading text-2xl font-semibold">Library</h1>
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      {books.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-card p-10 text-center ring-1 ring-foreground/10">
          <p className="font-medium">Your library is empty</p>
          <p className="text-sm text-muted-foreground">
            Import an EPUB to get started.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {books.map((book) => (
            <li key={book.id}>
              <BookCard book={book} />
            </li>
          ))}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <UploadEpub />
        </div>
      </div>
    </main>
  );
}
