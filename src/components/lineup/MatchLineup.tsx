import { useEffect, useMemo, useState } from "react";
import { Dices, RotateCcw, Target } from "lucide-react";
import KitJersey from "@/components/KitJersey";
import type { PlayerKit } from "@/lib/kit";
import {
  FOOTBALL_POSITIONS,
  TEAM_COLORS,
  formation,
  mirrorSlot,
  parseAssignments,
  randomSplit,
  splitByPositions,
  swapPlayers,
  type Assignment,
  type FootballPosition,
} from "@/lib/lineup";
import { cn } from "@/lib/utils";

// „Składy na mecz”: pionowe boisko z graczami w ich barwach. Organizator dzieli skład na dwie drużyny
// (według pozycji, losowo albo ręczną zamianą), a po podziale stroje przefarbowują się na kolory drużyn.

export interface LineupPlayerView {
  userId: string;
  name: string;
  kit: PlayerKit;
  position: FootballPosition;
}

interface Props {
  eventId: string;
  players: LineupPlayerView[];
  /** Organizator otwartego spotkania może ustawiać i zapisywać składy. */
  canEdit: boolean;
  initial: { teamA: string; teamB: string; assignments: unknown } | null;
}

const PITCH = 150;
const BENCH_ROW = 18;
const PER_ROW = 6;

function teamKit(color: string, label: string): PlayerKit {
  return { pattern: "plain", primary: color, secondary: color, label };
}

