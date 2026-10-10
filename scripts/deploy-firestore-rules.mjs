#!/usr/bin/env node
/**
 * Deploy firestore.rules to the Firebase project.
 *
 * Usage (from demo-nextjs/):
 *   node --env-file=.env.local scripts/deploy-firestore-rules.mjs
 *
 * Uses the service account in FIREBASE_SERVICE_ACCJSON_BASE64.
 */

import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";

const sa = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCJSON_BASE64, "base64").toString("utf8"),
);
const projectId = sa.project_id;
const rules = readFileSync("firestore.rules", "utf8");

const auth = new GoogleAuth({
  credentials: sa,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const token = (await (await auth.getClient()).getAccessToken()).token;

const created = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: rules }] } }),
  },
);
if (!created.ok) {
  console.error("create ruleset failed:", created.status, await created.text());
  process.exit(1);
}
const ruleset = await created.json();
console.log("created ruleset:", ruleset.name);

const updated = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`,
  {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      release: {
        name: `projects/${projectId}/releases/cloud.firestore`,
        rulesetName: ruleset.name,
      },
      updateMask: "rulesetName",
    }),
  },
);
if (!updated.ok) {
  console.error("release update failed:", updated.status, await updated.text());
  process.exit(1);
}
console.log("deployed rules to release cloud.firestore");
