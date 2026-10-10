"use client";

import type { ReactNode } from "react";

import { configureFirebase, type FirebaseConfig } from "@/lib/firebase/client";

/** Injects the runtime Firebase config into the client before children render. */
export function FirebaseProvider({
  config,
  children,
}: {
  config: FirebaseConfig;
  children: ReactNode;
}) {
  configureFirebase(config);
  return <>{children}</>;
}
