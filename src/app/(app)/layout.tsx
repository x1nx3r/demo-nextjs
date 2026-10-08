import type { ReactNode } from "react";

import { AppShell, type ShellBook } from "@/components/shell/app-shell";
import { listBooks } from "@/lib/store/books";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const books = await listBooks();
  const items: ShellBook[] = books.map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    coverContentType: book.coverContentType,
    chapterCount: book.chapterCount,
  }));

  return <AppShell books={items}>{children}</AppShell>;
}
