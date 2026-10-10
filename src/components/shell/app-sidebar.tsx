"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { signOut } from "firebase/auth";
import { Library, LogOut } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { firebaseAuth } from "@/lib/firebase/client";

import type { ShellBook } from "./app-shell";
import { useSearch } from "./search-context";

export function AppSidebar({ books, collapsed }: { books: ShellBook[]; collapsed: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { query } = useSearch();
  const q = query.trim().toLowerCase();

  async function handleSignOut() {
    try {
      await signOut(firebaseAuth());
    } catch {
      // Ignore: the session cookie is cleared below regardless.
    }
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch {
      // Ignore: navigation still sends the user to the login page.
    }
    router.push("/login");
    router.refresh();
  }

  const list = q
    ? books.filter(
        (book) =>
          book.title.toLowerCase().includes(q) ||
          (book.author ?? "").toLowerCase().includes(q),
      )
    : books;

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col bg-background transition-[width] duration-200 md:flex",
        collapsed ? "w-[72px]" : "w-60",
      )}
    >
      <Link
        href="/library"
        className={cn("flex items-center gap-2 py-5", collapsed ? "justify-center px-2" : "px-5")}
      >
        <Image
          src="/chattypub.png"
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 object-contain"
        />
        {collapsed ? null : (
          <span className="font-heading text-lg font-bold tracking-tight">ChattyPub</span>
        )}
      </Link>

      <nav className={cn(collapsed ? "px-2" : "px-3")}>
        <Link
          href="/library"
          title="Library"
          className={cn(
            "flex items-center gap-3 rounded-md py-2 text-sm transition-colors",
            collapsed ? "justify-center" : "px-3",
            pathname === "/library"
              ? "font-bold text-foreground"
              : "text-text-secondary hover:text-foreground",
          )}
        >
          <Library className="size-5 shrink-0" />
          {collapsed ? null : "Library"}
        </Link>
      </nav>

      <div className={cn("mt-4 flex min-h-0 flex-1 flex-col pb-4", collapsed ? "px-2" : "px-3")}>
        {collapsed ? null : (
          <p className="px-3 pb-2 text-xs font-bold tracking-wide text-text-secondary uppercase">
            Your books
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 ? (
            collapsed ? null : (
              <p className="px-3 text-xs text-text-secondary">
                {books.length === 0 ? "No books yet." : "No matches."}
              </p>
            )
          ) : (
            <ul className="flex flex-col gap-1">
              {list.map((book) => {
                const active =
                  pathname === `/book/${book.id}` || pathname.startsWith(`/book/${book.id}/`);
                return (
                  <li key={book.id}>
                    <Link
                      href={`/book/${book.id}`}
                      title={book.title}
                      className={cn(
                        "flex items-center gap-3 rounded-md py-2 transition-colors",
                        collapsed ? "justify-center" : "px-2",
                        active ? "bg-secondary" : "hover:bg-secondary/60",
                      )}
                    >
                      <span className="relative size-10 shrink-0 overflow-hidden rounded-sm bg-secondary">
                        {book.coverContentType ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/books/${book.id}/cover`}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </span>
                      {collapsed ? null : (
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-foreground">
                            {book.title}
                          </span>
                          <span className="block truncate text-xs text-text-secondary">
                            {book.author ?? "Unknown author"}
                          </span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className={cn("border-t border-border", collapsed ? "p-2" : "p-3")}>
        <Button
          type="button"
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          title="Sign out"
          aria-label="Sign out"
          onClick={handleSignOut}
          className={cn(collapsed ? "" : "w-full justify-start gap-2")}
        >
          {collapsed ? <LogOut className="size-4" /> : "Sign out"}
        </Button>
      </div>
    </aside>
  );
}
