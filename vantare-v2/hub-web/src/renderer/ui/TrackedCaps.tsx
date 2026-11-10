/** GPUI lays out each caption glyph separately, rounded to a physical pixel. */
export function TrackedCaps({ children }: { children: string }) {
  const occurrences = new Map<string, number>();
  return (
    <span className="v-tracked-caps">
      <span className="v-sr-only">{children}</span>
      <span className="v-tracked-caps-letters" aria-hidden="true">
        {Array.from(children.toLocaleUpperCase("es")).map((letter) => {
          const occurrence = occurrences.get(letter) ?? 0;
          occurrences.set(letter, occurrence + 1);
          return <span key={`${letter}:${occurrence}`}>{letter}</span>;
        })}
      </span>
    </span>
  );
}
