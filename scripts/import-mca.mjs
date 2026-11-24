#!/usr/bin/env node
/**
 * One-time import of MCA company master data into Supabase (table mca_companies).
 *
 * Source: data.gov.in "Registrars of Companies (RoC)-wise Company Master Data"
 *         resource 4dbe5667-7b6b-41d7-82af-211562424d9a (~3.7M records).
 * The analyzer only reads mca_companies; it never calls data.gov.in at request time.
 *
 * Needs, in .env.local or .env (or the shell):
 *   DATA_GOV_IN_API_KEY        your data.gov.in key
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  writes bypass RLS; keep it server-side
 * Run the migration in supabase/migrations/20261124_free_verification_checks.sql first.
 *
 * Usage:
 *   npm run import:mca                      # import everything, resuming if interrupted
 *   npm run import:mca -- --states goa,delhi
 *   npm run import:mca -- --limit 5000 --delay 1000
 *   npm run import:mca -- --reset           # forget progress and start over
 *   npm run import:mca -- --dry-run         # fetch one page per state, write nothing
 *   npm run import:mca -- --sample 100000   # import ~N rows spread over all states, to measure size
 *
 * Free-tier guard: before each page it checks the database size and stops cleanly once it
 * is within 50 MB of 500 MB (override with --max-db-mb). Re-run to resume after freeing space.
 *
 * Progress is checkpointed to scripts/.mca-import-state.json after every page is
 * stored, and rows are upserted by CIN, so re-running after a crash is safe.
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toMcaRow } from "./lib/mca-shared.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_FILE = join(ROOT, "scripts", ".mca-import-state.json");
const RESOURCE = "https://api.data.gov.in/resource/4dbe5667-7b6b-41d7-82af-211562424d9a";

/**
 * Every CompanyStateCode value in the dataset, spelled exactly as stored (lowercase,
 * legacy names such as "orissa"). Checked 2026-11-24: per-state totals sum to the
 * resource total. The script re-checks that sum and warns if new values appear.
 */
const STATE_CODES = [
  "andaman and nicobar islands", "andhra pradesh", "arunachal pradesh", "assam", "bihar",
  "chandigarh", "chattisgarh", "dadra & nagar haveli", "daman and diu", "delhi", "goa",
  "gujarat", "haryana", "himachal pradesh", "jammu & kashmir", "jharkhand", "karnataka",
  "kerala", "ladakh", "lakshadweep", "madhya pradesh", "maharashtra", "manipur", "meghalaya",
  "mizoram", "nagaland", "orissa", "pondicherry", "punjab", "rajasthan", "sikkim",
  "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand", "west bengal",
];

// ---------------------------------------------------------------------------------------

function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

function parseArgs(argv) {
  const args = { limit: 10000, delay: 500, states: null, reset: false, dryRun: false, sample: 0, maxDbMb: 450 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--reset") args.reset = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--sample") args.sample = Number(argv[++i]);
    else if (arg === "--max-db-mb") args.maxDbMb = Number(argv[++i]);
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--delay") args.delay = Number(argv[++i]);
    else if (arg === "--states") args.states = argv[++i].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1) throw new Error("--limit must be a positive integer");
  if (!Number.isFinite(args.delay) || args.delay < 0) throw new Error("--delay must be >= 0 (ms)");
  if (!Number.isInteger(args.sample) || args.sample < 0) throw new Error("--sample must be a positive integer");
  if (!Number.isFinite(args.maxDbMb) || args.maxDbMb <= 0) throw new Error("--max-db-mb must be positive");
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class RetryableError extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

/** Retries network errors, timeouts, 429 and 5xx with exponential backoff (max ~10 min total). */
async function withRetry(label, fn, attempts = 10) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof RetryableError || error?.name === "TimeoutError" || error?.name === "TypeError";
      if (!retryable || attempt >= attempts) throw error;
      const backoff = Math.min(120_000, 2000 * 2 ** (attempt - 1));
      const wait = Math.max(backoff, error.retryAfterMs ?? 0);
      console.warn(`  ${label}: ${error.message}; retry ${attempt}/${attempts - 1} in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
}

function retryAfterMs(res) {
  const seconds = Number(res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

// ---- data.gov.in -----------------------------------------------------------------------

async function fetchPage(apiKey, { state, offset, limit }) {
  const params = new URLSearchParams({ "api-key": apiKey, format: "json", offset: String(offset), limit: String(limit) });
  if (state) params.set("filters[CompanyStateCode]", state);
  // Stable order so offsets never skip or repeat records between pages.
  params.set("sort[CIN]", "asc");

  return withRetry(`${state ?? "total"} @${offset}`, async () => {
    const res = await fetch(`${RESOURCE}?${params}`, { signal: AbortSignal.timeout(60_000), headers: { Accept: "application/json" } });
    if (res.status === 429 || res.status >= 500) throw new RetryableError(`HTTP ${res.status}`, retryAfterMs(res));
    if (res.status === 401 || res.status === 403) throw new Error(`data.gov.in rejected the API key (HTTP ${res.status}).`);
    if (!res.ok) throw new Error(`data.gov.in HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    let body;
    try {
      body = await res.json();
    } catch {
      throw new RetryableError("invalid JSON (likely throttled)");
    }
    if (body.status !== "ok" || !Array.isArray(body.records)) {
      throw new RetryableError(`unexpected response: ${String(body.message ?? body.status).slice(0, 120)}`);
    }
    return { records: body.records, total: Number(body.total) || 0, updated: body.updated_date ?? null };
  });
}

