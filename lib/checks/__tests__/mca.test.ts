import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mcaStatusCode, mcaStatusLabel, toMcaRow } from "../../../scripts/lib/mca-shared.mjs";
import { checkCin, findCinInText, hashIdentifier, isValidCinFormat, normalizeIdentifier, resetMcaState } from "../mca";
import { hangingFetch, json, stubFetch } from "./helpers";

const TCS_CIN = "L22210MH1995PLC084781";
const LLPIN = "AAA-0008";

/** Rows as the importer stores them (built with the importer's own row builder). */
function importedRow(record: Record<string, string>) {
  const built = toMcaRow(record);
  if (!built) throw new Error("fixture must be valid");
  return built.row;
}

const TCS = importedRow({ CIN: TCS_CIN, CompanyStatus: "Active", CompanyRegistrationdate_date: "1995-01-19" });

/** Routes Supabase REST calls: import meta + mca_companies looked up by cin_hash. */
function registry(rows: Array<{ cin_hash: string; status: number; registration_date: string | null }>, { imported = true } = {}) {
  return stubFetch((url) => {
    if (url.includes("/mca_import_meta")) return json(imported ? [{ completed_at: "2026-11-24T00:00:00Z" }] : []);
    if (url.includes("/mca_companies")) {
      const hash = new URL(url).searchParams.get("cin_hash")?.replace(/^eq\./, "");
      return json(rows.filter((r) => r.cin_hash === hash).map(({ status, registration_date }) => ({ status, registration_date })));
    }
    return new Response("", { status: 404 });
  });
}

beforeEach(() => {
  resetMcaState();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});
afterEach(() => vi.useRealTimers());

describe("identifier normalization and hashing", () => {
  it("trims, uppercases and removes spaces, but keeps the LLPIN hyphen", () => {
    expect(normalizeIdentifier("  l22210 mh1995 plc084781 ")).toBe(TCS_CIN);
    expect(normalizeIdentifier(" aaa-0008 ")).toBe(LLPIN);
  });

  it("matches the Postgres formula ('x' || substr(md5(id), 1, 16))::bit(64)::bigint", () => {
    // Reference values computed in the OfferSafe database.
    expect(hashIdentifier(TCS_CIN)).toBe("2300884690616432839");
    expect(hashIdentifier(LLPIN)).toBe("-4431979699485133546");
    expect(hashIdentifier("U72200KA2015PTC080000")).toBe("5346164314700976073");
  });

  it("gives the importer and the lookup the same hash for the same CIN or LLPIN", async () => {
    for (const [stored, typed] of [
      [TCS_CIN, " l22210mh1995plc084781 "],
      [LLPIN, "aaa-0008"],
    ]) {
      resetMcaState();
      const row = importedRow({ CIN: ` ${stored.toLowerCase()} `, CompanyStatus: "Active" });
      const fetchMock = registry([row]);
      const result = await checkCin(typed);
      expect(result.status).toBe("passed");
      const lookupUrl = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes("/mca_companies"));
      expect(lookupUrl).toContain(`cin_hash=eq.${row.cin_hash}`);
    }
  });

  it("rejects records with malformed identifiers at import time", () => {
    expect(toMcaRow({ CIN: "NOT-A-CIN" })).toBeNull();
    expect(toMcaRow({ CIN: "" })).toBeNull();
    expect(toMcaRow(null)).toBeNull();
  });
});

describe("CIN / LLPIN format", () => {
  it("accepts real CINs and LLPINs and finds them in text", () => {
    expect(isValidCinFormat(TCS_CIN)).toBe(true);
    expect(isValidCinFormat("u72200ka2015ptc080000")).toBe(true);
    expect(isValidCinFormat(" aaa-0008 ")).toBe(true);
    expect(findCinInText("Our CIN is U72200KA2015PTC080000, Bengaluru")).toBe("U72200KA2015PTC080000");
    expect(findCinInText("Registered LLP, LLPIN: AAB-1234")).toBe("AAB-1234");
    expect(findCinInText("no identifier here, ref ABC-1234")).toBeNull();
  });

  it("rejects malformed identifiers", () => {
    for (const bad of ["", "12345", "L22210MH1995P084781", "X22210MH1995PLC084781", "L22210MH1995PLC08478", "AA-0008", "AAA0008"]) {
      expect(isValidCinFormat(bad)).toBe(false);
    }
  });
});

