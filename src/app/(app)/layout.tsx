import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell, type ShellBook } from "@/components/shell/app-shell";
import { getSession } from "@/lib/auth";
import { listBooks } from "@/lib/store/books";
import { setTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  setTenant(session.uid);

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
