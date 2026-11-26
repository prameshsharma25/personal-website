type Point = { x: number; y: number; z: number };

// A small, deterministic projection of a double helix. The offset backbones,
// paired rungs, and depth shading give the mark visible grooves and volume.
const steps = 84;
const bases = 21;
const round = (value: number) => Number(value.toFixed(3));
const shade = (value: number) => `rgb(${value}, ${value}, ${value})`;
function point(t: number, strand: number): Point {
  const angle = t * Math.PI * 4 + strand * 2.35 - 0.5;
  const z = Math.sin(angle);
  return {
    x: round(18 + Math.cos(angle) * 11),
    y: round(6 + t * 58 + z * 2.2),
    z,
  };
}
const backbones = [0, 1].flatMap((strand) =>
  Array.from({ length: steps }, (_, i) => {
    const a = point(i / steps, strand);
    const mid = point((i + 0.5) / steps, strand);
    const b = point((i + 1) / steps, strand);
    return {
      id: `strand-${strand}-${i}`,
      depth: mid.z,
      d: `M${a.x} ${a.y} Q${mid.x} ${mid.y} ${b.x} ${b.y}`,
      light: Math.round(135 + (mid.z + 1) * 53),
    };
  })
);
const rungs = Array.from({ length: bases }, (_, i) => {
  const a = point(i / (bases - 1), 0);
  const b = point(i / (bases - 1), 1);
  return { a, b, depth: (a.z + b.z) / 2, id: `base-${i}` };
});
const geometry = [
  ...backbones.map((segment) => ({ ...segment, kind: 'backbone' as const })),
  ...rungs.map((rung) => ({ ...rung, kind: 'rung' as const })),
].sort((a, b) => a.depth - b.depth);

export default function DnaMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 36 72"
      width="28"
      height="56"
      aria-hidden="true"
      focusable="false"
      fill="none"
      strokeLinecap="round"
    >
      {geometry.map((part) => {
        if (part.kind === 'backbone')
          return (
            <g key={part.id}>
              <path d={part.d} stroke={shade(part.light - 52)} strokeWidth="3.5" />
              <path d={part.d} stroke={shade(part.light)} strokeWidth="1.8" />
            </g>
          );
        const { a, b } = part;
        const light = Math.round(105 + (part.depth + 1) * 48);
        const x = round((a.x + b.x) / 2);
        const y = round((a.y + b.y) / 2);
        return (
          <g key={part.id}>
            <path d={`M${a.x} ${a.y} L${x} ${y}`} stroke={shade(light)} strokeWidth="1.3" />
            <path d={`M${x} ${y} L${b.x} ${b.y}`} stroke={shade(light + 25)} strokeWidth="1.3" />
            <circle cx={a.x} cy={a.y} r="1.2" fill={shade(Math.round(170 + a.z * 55))} />
            <circle cx={b.x} cy={b.y} r="1.2" fill={shade(Math.round(170 + b.z * 55))} />
          </g>
        );
      })}
    </svg>
  );
}
