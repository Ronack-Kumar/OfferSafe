/**
 * Renders an explanation, turning the user's own words (in curly quotes “…”) into a
 * highlighted serif quote, so the trigger stands out from the explanation.
 */
export function QuotedText({ text }: { text: string }) {
  const parts = text.split(/(“[^”]+”)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("“") && part.endsWith("”") ? (
          <q key={i} className="quote doc">
            <mark>{part.slice(1, -1)}</mark>
          </q>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