export default function MatchLineup({ eventId, players, canEdit, initial }: Props) {
  const ids = useMemo(() => players.map((p) => p.userId), [players]);
  const [teamA, setTeamA] = useState(initial?.teamA ?? TEAM_COLORS[0].hex);
  const [teamB, setTeamB] = useState(initial?.teamB ?? "#ffffff");
  const saved = useMemo(() => (initial ? parseAssignments(initial.assignments, ids) : null), [initial, ids]);
  const [assignments, setAssignments] = useState<Assignment[] | null>(saved && saved.length > 0 ? saved : null);
  // Zapisane składy pokazujemy z animacją: najpierw ławka, po chwili wybiegnięcie na boisko.
  const [revealed, setRevealed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRevealed(true);
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const shown = revealed ? assignments : null;
  const bench = players.filter((p) => !shown?.some((a) => a.user_id === p.userId));
  const benchRows = Math.max(1, Math.ceil(bench.length / PER_ROW));
  const height = PITCH + 4 + benchRows * BENCH_ROW + 4;

  function place(player: LineupPlayerView): { x: number; y: number } {
    const assignment = shown?.find((a) => a.user_id === player.userId);
    if (assignment) {
      const size = shown?.filter((a) => a.team === assignment.team).length ?? 1;
      const slots = formation(size);
      const slot = slots[Math.min(assignment.slot, slots.length - 1)];
      return assignment.team === 0 ? slot : mirrorSlot(slot);
    }
    const index = bench.indexOf(player);
    const row = Math.floor(index / PER_ROW);
    const inRow = Math.min(PER_ROW, bench.length - row * PER_ROW);
    return { x: (100 * ((index % PER_ROW) + 1)) / (inRow + 1), y: PITCH + 4 + row * BENCH_ROW + BENCH_ROW / 2 };
  }

  function update(next: Assignment[] | null, nextNotes: string[] = []) {
    setAssignments(next);
    setNotes(nextNotes);
    setDirty(true);
    setMessage(null);
    setSelected(null);
  }

  const lineupPlayers = players.map((p) => ({ userId: p.userId, name: p.name, position: p.position }));

  async function send(body: unknown, success: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/events/${eventId}/lineup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage({ text: data.message ?? "Nie udało się zapisać składów.", tone: "bad" });
        return;
      }
      setDirty(false);
      setMessage({ text: success, tone: "ok" });
    } catch {
      setMessage({ text: "Brak połączenia — spróbuj ponownie.", tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  function tap(userId: string) {
    if (!canEdit || !assignments) return;
    if (!selected) {
      setSelected(userId);
      return;
    }
    if (selected !== userId) update(swapPlayers(assignments, selected, userId), notes);
    else setSelected(null);
  }

  const positionShort = (position: FootballPosition) => FOOTBALL_POSITIONS.find((p) => p.id === position)?.short ?? "";

  return (
    <section
      className="bg-page-2 text-page-ink flex flex-col gap-3 rounded-[20px] px-3.5 py-4"
      data-testid="match-lineup"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display text-[30px] leading-none">Składy na mecz</h2>
        {assignments && !canEdit && <span className="text-page-ink-2 text-xs">Ustawione przez organizatora</span>}
      </div>

      {canEdit && (
        <div className="flex flex-col gap-2.5">
          {(
            [
              ["Drużyna A", teamA, setTeamA, teamB],
              ["Drużyna B", teamB, setTeamB, teamA],
            ] as const
          ).map(([label, value, setValue, other]) => (
            <div key={label} className="flex flex-wrap items-center gap-2">
              <span className="text-page-ink-2 w-20 text-xs font-bold">{label}</span>
              {TEAM_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  disabled={c.hex === other}
                  aria-label={`${label}: ${c.label}`}
                  aria-pressed={value === c.hex}
                  onClick={() => {
                    setValue(c.hex);
                    setDirty(true);
                    setMessage(null);
                  }}
                  className={cn(
                    "size-7 rounded-full border border-black/20 transition-shadow disabled:opacity-25",
                    value === c.hex && "ring-page-ink ring-offset-page-2 ring-2 ring-offset-2",
                  )}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const result = splitByPositions(lineupPlayers);
                update(result.assignments, result.notes);
              }}
              className="bg-card text-ink inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold"
            >
              <Target className="size-4" aria-hidden="true" />
              Wg pozycji
            </button>
            <button
              type="button"
              onClick={() => {
                update(randomSplit(lineupPlayers).assignments);
              }}
              className="bg-card text-ink inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold"
            >
              <Dices className="size-4" aria-hidden="true" />
              Losuj
            </button>
            {assignments && (
              <button
                type="button"
                onClick={() => {
                  update(null);
                }}
                className="text-page-ink-2 hover:text-page-ink inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Na ławkę
              </button>
            )}
          </div>
        </div>
      )}

      <div className="relative w-full" style={{ paddingTop: `${String((height / 100) * 100)}%` }}>
        <svg
          viewBox={`0 0 100 ${String(height)}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <rect x="0" y="0" width="100" height={PITCH} rx="3" fill="#2f8a4e" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x="4" y={4 + i * 35.5} width="92" height="17.75" fill="rgba(255,255,255,0.06)" />
          ))}
          <g fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.5">
            <rect x="4" y="4" width="92" height="142" />
            <line x1="4" y1="75" x2="96" y2="75" />
            <ellipse cx="50" cy="75" rx="11" ry="11" />
            <rect x="24" y="4" width="52" height="19" />
            <rect x="24" y="127" width="52" height="19" />
            <rect x="38" y="1.5" width="24" height="2.5" />
            <rect x="38" y="146" width="24" height="2.5" />
          </g>
          <rect x="0" y={PITCH + 3} width="100" height={height - PITCH - 3} rx="3" fill="#0f3b2e" />
        </svg>

        {players.map((player) => {
          const { x, y } = place(player);
          const assignment = shown?.find((a) => a.user_id === player.userId);
          const color = assignment ? (assignment.team === 0 ? teamA : teamB) : null;
          const Tag = canEdit && assignment ? "button" : "div";
          return (
            <Tag
              key={player.userId}
              type={Tag === "button" ? "button" : undefined}
              onClick={
                Tag === "button"
                  ? () => {
                      tap(player.userId);
                    }
                  : undefined
              }
              aria-pressed={Tag === "button" ? selected === player.userId : undefined}
              className={cn(
                "absolute flex w-[16%] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center",
                "transition-[left,top] duration-1000 ease-[cubic-bezier(.3,1.25,.5,1)]",
                selected === player.userId && "z-10",
              )}
              style={{ left: `${String(x)}%`, top: `${String((y / height) * 100)}%` }}
              data-testid="lineup-player"
              data-team={assignment ? String(assignment.team) : "bench"}
            >
              <span
                className={cn(
                  "relative block w-[68%] rounded-xl",
                  selected === player.userId && "ring-brand ring-[3px] ring-offset-2 ring-offset-transparent",
                )}
              >
                <KitJersey kit={player.kit} width={48} className="block h-auto w-full" />
                <span
                  className="absolute inset-0 transition-opacity delay-500 duration-700"
                  style={{ opacity: color ? 1 : 0 }}
                >
                  {color && (
                    <KitJersey kit={teamKit(color, player.kit.label)} width={48} className="block h-auto w-full" />
                  )}
                </span>
              </span>
              <span className="max-w-full truncate text-[11px] leading-tight font-bold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.7)]">
                {player.name}
              </span>
              <span className="text-[10px] leading-tight text-white/80">{positionShort(player.position)}</span>
            </Tag>
          );
        })}
      </div>

      {notes.length > 0 && <p className="text-bench text-sm">{notes.join(" ")}</p>}
      {canEdit && assignments && (
        <p className="text-page-ink-2 text-xs">Dotknij dwóch graczy, aby zamienić ich miejscami.</p>
      )}
      {!canEdit && !assignments && (
        <p className="text-page-ink-2 text-sm">Organizator jeszcze nie podzielił składu na drużyny.</p>
      )}
      {message && (
        <p
          className={cn("text-sm font-semibold", message.tone === "ok" ? "text-bench" : "text-[#ffb4a6]")}
          role="status"
        >
          {message.text}
        </p>
      )}

      {canEdit && dirty && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void (assignments
              ? send({ action: "save", teamA, teamB, assignments }, "Składy zapisane — widzą je wszyscy w składzie.")
              : send({ action: "clear" }, "Podział usunięty."));
          }}
          className="bg-brand text-on-brand hover:bg-brand-hover h-12 rounded-full text-sm font-extrabold tracking-wide uppercase transition-colors disabled:opacity-60"
        >
          {assignments ? "Zapisz składy" : "Zapisz (bez podziału)"}
        </button>
      )}
    </section>
  );
}
