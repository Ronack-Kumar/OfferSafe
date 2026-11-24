/** The "O" with a highlighter stroke through it. Decorative; the wordmark is the name. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="relative inline-grid place-items-center font-extrabold" style={{ width: size, height: size }}>
      <span className="absolute inset-x-0 bg-[var(--hl)]" style={{ top: size * 0.35, bottom: size * 0.2, transform: "skewX(-12deg)" }} />
      <span className="relative">O</span>
    </span>
  );
}
