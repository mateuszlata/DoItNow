import { useId } from "react";
import { JERSEY_SHAPES, kitNumberColor, type KitPattern, type PlayerKit } from "@/lib/kit";
import { sportKit } from "@/lib/sports";

// Koszulka w barwach gracza (wzór, dwa kolory, numer lub inicjały). Renderowana na serwerze w składzie
// i w przeglądarce w czacie oraz kreatorze stroju.

interface Props {
  kit: PlayerKit;
  /** Sport wybiera krój: koszulka, bezrękawnik, polo, kolarska, numer startowy. */
  sport?: string;
  /** Szerokość w px (wysokość wynika z proporcji 48×52). */
  width?: number;
  /** Bez numeru — np. dla bardzo małych strojów. */
  hideLabel?: boolean;
  /** Widok z tyłu: nick nad numerem (mini-profil). */
  backName?: string;
  className?: string;
}

/** Wzór w polu 48×52; przy małych rozmiarach cienkie prążki zlewają się, więc pokazujemy gładką koszulkę. */
function PatternShapes({ pattern, color, small }: { pattern: KitPattern; color: string; small: boolean }) {
  switch (small && pattern === "pin" ? "plain" : pattern) {
    case "vstripes":
      return [4, 16, 28, 40].map((x) => <rect key={x} x={x} y="0" width="6" height="52" fill={color} />);
    case "hoops":
      return [8, 20, 32, 44].map((y) => <rect key={y} x="0" y={y} width="48" height="6" fill={color} />);
    case "sash":
      return <polygon points="8,0 18,0 44,52 34,52" fill={color} />;
    case "halves":
      return <rect x="24" y="0" width="24" height="52" fill={color} />;
    case "sleeves":
      return (
        <>
          <rect x="0" y="0" width="12" height="26" fill={color} />
          <rect x="36" y="0" width="12" height="26" fill={color} />
          <rect x="14" y="0" width="20" height="5" fill={color} />
        </>
      );
    case "pin":
      return Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={3 + i * 5} y="0" width="1.2" height="52" fill={color} />
      ));
    default:
      return null;
  }
}

export default function KitJersey({ kit, sport = "", width = 58, hideLabel = false, backName, className }: Props) {
  const clipId = useId();
  const cut = sportKit(sport);
  const shape = JERSEY_SHAPES[cut];
  const height = Math.round((width * 52) / 48);
  const small = width < 30;
  const numberColor = kitNumberColor(kit.primary);
  const textStyle = { fontFamily: "var(--font-head)", fontWeight: 800 } as const;
  const labelSize = (cut === "bib" ? 22 : 19) - (kit.label.length > 2 ? 4 : 0) - (backName ? 2 : 0);
  const labelY = 52 * shape.numberTop + labelSize * 0.78 + (backName ? 4 : 0);

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 48 52"
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={shape.body} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="48" height="52" fill={kit.primary} />
        <PatternShapes pattern={kit.pattern} color={kit.secondary} small={small} />
      </g>
      <path d={shape.body} fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth="0.8" />
      {shape.detail && (
        <path d={shape.detail} fill="none" stroke={kit.secondary} strokeWidth="2.2" strokeLinecap="round" />
      )}
      {backName && (
        <text
          x="24"
          y="17"
          textAnchor="middle"
          fontSize="6.5"
          fill={numberColor}
          stroke={kit.primary}
          strokeWidth="0.6"
          paintOrder="stroke"
          style={textStyle}
        >
          {backName.toUpperCase().slice(0, 12)}
        </text>
      )}
      {!hideLabel && !small && (
        <text
          x="24"
          y={labelY}
          textAnchor="middle"
          fontSize={labelSize}
          fill={numberColor}
          stroke={kit.primary}
          strokeWidth="1.4"
          paintOrder="stroke"
          style={textStyle}
        >
          {kit.label}
        </text>
      )}
    </svg>
  );
}
