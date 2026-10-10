import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Firebase Admin. The service account arrives as base64 JSON in
 * `FIREBASE_SERVICE_ACCJSON_BASE64` and never leaves the server.
 */

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function serviceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCJSON_BASE64;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCJSON_BASE64 is not set");
  return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as ServiceAccount;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCJSON_BASE64);
}

export function adminApp(): App {
  if (getApps().length) return getApp();
  const account = serviceAccount();
  return initializeApp({
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key,
    }),
  });
}

export function adminAuth() {
  return getAuth(adminApp());
}

export function adminDb() {
  return getFirestore(adminApp());
}
