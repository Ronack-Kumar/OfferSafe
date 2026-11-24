export declare const CIN_REGEX: RegExp;
export declare const LLPIN_REGEX: RegExp;
export declare function normalizeIdentifier(value: string | null | undefined): string;
export declare function identifierKind(normalized: string): "cin" | "llpin" | null;
export declare function hashIdentifier(value: string): string;
export declare const MCA_STATUSES: ReadonlyArray<readonly [number, string]>;
export declare const MCA_STATUS_ACTIVE: 1;
export declare function mcaStatusCode(label: string | null | undefined): number;
export declare function mcaStatusLabel(code: number): string;
export declare function toMcaRow(record: Record<string, unknown> | null | undefined): {
  row: { cin_hash: string; registration_date: string | null; status: number };
  statusLabel: string | null;
} | null;
