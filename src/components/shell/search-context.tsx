"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type SearchValue = { query: string; setQuery: (value: string) => void };

const SearchContext = createContext<SearchValue | null>(null);

export function useSearch(): SearchValue {
  const context = useContext(SearchContext);
  if (!context) throw new Error("useSearch must be used within a SearchProvider");
  return context;
}

/** Shared search query: the topbar edits it, the sidebar and library grid read it. */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  return <SearchContext.Provider value={{ query, setQuery }}>{children}</SearchContext.Provider>;
}
