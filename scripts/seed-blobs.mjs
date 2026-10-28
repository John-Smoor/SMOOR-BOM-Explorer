/**
 * One-time upload of your local data folder into Netlify Blobs (store "bom-data").
 * Run after the site exists on Netlify:
 *   NETLIFY_SITE_ID=xxxx NETLIFY_AUTH_TOKEN=xxxx npm run seed:blobs
 * (PowerShell:  $env:NETLIFY_SITE_ID="xxxx"; $env:NETLIFY_AUTH_TOKEN="xxxx"; npm run seed:blobs)
 * Uploads BOM_Master.xlsx, SOH_Cache.xlsx, BOM_History.xlsx, BOM_Draft.xlsx (if present) and fg-images/*.
 * Existing blobs with the same name are overwritten — add --skip-existing to keep them.
 */
import fs from "node:fs";
import path from "node:path";
import { getStore } from "@netlify/blobs";

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;
if (!siteID || !token) {
  console.error("Set NETLIFY_SITE_ID (Site configuration → Site details → Site ID) and NETLIFY_AUTH_TOKEN (User settings → Applications → Personal access tokens).");
  process.exit(1);
}
const dataDir = process.env.BOM_DATA_DIR || path.join(process.cwd(), "data");
const skipExisting = process.argv.includes("--skip-existing");
const store = getStore({ name: process.env.BOM_BLOB_STORE || "bom-data", siteID, token, consistency: "strong" });

const files = [];
for (const f of ["BOM_Master.xlsx", "SOH_Cache.xlsx", "BOM_History.xlsx", "BOM_Draft.xlsx"])
  if (fs.existsSync(path.join(dataDir, f))) files.push(f);
const imgDir = path.join(dataDir, "fg-images");
if (fs.existsSync(imgDir))
  for (const f of fs.readdirSync(imgDir)) if (/\.(png|jpe?g|webp|avif|gif)$/i.test(f)) files.push(`fg-images/${f}`);

if (!files.includes("BOM_Master.xlsx")) console.warn("⚠️  data/BOM_Master.xlsx not found — the site will show 'No BOM master found'.");
for (const key of files) {
  if (skipExisting && (await store.getMetadata(key))) { console.log(`skip  ${key}`); continue; }
  const buf = fs.readFileSync(path.join(dataDir, key));
  await store.set(key, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { metadata: { mtime: Date.now() } });
  console.log(`up    ${key}  (${(buf.length / 1024).toFixed(0)} KB)`);
}
console.log(`\nDone: ${files.length} file(s) in Netlify Blobs store "${process.env.BOM_BLOB_STORE || "bom-data"}".`);
