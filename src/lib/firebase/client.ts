"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/**
 * Firebase web config. Public by design, but injected at runtime by the server
 * layout so the build does not depend on `NEXT_PUBLIC_*` being present at build
 * time. Access control lives in the session and Firestore rules, not these values.
 */
export type FirebaseConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

let configured = false;

/** Idempotent: the first call wins, later calls are ignored. */
export function configureFirebase(config: FirebaseConfig): void {
  if (configured || getApps().length > 0) {
    configured = true;
    return;
  }
  initializeApp(config);
  configured = true;
}

export function firebaseApp(): FirebaseApp {
  if (getApps().length === 0) {
    throw new Error("Firebase is not configured");
  }
  return getApp();
}

export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}
