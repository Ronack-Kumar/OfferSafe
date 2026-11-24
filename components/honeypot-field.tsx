import { HONEYPOT_FIELD } from "@/lib/spam-fields";

/**
 * A field people never see and assistive tech skips, but form-filling bots often
 * complete. The server drops any submission where it isn't empty.
 */
export default function HoneypotField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
      <label>
        Fax number (leave empty)
        <input
          type="text"
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
