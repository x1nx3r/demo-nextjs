#!/usr/bin/env node
/**
 * DESTRUCTIVE. Delete all app data from RustFS.
 *
 * Usage (from demo-nextjs/):
 *   node scripts/wipe-storage.mjs                 # users, settings
 *   node scripts/wipe-storage.mjs users/          # explicit prefixes
 *
 * Reads RustFS credentials from .env.local.
 */

import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const s3 = new S3Client({
  region: env.RUSTFS_REGION,
  endpoint: env.RUSTFS_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: env.RUSTFS_ACCESS_KEY, secretAccessKey: env.RUSTFS_SECRET_KEY },
});
const Bucket = env.RUSTFS_BUCKET;

async function listAll(Prefix) {
  const keys = [];
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken: token }));
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

const prefixes = process.argv.slice(2);
if (prefixes.length === 0) prefixes.push("users/", "settings.json");

let total = 0;
for (const prefix of prefixes) {
  const keys = await listAll(prefix);
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
  console.log(`  ${prefix} -> ${keys.length} deleted`);
  total += keys.length;
}
console.log(`total deleted: ${total}`);
