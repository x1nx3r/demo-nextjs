# ChattyPub

Turn books and articles into expressive, full-cast audiobooks.

ChattyPub reads an EPUB, PDF, TXT, or Markdown file, or a link. A planning
Director casts each character with a distinct voice. A text-to-speech provider
then performs the book with emotion and pace.

## Features

- Casts each character with a distinct voice and holds it across chapters.
- Imports EPUB, PDF, TXT, and Markdown files, plus web links.
- Plans expressive delivery with inline audio cues.
- Plays in a dark, focused player with resume and auto-advance.
- Signs in with Google and keeps each user's library separate.

## Requirements

- Node.js 20.9 or later.
- An S3-compatible object store (RustFS, MinIO, or S3).
- A Firebase project for auth and user bookkeeping.
- An LLM provider key for planning and casting.
- A text-to-speech provider key.

## Setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Copy the environment template and fill in the values.

   ```bash
   cp .env.example .env.local
   ```

   The template groups the settings by service: storage, Firebase, text to
   speech, and the language model.

3. Encode the Firebase service account for the server.

   ```bash
   base64 -w0 serviceAccount.json
   ```

   Put the result in `FIREBASE_SERVICE_ACCJSON_BASE64`.

4. In the Firebase console, enable the Google sign-in provider. Then deploy
   the Firestore rules.

   ```bash
   node --env-file=.env.local scripts/deploy-firestore-rules.mjs
   ```

5. Start the development server.

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — start the development server.
- `npm run build` — build for production.
- `npm run start` — run the production build.
- `npm run lint` — run ESLint.
- `node scripts/build-voice-pool.mjs` — rebuild the voice pool.
- `node scripts/wipe-storage.mjs` — delete all app data from the object store.
- `node scripts/deploy-firestore-rules.mjs` — deploy `firestore.rules`.

## Notes

- This is a personal project. Use it with your own provider keys.
- The browser uses Firebase Auth only. The server uses the Firebase Admin SDK
  for all Firestore access.
- Every stored object is namespaced under `users/{uid}/`.