const unknownStatuses = new Map();
let skippedIdentifiers = 0;

function toRow(record) {
  const built = toMcaRow(record);
  if (!built) {
    skippedIdentifiers += 1;
    return null;
  }
  if (built.row.status === 0 && built.statusLabel) {
    unknownStatuses.set(built.statusLabel, (unknownStatuses.get(built.statusLabel) ?? 0) + 1);
  }
  return built.row;
}

// ---- Supabase --------------------------------------------------------------------------

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    /** Current database size in bytes, via the service-role-only offersafe_db_size() RPC. */
    async dbSize() {
      return withRetry("db size", async () => {
        const res = await fetch(`${url}/rest/v1/rpc/offersafe_db_size`, {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: "{}",
        });
        if (res.status === 429 || res.status >= 500) throw new RetryableError(`Supabase HTTP ${res.status}`, retryAfterMs(res));
        if (!res.ok) throw new Error(`db size check failed: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return Number(await res.json());
      });
    },
    async count(table) {
      const res = await fetch(`${url}/rest/v1/${table}?select=cin_hash&limit=1`, {
        signal: AbortSignal.timeout(60_000),
        headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
      });
      const range = res.headers.get("content-range") ?? "";
      return Number(range.split("/")[1]) || null;
    },
    async upsert(table, rows, onConflict) {
      if (rows.length === 0) return;
      await withRetry(`upsert ${table}`, async () => {
        const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
          method: "POST",
          signal: AbortSignal.timeout(60_000),
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(rows),
        });
        if (res.status === 429 || res.status >= 500) throw new RetryableError(`Supabase HTTP ${res.status}`, retryAfterMs(res));
        if (!res.ok) throw new Error(`Supabase HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      });
    },
  };
}

// ---- Checkpoint ------------------------------------------------------------------------

async function loadState(reset) {
  if (reset) await rm(STATE_FILE, { force: true });
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return { startedAt: new Date().toISOString(), states: {} };
  }
}

async function saveState(state) {
  // Write-then-rename so a crash mid-write can't corrupt the checkpoint.
  await writeFile(`${STATE_FILE}.tmp`, JSON.stringify(state, null, 2));
  await rename(`${STATE_FILE}.tmp`, STATE_FILE);
}

// ---- Main ------------------------------------------------------------------------------

class SizeLimitReached extends Error {}

const MB = 1024 * 1024;

async function guardSize(db, args) {
  const bytes = await db.dbSize();
  if (bytes >= args.maxDbMb * MB) {
    throw new SizeLimitReached(
      `Database is ${(bytes / MB).toFixed(1)} MB, at the ${args.maxDbMb} MB guard (50 MB below the 500 MB free tier). Stopped before writing more.`,
    );
  }
  return bytes;
}

async function writeRows(db, records) {
  // De-duplicate within the batch: Postgres rejects an upsert that touches a key twice.
  const rows = [...new Map(records.map(toRow).filter(Boolean).map((r) => [r.cin_hash, r])).values()];
  for (let i = 0; i < rows.length; i += 1000) await db.upsert("mca_companies", rows.slice(i, i + 1000), "cin_hash");
  return rows.length;
}

/** Imports ~N rows as pages spread evenly across every state and offset, for size measurement. */
async function importSample(apiKey, db, args, total) {
  const totals = [];
  for (const code of STATE_CODES) {
    totals.push([code, (await fetchPage(apiKey, { state: code, offset: 0, limit: 1 })).total]);
  }
  // Small pages taken from the middle of evenly spaced slices. Records are sorted by CIN and
  // LLPINs ("AAA-0001") sort before CINs, so starting at offset 0 would over-sample LLPs.
  const pageSize = Math.min(args.limit, 500);
  let written = 0;
  let llp = 0;
  for (const [code, stateTotal] of totals) {
    const want = Math.round((args.sample * stateTotal) / total);
    const pages = Math.ceil(want / pageSize);
    for (let p = 0; p < pages; p += 1) {
      await guardSize(db, args);
      const size = Math.min(pageSize, want - p * pageSize);
      const offset = Math.max(0, Math.floor(((p + 0.5) * stateTotal) / pages - size / 2));
      const page = await fetchPage(apiKey, { state: code, offset, limit: size });
      llp += page.records.filter((r) => typeof r.CIN === "string" && r.CIN.includes("-")).length;
      written += await writeRows(db, page.records);
      await sleep(args.delay);
    }
    console.log(`  ${code}: sampled (${written} rows so far)`);
  }
  console.log(`Sample done: ${written} rows written; ${((100 * llp) / Math.max(written, 1)).toFixed(1)}% are LLPINs.`);
}

