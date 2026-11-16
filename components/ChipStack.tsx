/** Decorative stack of tilted poker chips for the home hero. */
export function ChipStack({ className = "" }: { className?: string }) {
  const chips = [
    { c: "#d9423b", x: 0, y: 0, r: -8 },
    { c: "#1c1f24", x: 26, y: -14, r: 10 },
    { c: "#0f8a5f", x: 8, y: -36, r: -4 },
    { c: "#2f6fdb", x: 40, y: -50, r: 14 },
  ];
  return (
    <div className={`pointer-events-none ${className}`} aria-hidden>
      <div className="relative h-28 w-28">
      {chips.map((k, i) => (
        <span
          key={i}
          className="chip absolute h-16 w-16"
          style={{ ["--chip" as string]: k.c, left: k.x, bottom: -k.y, transform: `rotate(${k.r}deg)`, zIndex: i }}
        />
      ))}
      </div>
    </div>
  );
}
