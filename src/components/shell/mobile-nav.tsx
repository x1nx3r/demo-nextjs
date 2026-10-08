"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListMusic, Library } from "lucide-react";
import { cn } from "cn";

import { usePlayer } from "@/components/player/player-provider";

export function MobileNav() {
  const pathname = usePathname();
  const { data } = usePlayer();
  const playHref = data ? `/book/${data.bookId}/play/${data.idx}` : null;

  const base = "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-bold";

  return (
    <nav className="flex h-14 shrink-0 items-center border-t border-border bg-background md:hidden">
      <Link
        href="/"
        className={cn(
          base,
          pathname === "/" || pathname.startsWith("/book") ? "text-foreground" : "text-text-secondary",
        )}
      >
        <Library className="size-5" />
        Library
      </Link>
      {playHref ? (
        <Link
          href={playHref}
          className={cn(
            base,
            pathname.includes("/play/") ? "text-foreground" : "text-text-secondary",
          )}
        >
          <ListMusic className="size-5" />
          Now Playing
        </Link>
      ) : (
        <span className={cn(base, "text-text-secondary/40")}>
          <ListMusic className="size-5" />
          Now Playing
        </span>
      )}
    </nav>
  );
}
