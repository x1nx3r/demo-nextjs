"use client";

import { useState } from "react";
import Link from "next/link";
import { BookPlus, Headphones, PanelLeft, Search } from "lucide-react";

import { ImportDialog } from "@/components/library/import-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useSearch } from "./search-context";

export function TopBar({
  collapsed,
  onToggleSidebar,
}: {
  collapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const { query, setQuery } = useSearch();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 px-4 md:px-6">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onToggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden md:inline-flex"
      >
        <PanelLeft className="size-4" />
      </Button>

      <Link href="/" className="flex shrink-0 items-center md:hidden" aria-label="Audiobook home">
        <Headphones className="size-6 text-brand" />
      </Link>

      <div className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your library"
          aria-label="Search your library"
          className="h-10 rounded-full pl-10"
        />
      </div>

      <Button
        className="ml-auto shrink-0 gap-2"
        onClick={() => setImportOpen(true)}
        aria-label="Import EPUB"
      >
        <BookPlus className="size-4" />
        <span className="hidden sm:inline">Import</span>
      </Button>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </header>
  );
}