async function importState(apiKey, db, state, code, args) {
  const progress = (state.states[code] ??= { offset: 0, total: null, imported: 0, done: false });
  if (progress.done) {
    console.log(`= ${code}: already done (${progress.imported} rows)`);
    return;
  }

  for (;;) {
    const bytes = await guardSize(db, args);
    const page = await fetchPage(apiKey, { state: code, offset: progress.offset, limit: args.limit });
    progress.total = page.total;
    if (page.records.length === 0) break;

    const written = await writeRows(db, page.records);

    progress.offset += page.records.length;
    progress.imported += written;
    await saveState(state);
    console.log(`  ${code}: ${progress.offset}/${page.total}  (db ${(bytes / MB).toFixed(0)} MB)`);

    if (progress.offset >= page.total) break;
    await sleep(args.delay);
  }

  progress.done = true;
  await saveState(state);
  console.log(`✓ ${code}: ${progress.imported} rows`);
}

async function main() {
  loadEnvFiles();
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.DATA_GOV_IN_API_KEY;
  const required = args.dryRun ? ["DATA_GOV_IN_API_KEY"] : ["DATA_GOV_IN_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")} (set them in .env.local)`);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!args.dryRun && (serviceKey.startsWith("sb_publishable_") || serviceKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY holds the public (publishable/anon) key. Use the secret key (sb_secret_...) from Project Settings > API Keys > Secret keys.",
    );
  }

  const codes = args.states ?? STATE_CODES;
  const overall = await fetchPage(apiKey, { state: null, offset: 0, limit: 1 });
  console.log(`Source has ${overall.total} records (updated ${overall.updated ?? "unknown"}). Importing ${codes.length} states, ${args.limit}/page.`);

  if (args.dryRun) {
    let covered = 0;
    for (const code of codes) {
      const page = await fetchPage(apiKey, { state: code, offset: 0, limit: args.limit });
      const rows = page.records.map(toRow).filter(Boolean);
      covered += page.total;
      console.log(`  ${code}: ${page.total} records; first page returned ${page.records.length} (${rows.length} valid)`);
      await sleep(args.delay);
    }
    console.log(`Dry run: states cover ${covered} of ${overall.total} records. Nothing was written.`);
    return;
  }

  const db = supabase();
  console.log(`Database is ${((await db.dbSize()) / MB).toFixed(1)} MB; guard at ${args.maxDbMb} MB.`);

  if (args.sample > 0) {
    await importSample(apiKey, db, args, overall.total);
    reportUnknownStatuses();
    return;
  }

  const state = await loadState(args.reset);

  for (const code of codes) await importState(apiKey, db, state, code, args);
  reportUnknownStatuses();

  const covered = STATE_CODES.reduce((sum, code) => sum + (state.states[code]?.total ?? 0), 0);
  const allDone = STATE_CODES.every((code) => state.states[code]?.done);
  if (!allDone) {
    console.log("Partial import finished (not all states). Run without --states to complete; the analyzer stays 'unavailable' until then.");
    return;
  }
  if (covered < overall.total) {
    console.warn(
      `WARNING: states cover ${covered} of ${overall.total} records. The dataset likely has a new CompanyStateCode value; add it to STATE_CODES and re-run.`,
    );
  }

  const imported =
    (await db.count("mca_companies")) ?? STATE_CODES.reduce((sum, code) => sum + (state.states[code]?.imported ?? 0), 0);
  await db.upsert(
    "mca_import_meta",
    [{ id: 1, completed_at: new Date().toISOString(), record_count: imported, source_total: overall.total, source_updated_at: overall.updated }],
    "id",
  );
  console.log(`Done: ${imported} rows imported. Registry lookups are now enabled.`);
}

function reportUnknownStatuses() {
  if (skippedIdentifiers > 0) console.warn(`Skipped ${skippedIdentifiers} records whose CIN/LLPIN is not a valid format.`);
  if (unknownStatuses.size === 0) return;
  console.warn("Statuses stored as 0 (Other); add them to scripts/lib/mca-shared.mjs if they matter:");
  for (const [label, n] of unknownStatuses) console.warn(`  ${label}: ${n}`);
}

main().catch((error) => {
  if (error instanceof SizeLimitReached) {
    reportUnknownStatuses();
    console.error(`\nImport paused: ${error.message}\nProgress is saved; re-run the same command to resume once there is room.`);
    process.exit(2);
  }
  console.error(`\nImport stopped: ${error.message}\nRe-run the same command to resume from the last saved page.`);
  process.exit(1);
});
