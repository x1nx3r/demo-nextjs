"use client";

import { useEffect, useState, type ReactNode } from "react";

import { PlayerProvider } from "@/components/player/player-provider";

import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-nav";
import { NowPlayingBar } from "./now-playing-bar";
import { SearchProvider } from "./search-context";
import { TopBar } from "./top-bar";

export type ShellBook = {
  id: string;
  title: string;
  author: string | null;
  coverContentType: string | null;
  chapterCount: number;
};

/**
 * Desktop shell: sidebar + main + a persistent now-playing bar across the
 * bottom. On mobile the sidebar is hidden and a bottom nav takes its place.
 * The sidebar collapses to an icon rail; the choice persists.
 */
export function AppShell({ books, children }: { books: ShellBook[]; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("sidebar-collapsed") === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <PlayerProvider>
      <SearchProvider>
        <div className="flex h-dvh flex-col bg-background">
          <div className="flex min-h-0 flex-1">
            <AppSidebar books={books} collapsed={collapsed} />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)} />
              <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
            </div>
          </div>
          <NowPlayingBar />
          <MobileNav />
        </div>
      </SearchProvider>
    </PlayerProvider>
  );
}
