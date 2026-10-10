import { adminDb } from "./admin";

/** Per-user bookkeeping in Firestore. The server owns `access`. */
export type UserDoc = {
  email?: string;
  createdAt: number;
  access: boolean;
  role: "user" | "admin";
};

export async function ensureUser(uid: string, email?: string): Promise<UserDoc> {
  const ref = adminDb().doc(`users/${uid}`);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as UserDoc;

  const doc: UserDoc = { email, createdAt: Date.now(), access: true, role: "user" };
  await ref.set(doc);
  return doc;
}

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await adminDb().doc(`users/${uid}`).get();
  return snap.exists ? (snap.data() as UserDoc) : null;
}

export async function hasAccess(uid: string): Promise<boolean> {
  const doc = await getUserDoc(uid);
  return Boolean(doc?.access);
}