describe("status codes", () => {
  it("round-trips known statuses and maps unknown ones to Other", () => {
    expect(mcaStatusCode("Active")).toBe(1);
    expect(mcaStatusCode("strike off")).toBe(2);
    expect(mcaStatusLabel(mcaStatusCode("Under process of striking off"))).toBe("Under process of striking off");
    expect(mcaStatusCode("Under Process of Strike-Off")).toBe(3);
    expect(mcaStatusCode("Not available for efiling")).toBe(20);
    expect(mcaStatusCode("Something new")).toBe(0);
    expect(mcaStatusCode(null)).toBe(0);
    expect(mcaStatusLabel(99)).toBe("Other");
  });
});

describe("checkCin", () => {
  it("passes an Active company found in the registry snapshot", async () => {
    registry([TCS]);
    const result = await checkCin(TCS_CIN);
    expect(result.status).toBe("passed");
    expect(result.detail).toContain("found in the official registry snapshot");
    expect(result.detail).toContain("1995-01-19");
    expect(result.detail).not.toMatch(/verified/i);
  });

  it("flags a company whose status is not Active", async () => {
    registry([importedRow({ CIN: TCS_CIN, CompanyStatus: "Strike Off" })]);
    const result = await checkCin(TCS_CIN);
    expect(result.status).toBe("flagged");
    expect(result.data).toMatchObject({ reason: "not_active" });
    expect(result.detail).toContain('"Strike Off"');
  });

  it("flags a CIN that is not in the snapshot", async () => {
    registry([TCS]);
    const result = await checkCin("U72200KA2015PTC080000");
    expect(result.status).toBe("flagged");
    expect(result.data).toMatchObject({ reason: "not_found", kind: "cin" });
    expect(result.detail).toContain("CIN not found");
  });

  it("looks up LLPINs the same way", async () => {
    registry([importedRow({ CIN: LLPIN, CompanyStatus: "Active" })]);
    expect((await checkCin("aaa-0008")).status).toBe("passed");
    const missing = await checkCin("ZZZ-9999");
    expect(missing.data).toMatchObject({ reason: "not_found", kind: "llpin" });
    expect(missing.detail).toContain("LLPIN not found");
  });

  it("flags a malformed identifier without any lookup", async () => {
    const fetchMock = registry([TCS]);
    const result = await checkCin("ABC123");
    expect(result.data).toMatchObject({ reason: "invalid_format" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is unavailable (never 'not found') until the import has completed", async () => {
    registry([], { imported: false });
    expect((await checkCin(TCS_CIN)).status).toBe("unavailable");
  });

  it("is unavailable when the database is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect((await checkCin(TCS_CIN)).status).toBe("unavailable");
  });

  it("reads with the publishable key, never the secret key", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_must_not_be_used");
    const fetchMock = registry([TCS]);
    expect((await checkCin(TCS_CIN)).status).toBe("passed");
    for (const [, init] of fetchMock.mock.calls) {
      const headers = init?.headers as Record<string, string>;
      expect(headers.apikey).toBe("sb_publishable_test");
      expect(JSON.stringify(headers)).not.toContain("sb_secret_");
    }
  });

  it("is unavailable without a public key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const fetchMock = registry([TCS]);
    expect((await checkCin(TCS_CIN)).status).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is unavailable when the database does not answer within 5s", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());
    const pending = checkCin(TCS_CIN);
    await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).status).toBe("unavailable");
  });
});
