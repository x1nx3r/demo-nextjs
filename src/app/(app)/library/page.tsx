import Link from "next/link";
import { redirect } from "next/navigation";
import { BookPlus, FileText } from "lucide-react";

import { BookGrid } from "@/components/library/book-grid";
import { getSession } from "@/lib/auth";
import { formatChars } from "@/lib/format";
import { listBooks } from "@/lib/store/books";
import { setTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  setTenant(session.uid);

  const items = await listBooks();
  const works = items.filter((book) => book.kind !== "article");
  const articles = items.filter((book) => book.kind === "article");
  const empty = items.length === 0;

  return (
    <div className="flex w-full flex-col gap-8 px-6 pt-8 pb-12">
      <header>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {empty
            ? "No books yet"
            : `${works.length} book${works.length === 1 ? "" : "s"}${
                articles.length > 0 ? ` · ${articles.length} article${articles.length === 1 ? "" : "s"}` : ""
              }`}
        </p>
      </header>

      {empty ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-card p-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <BookPlus className="size-6" />
          </div>
          <div>
            <p className="font-medium">Your library is empty</p>
            <p className="text-sm text-text-secondary">Import a book or narrate a link to get started.</p>
          </div>
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-bold tracking-tight">Books</h2>
            {works.length === 0 ? (
              <p className="text-sm text-text-secondary">No books yet.</p>
            ) : (
              <BookGrid books={works} />
            )}
          </section>

          {articles.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-bold tracking-tight">Articles</h2>
              <ul className="flex flex-col rounded-lg bg-card/40 p-1">
                {articles.map((article) => (
                  <li key={article.id}>
                    <Link
                      href={`/book/${article.id}`}
                      className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-card-alt"
                    >
                      <FileText className="size-5 shrink-0 text-text-secondary" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{article.title}</span>
                        <span className="block truncate text-xs text-text-secondary">
                          {article.author ?? "Article"} · {formatChars(article.charCount)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
