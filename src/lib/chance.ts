// „Szansa, że mecz się odbędzie” — przejrzysty szacunek z tego, co widać w spotkaniu (bez danych historycznych).
// Cel: minimum organizatora, a bez minimum 80% składu. Liczymy, jak prawdopodobne jest, że dołączy co najmniej
// tylu ludzi, ilu brakuje: oczekiwana liczba chętnych rośnie z wolnymi miejscami i czasem do startu, a każde
// „?” bez odpowiedzi to 60% osoby (rozkład Poissona — zwykły model „ile zdarzeń się wydarzy”).

export interface ChanceInput {
  teamSize: number;
  minPeople: number | null;
  /** Gracze z Metando w składzie + grający organizator + potwierdzeni goście. */
  confirmed: number;
  /** Zaproszeni bez odpowiedzi („?”). */
  pendingInvites: number;
  /** Wolne miejsca do obsadzenia w Metando. */
  freeSpots: number;
  hoursToStart: number;
}

export type ChanceLevel = "high" | "medium" | "low";

export interface Chance {
  percent: number;
  level: ChanceLevel;
  target: number;
}

/** Część wolnych miejsc, która zwykle się zapełnia przy dużym zapasie czasu. */
const JOIN_RATE = 0.6;
/** Tempo zapełniania w godzinach (po ~36 h większość chętnych już dołączyła). */
const JOIN_HOURS = 36;
/** „?” od znajomego jest co najmniej tak pewne jak wolne miejsce — zaproszenie nie może obniżyć szansy. */
const PENDING_WEIGHT = 0.6;

export function chanceTarget(teamSize: number, minPeople: number | null): number {
  return Math.max(1, minPeople ?? Math.ceil(teamSize * 0.8));
}

/** Oczekiwana liczba osób, które jeszcze dojdą: z wolnych miejsc i z zaproszeń bez odpowiedzi. */
function expectedNewPeople(input: ChanceInput): number {
  const time = 1 - Math.exp(-Math.max(input.hoursToStart, 0) / JOIN_HOURS);
  return input.freeSpots * JOIN_RATE * time + input.pendingInvites * PENDING_WEIGHT;
}

/** P(X ≥ k) dla X ~ Poisson(λ). */
function atLeast(k: number, lambda: number): number {
  if (k <= 0) return 1;
  let term = Math.exp(-lambda);
  let below = term;
  for (let i = 1; i < k; i++) {
    term *= lambda / i;
    below += term;
  }
  return Math.max(0, 1 - below);
}

export function meetingChance(input: ChanceInput): Chance {
  const target = chanceTarget(input.teamSize, input.minPeople);
  if (input.confirmed >= target) return { percent: 95, level: "high", target };

  const missing = target - input.confirmed;
  // Więcej nie dojdzie, niż jest miejsc (wolnych + zarezerwowanych dla zaproszonych).
  if (missing > input.freeSpots + input.pendingInvites) return { percent: 5, level: "low", target };
  const probability = atLeast(missing, expectedNewPeople(input));
  const percent = Math.min(90, Math.max(5, Math.round((probability * 100) / 5) * 5));
  return { percent, level: percent >= 70 ? "high" : percent >= 40 ? "medium" : "low", target };
}

export interface ChanceTip {
  kind: "invite" | "share" | "remind" | "minimum" | "reserve";
  text: string;
}

/** Podpowiedzi, co podniesie szansę — z policzonym efektem tam, gdzie to możliwe. */
export function chanceTips(
  input: ChanceInput,
  options: { isOrganizer: boolean; canInvite: boolean; reserveSpots: number },
): ChanceTip[] {
  const current = meetingChance(input);
  const tips: ChanceTip[] = [];
  const missing = Math.max(current.target - input.confirmed, 0);

  if (missing > 0 && options.canInvite && input.freeSpots > 0) {
    const friends = Math.min(2, missing, input.freeSpots);
    const after = meetingChance({
      ...input,
      confirmed: input.confirmed + friends,
      freeSpots: input.freeSpots - friends,
    });
    if (after.percent > current.percent) {
      tips.push({
        kind: "invite",
        text: `Zaproś ${friends === 1 ? "znajomego" : `${String(friends)} znajomych`} — gdy potwierdzą, szansa wzrośnie z ${String(current.percent)}% do ${String(after.percent)}%.`,
      });
    }
  }
  if (input.pendingInvites > 0) {
    tips.push({
      kind: "remind",
      text: `${String(input.pendingInvites)} ${input.pendingInvites === 1 ? "zaproszenie czeka" : "zaproszeń czeka"} na odpowiedź — przypomnij znajomym.`,
    });
  }
  if (missing >= 3 && input.freeSpots > 0) {
    tips.push({ kind: "share", text: "Udostępnij ogłoszenie na grupę — zwykle dołącza kilka osób." });
  }
  if (options.isOrganizer && input.minPeople === null && missing > 0) {
    tips.push({ kind: "minimum", text: "Ustaw minimum — ilu wystarczy, żeby zagrać? Szansa policzy się dokładniej." });
  }
  if (options.isOrganizer && input.freeSpots === 0 && options.reserveSpots === 0) {
    tips.push({ kind: "reserve", text: "Skład pełny — dodaj rezerwę na wypadek rezygnacji." });
  }
  return tips;
}

/** Krótkie wyjaśnienie, z czego wynika szansa. */
export function chanceExplanation(input: ChanceInput, chance: Chance): string {
  const parts = [
    `${String(Math.min(input.confirmed, chance.target))} z ${String(chance.target)} potrzebnych potwierdzonych`,
  ];
  if (input.pendingInvites > 0) parts.push(`zaproszeni bez odpowiedzi: ${String(input.pendingInvites)}`);
  const hours = Math.max(Math.round(input.hoursToStart), 0);
  parts.push(hours >= 48 ? `${String(Math.round(hours / 24))} dni do startu` : `${String(hours)} h do startu`);
  return parts.join(" · ");
}
