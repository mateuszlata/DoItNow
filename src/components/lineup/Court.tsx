import type { CourtKind } from "@/lib/lineup";

// Tło „Składów na mecz” w polu 100×150 (pion): murawa, parkiet do kosza, boisko do siatkówki albo kort.
// Linie rysowane w SVG bez proporcji (preserveAspectRatio="none" w rodzicu), więc kształty są w jednostkach pola.

const LINE = { fill: "none", stroke: "rgba(255,255,255,0.85)", strokeWidth: 0.5 } as const;

function Football() {
  return (
    <>
      <rect x="0" y="0" width="100" height="150" rx="3" fill="#2f8a4e" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x="4" y={4 + i * 35.5} width="92" height="17.75" fill="rgba(255,255,255,0.06)" />
      ))}
      <g {...LINE}>
        <rect x="4" y="4" width="92" height="142" />
        <line x1="4" y1="75" x2="96" y2="75" />
        <ellipse cx="50" cy="75" rx="11" ry="11" />
        <rect x="24" y="4" width="52" height="19" />
        <rect x="24" y="127" width="52" height="19" />
        <rect x="38" y="1.5" width="24" height="2.5" />
        <rect x="38" y="146" width="24" height="2.5" />
      </g>
    </>
  );
}

function Basketball() {
  return (
    <>
      <rect x="0" y="0" width="100" height="150" rx="3" fill="#c98a4e" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={i * 8.4} y="0" width="4.2" height="150" fill="rgba(0,0,0,0.05)" />
      ))}
      <g {...LINE}>
        <rect x="4" y="4" width="92" height="142" />
        <line x1="4" y1="75" x2="96" y2="75" />
        <ellipse cx="50" cy="75" rx="10" ry="10" />
        <rect x="34" y="4" width="32" height="28" fill="rgba(19,38,31,0.18)" />
        <rect x="34" y="118" width="32" height="28" fill="rgba(19,38,31,0.18)" />
        <path d="M10 4 V 18 A 40 32 0 0 0 90 18 V 4" />
        <path d="M10 146 V 132 A 40 32 0 0 1 90 132 V 146" />
        <ellipse cx="50" cy="10" rx="3" ry="2.4" stroke="#ff7a1a" strokeWidth="0.9" />
        <ellipse cx="50" cy="140" rx="3" ry="2.4" stroke="#ff7a1a" strokeWidth="0.9" />
      </g>
    </>
  );
}

function Volleyball() {
  return (
    <>
      <rect x="0" y="0" width="100" height="150" rx="3" fill="#1f5fad" />
      <rect x="10" y="6" width="80" height="138" fill="#e8873a" />
      <g {...LINE}>
        <rect x="10" y="6" width="80" height="138" />
        <line x1="10" y1="52" x2="90" y2="52" />
        <line x1="10" y1="98" x2="90" y2="98" />
      </g>
      <line x1="4" y1="75" x2="96" y2="75" stroke="#f3ead3" strokeWidth="1.6" />
      <line x1="4" y1="75" x2="96" y2="75" stroke="#13261f" strokeWidth="0.5" strokeDasharray="1 1" />
    </>
  );
}

function Racket() {
  return (
    <>
      <rect x="0" y="0" width="100" height="150" rx="3" fill="#2b6fa3" />
      <rect x="12" y="6" width="76" height="138" fill="#3f8f5e" />
      <g {...LINE}>
        <rect x="12" y="6" width="76" height="138" />
        <line x1="22" y1="6" x2="22" y2="144" />
        <line x1="78" y1="6" x2="78" y2="144" />
        <line x1="22" y1="40" x2="78" y2="40" />
        <line x1="22" y1="110" x2="78" y2="110" />
        <line x1="50" y1="40" x2="50" y2="110" />
      </g>
      <line x1="6" y1="75" x2="94" y2="75" stroke="#f3ead3" strokeWidth="1.4" />
    </>
  );
}

export default function Court({ kind }: { kind: CourtKind }) {
  if (kind === "basketball") return <Basketball />;
  if (kind === "volleyball") return <Volleyball />;
  if (kind === "racket") return <Racket />;
  return <Football />;
}
