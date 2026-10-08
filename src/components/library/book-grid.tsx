"use client";

import { BookCard } from "@/components/library/book-card";
import { useSearch } from "@/components/shell/search-context";
import type { BookMeta } from "@/lib/store/books";

export function BookGrid({ books }: { books: BookMeta[] }) {
  const { query } = useSearch();
  const q = query.trim().toLowerCase();
  const list = q
    ? books.filter(
        (book) =>
          book.title.toLowerCase().includes(q) ||
          (book.author ?? "").toLowerCase().includes(q),
      )
    : books;

  if (list.length === 0) {
    return <p className="text-sm text-text-secondary">No books match “{query}”.</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {list.map((book) => (
        <li key={book.id}>
          <BookCard book={book} />
        </li>
      ))}
    </ul>
  );
}
