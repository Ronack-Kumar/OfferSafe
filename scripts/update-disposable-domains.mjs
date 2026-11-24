#!/usr/bin/env node
// Refreshes the bundled disposable-email domain list from the maintained public list:
// https://github.com/disposable-email-domains/disposable-email-domains
// Usage: npm run update:disposable
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SOURCE =
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "checks", "data", "disposable-domains.json");

const res = await fetch(SOURCE, { signal: AbortSignal.timeout(30_000) });
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}`);
  process.exit(1);
}
const domains = [
  ...new Set(
    (await res.text())
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line && !line.startsWith("#") && /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(line)),
  ),
].sort();

if (domains.length < 1000) {
  console.error(`Refusing to write: only ${domains.length} domains parsed (expected thousands).`);
  process.exit(1);
}

await writeFile(
  OUT,
  JSON.stringify({ source: SOURCE, updatedAt: new Date().toISOString().slice(0, 10), domains }, null, 0) + "\n",
);
console.log(`Wrote ${domains.length} domains to ${OUT}`);
