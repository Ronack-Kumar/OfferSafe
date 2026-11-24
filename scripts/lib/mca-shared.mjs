// Shared by scripts/import-mca.mjs (import) and lib/checks/mca.ts (lookup), so both sides
// normalize identifiers, hash them and encode statuses identically.
import { createHash } from "node:crypto";

/** CIN: L/U, 5-digit industry code, 2-letter state, year, 3-letter class, 6-digit number. */
export const CIN_REGEX = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;
/** LLPIN: three letters, hyphen, four digits (e.g. AAA-0008). */
export const LLPIN_REGEX = /^[A-Z]{3}-\d{4}$/;

/** " l22210 mh1995plc084781 " -> "L22210MH1995PLC084781". Trim, uppercase, drop whitespace. */
export function normalizeIdentifier(value) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/** "cin" | "llpin" for a well-formed (already normalized) identifier, else null. */
export function identifierKind(normalized) {
  if (CIN_REGEX.test(normalized)) return "cin";
  if (LLPIN_REGEX.test(normalized)) return "llpin";
  return null;
}

/**
 * Stable 64-bit key for mca_companies.cin_hash: the first 8 bytes of MD5 of the
 * normalized identifier, read as a signed big-endian bigint, returned as a decimal
 * string (PostgREST-safe; exceeds Number precision). Not a security hash.
 * Equivalent SQL: ('x' || substr(md5(id), 1, 16))::bit(64)::bigint
 */
export function hashIdentifier(value) {
  const digest = createHash("md5").update(normalizeIdentifier(value), "utf8").digest();
  return digest.readBigInt64BE(0).toString();
}

/**
 * CompanyStatus values in the data.gov.in MCA dataset (checked 2026-11-24).
 * Stored as smallint. Never renumber existing codes; only append.
 */
export const MCA_STATUSES = [
  [0, "Other"],
  [1, "Active"],
  [2, "Strike Off"],
  [3, "Under process of striking off"],
  [4, "Strike Off-AwaitingPublication"],
  [5, "Amalgamated"],
  [6, "Converted to LLP"],
  [7, "Converted to LLP and Dissolved"],
  [8, "Converted to CMP and Dissolved"],
  [9, "Converted and Dissolved"],
  [10, "Dissolved"],
  [11, "Dissolved (Liquidated)"],
  [12, "Dissolved under section 54"],
  [13, "Dissolved under section 59(8)"],
  [14, "Under Liquidation"],
  [15, "Under CIRP"],
  [16, "Dormant under section 455"],
  [17, "Inactive"],
  [18, "Inactive for e-filing"],
  [19, "Vanished"],
  [20, "Not available for efiling"],
];

export const MCA_STATUS_ACTIVE = 1;

/** Other spellings seen in the dataset. */
const STATUS_ALIASES = [["Under Process of Strike-Off", 3]];

const CODE_BY_LABEL = new Map([
  ...MCA_STATUSES.map(([code, label]) => [label.toLowerCase(), code]),
  ...STATUS_ALIASES.map(([label, code]) => [label.toLowerCase(), code]),
]);
const LABEL_BY_CODE = new Map(MCA_STATUSES);

/** "Strike Off" -> 2; unknown or empty -> 0 ("Other"). */
export function mcaStatusCode(label) {
  return CODE_BY_LABEL.get(String(label ?? "").trim().toLowerCase()) ?? 0;
}

/** 2 -> "Strike Off"; unknown -> "Other". */
export function mcaStatusLabel(code) {
  return LABEL_BY_CODE.get(Number(code)) ?? "Other";
}

/**
 * Builds the slim mca_companies row for one data.gov.in record, or null if its CIN/LLPIN
 * is not a valid format. `statusLabel` is returned so the importer can report unknown values.
 */
export function toMcaRow(record) {
  const str = (v) => (typeof v === "string" && v.trim() && v.trim().toUpperCase() !== "NA" ? v.trim() : null);
  const id = normalizeIdentifier(record?.CIN);
  if (!identifierKind(id)) return null;
  const date = str(record.CompanyRegistrationdate_date);
  const statusLabel = str(record.CompanyStatus);
  return {
    row: {
      cin_hash: hashIdentifier(id),
      registration_date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      status: mcaStatusCode(statusLabel),
    },
    statusLabel,
  };
}
