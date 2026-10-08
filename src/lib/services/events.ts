import { z } from "astro/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SPORT_IDS } from "@/lib/sports";
import { dayRange, localDateTimeToDate } from "@/lib/time";
import { canWithdrawAccepted } from "@/lib/services/participations";
import type {
  EventDetails,
  EventListItem,
  EventRecord,
  MyEventItem,
  Participant,
  ParticipationRecord,
  ParticipationStatus,
  PublicEvent,
} from "@/types";

/** Wartości pola wyboru z formularza HTML: zaznaczone pole wysyła "on". */
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Opcjonalna współrzędna z ukrytego pola formularza (puste = brak pinezki). */
const coordinate = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
    z.number().min(min).max(max).nullable(),
  );

export const createEventSchema = z.object({
  sport: z.enum(SPORT_IDS, { error: "Wybierz sport z listy." }),
  area: z.string().trim().min(2, "Podaj okolicę (min. 2 znaki).").max(80, "Okolica może mieć maks. 80 znaków."),
  place: z
    .string()
    .trim()
    .min(2, "Podaj dokładne miejsce (min. 2 znaki).")
    .max(200, "Miejsce może mieć maks. 200 znaków."),
  startsAt: z.string().min(1, "Podaj datę i godzinę."),
  // Liczba osób w całym składzie, łącznie z organizatorem, jeśli bierze udział.
  total: z.coerce
    .number({ error: "Podaj liczbę osób." })
    .int("Liczba osób musi być całkowita.")
    .min(1, "Skład musi mieć co najmniej 1 osobę.")
    .max(50, "Maksymalnie 50 osób."),
  organizerPlays: checkbox,
  // Zgłoszenia czekają na decyzję organizatora (domyślnie dołączenie jest natychmiastowe).
  requiresApproval: checkbox,
  // Liczba miejsc na liście rezerwowej (puste = brak rezerwy).
  reserveSpots: z.preprocess(
    (v) => (v === "" || v === undefined ? 0 : v),
    z.coerce
      .number({ error: "Podaj liczbę miejsc rezerwowych." })
      .int("Liczba musi być całkowita.")
      .min(0, "Nie może być ujemna.")
      .max(50, "Maksymalnie 50 miejsc."),
  ),
  // Minimalna liczba osób w składzie (puste = bez minimum).
  minPeople: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.coerce
      .number({ error: "Podaj minimalną liczbę osób." })
      .int("Liczba musi być całkowita.")
      .min(1, "Minimum to co najmniej 1 osoba.")
      .nullable(),
  ),
  lat: coordinate(-90, 90),
  lng: coordinate(-180, 180),
  description: z.string().trim().max(1000, "Opis może mieć maks. 1000 znaków.").optional(),
});

export type EventFormField = keyof z.input<typeof createEventSchema>;
/** Surowe wartości pól formularza, tak jak przychodzą z przeglądarki. */
export type EventFormValues = Record<EventFormField, string>;
export type FieldErrors = Partial<Record<EventFormField | "form", string>>;

export type CreateEventResult = { ok: true; event: EventRecord } | { ok: false; errors: FieldErrors };

/** Dane ogłoszenia po walidacji, gotowe do zapisu. */
export interface ParsedEvent {
  sport: string;
  area: string;
  place: string;
  startsAt: Date;
  /** Miejsca do obsadzenia: skład minus organizator, jeśli gra. */
  spots: number;
  organizerPlays: boolean;
  requiresApproval: boolean;
  reserveSpots: number;
  minPeople: number | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
}

/**
 * Wspólna walidacja formularza dodawania i edycji. Reguła z PRD: wydarzenie musi być
 * w przyszłości. `now` jest parametrem, żeby regułę dało się testować.
 */
export function parseEventForm(
  input: EventFormValues,
  now: Date = new Date(),
): { ok: true; data: ParsedEvent } | { ok: false; errors: FieldErrors } {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as EventFormField;
      errors[key] ??= key === "lat" || key === "lng" ? "Nieprawidłowe położenie pinezki." : issue.message;
    }
    return { ok: false, errors };
  }

  const data = parsed.data;
  const startsAt = localDateTimeToDate(data.startsAt);
  if (!startsAt) {
    return { ok: false, errors: { startsAt: "Nieprawidłowa data i godzina." } };
  }
  if (startsAt.getTime() <= now.getTime()) {
    return { ok: false, errors: { startsAt: "Wydarzenie musi odbyć się w przyszłości." } };
  }
  const spots = data.total - (data.organizerPlays ? 1 : 0);
  if (spots < 1) {
    return { ok: false, errors: { total: "Skoro bierzesz udział, skład musi liczyć co najmniej 2 osoby." } };
  }
  if (data.minPeople !== null && data.minPeople > data.total) {
    return { ok: false, errors: { minPeople: "Minimum nie może być większe niż skład." } };
  }
  if ((data.lat === null) !== (data.lng === null)) {
    return { ok: false, errors: { lat: "Nieprawidłowe położenie pinezki." } };
  }
  return {
    ok: true,
    data: {
      sport: data.sport,
      area: data.area,
      place: data.place,
      startsAt,
      spots,
      organizerPlays: data.organizerPlays,
      requiresApproval: data.requiresApproval,
      reserveSpots: data.reserveSpots,
      minPeople: data.minPeople,
      lat: data.lat,
      lng: data.lng,
      // puste pole opisu zapisujemy jako brak opisu
      description: data.description === "" ? null : (data.description ?? null),
    },
  };
}

/** Tworzy ogłoszenie zalogowanego użytkownika (FR-003). */
export async function createEvent(
  supabase: SupabaseClient,
  organizerId: string,
  input: EventFormValues,
  now: Date = new Date(),
): Promise<CreateEventResult> {
  const parsed = parseEventForm(input, now);
  if (!parsed.ok) return parsed;
  const data = parsed.data;

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      organizer_id: organizerId,
      sport: data.sport,
      area: data.area,
      place: data.place,
      starts_at: data.startsAt.toISOString(),
      spots: data.spots,
      description: data.description,
      organizer_plays: data.organizerPlays,
      lat: data.lat,
      lng: data.lng,
      reserve_spots: data.reserveSpots,
      min_people: data.minPeople,
      requires_approval: data.requiresApproval,
    })
    .select()
    .single<EventRecord>();

  if (error) {
    return { ok: false, errors: { form: "Nie udało się zapisać ogłoszenia. Spróbuj ponownie." } };
  }
  return { ok: true, event };
}

/** Błędy reguł edycji zgłaszane przez bazę, przypisane do pól formularza. */
const UPDATE_ERRORS: Record<string, FieldErrors> = {
  EDIT_DEADLINE_PASSED: { form: "Edycja jest możliwa najpóźniej 12 h przed spotkaniem." },
  STARTS_IN_PAST: { startsAt: "Wydarzenie musi odbyć się w przyszłości." },
  SPOTS_BELOW_ACCEPTED: { total: "Skład nie może być mniejszy niż liczba zaakceptowanych uczestników." },
  INVALID_DATA: { form: "Nieprawidłowe dane ogłoszenia." },
  RESERVE_BELOW_COUNT: { reserveSpots: "Lista rezerwowa nie może być krótsza niż liczba osób, które już na niej są." },
  NOT_ORGANIZER: { form: "Tylko organizator może edytować ogłoszenie." },
  EVENT_CANCELLED: { form: "Odwołanego ogłoszenia nie można edytować." },
  EVENT_NOT_FOUND: { form: "Nie znaleziono ogłoszenia." },
};

/**
 * Edycja ogłoszenia przez organizatora (FR-004): najpóźniej 12 h przed dotychczasowym terminem,
 * bez zmniejszania limitu poniżej liczby zaakceptowanych. Reguły pilnuje funkcja w bazie.
 */
export async function updateEvent(
  supabase: SupabaseClient,
  eventId: string,
  input: EventFormValues,
  now: Date = new Date(),
): Promise<CreateEventResult> {
  const parsed = parseEventForm(input, now);
  if (!parsed.ok) return parsed;
  const data = parsed.data;

  const response = await supabase.rpc("update_event", {
    p_event_id: eventId,
    p_sport: data.sport,
    p_area: data.area,
    p_place: data.place,
    p_starts_at: data.startsAt.toISOString(),
    p_spots: data.spots,
    p_description: data.description ?? "",
    p_organizer_plays: data.organizerPlays,
    p_lat: data.lat,
    p_lng: data.lng,
    p_reserve_spots: data.reserveSpots,
    p_min_people: data.minPeople,
    p_requires_approval: data.requiresApproval,
  });
  if (response.error) {
    return {
      ok: false,
      errors: UPDATE_ERRORS[response.error.message] ?? { form: "Nie udało się zapisać zmian. Spróbuj ponownie." },
    };
  }
  return { ok: true, event: response.data as unknown as EventRecord };
}

/** Odwołanie ogłoszenia przez organizatora w dowolnej chwili przed startem (FR-004). */
export async function cancelEvent(
  supabase: SupabaseClient,
  eventId: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  const response = await supabase.rpc("cancel_event", { p_event_id: eventId });
  return response.error ? { ok: false, code: response.error.message } : { ok: true };
}

/** Liczba ogłoszeń na liście; „Pokaż więcej” zwiększa ją o tyle samo. */
export const EVENTS_PAGE_SIZE = 20;
export const MAX_EVENTS_SHOWN = 500;

export interface EventFilters {
  sport?: string;
  day?: string;
}

/**
 * Nadchodzące, aktywne ogłoszenia od najbliższego (FR-005).
 * Goście dostają ograniczony widok bez dokładnego miejsca, opisu i autora (FR-001).
 * Zwraca najwyżej `limit` ogłoszeń i informację, czy są kolejne.
 */
export async function listUpcomingEvents(
  supabase: SupabaseClient,
  filters: EventFilters,
  options: { authenticated: boolean; now?: Date; limit?: number },
): Promise<{ events: EventListItem[]; hasMore: boolean }> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? EVENTS_PAGE_SIZE, 1), MAX_EVENTS_SHOWN);
  const columns = options.authenticated
    ? "id, sport, area, place, starts_at, spots, description, organizer_id, accepted_count, organizer_plays, lat, lng, reserve_spots, reserve_count, min_people, requires_approval"
    : "id, sport, area, starts_at, spots, accepted_count, organizer_plays, reserve_spots, reserve_count, min_people, requires_approval";

  let query = options.authenticated
    ? supabase.from("events").select(columns).eq("status", "active")
    : supabase.from("events_public").select(columns);

  // Jeden element ponad limit mówi, czy pokazać „Pokaż więcej”; id ustala kolejność przy tym samym terminie.
  query = query
    .gt("starts_at", now.toISOString())
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);

  if (filters.sport && (SPORT_IDS as readonly string[]).includes(filters.sport)) {
    query = query.eq("sport", filters.sport);
  }
  if (filters.day) {
    const range = dayRange(filters.day);
    if (range) {
      query = query.gte("starts_at", range.from.toISOString()).lt("starts_at", range.to.toISOString());
    }
  }

  const { data, error, status } = await query;
  if (error) {
    throw new Error(`Nie udało się pobrać ogłoszeń (HTTP ${String(status)}): ${JSON.stringify(error)}`);
  }
  const rows = data as unknown as EventListItem[];
  return { events: rows.slice(0, limit), hasMore: rows.length > limit };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ograniczone szczegóły dla gościa: tylko nadchodzące, aktywne ogłoszenia (FR-001). */
export async function getPublicEvent(supabase: SupabaseClient, id: string): Promise<PublicEvent | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const { data, error } = await supabase
    .from("events_public")
    .select(
      "id, sport, area, starts_at, spots, accepted_count, organizer_plays, reserve_spots, reserve_count, min_people, requires_approval",
    )
    .eq("id", id)
    .maybeSingle<PublicEvent>();
  if (error) throw new Error(`Nie udało się pobrać ogłoszenia: ${error.message}`);
  return data;
}

interface ParticipationWithProfile {
  id: string;
  user_id: string;
  status: ParticipationStatus;
  stay_confirmed: boolean | null;
  profile: { display_name: string } | null;
}

function toParticipant(row: ParticipationWithProfile): Participant {
  return {
    participation_id: row.id,
    user_id: row.user_id,
    display_name: row.profile?.display_name ?? "Użytkownik",
    stay_confirmed: row.stay_confirmed,
  };
}

/**
 * Pełne szczegóły dla zalogowanego (FR-006): nick organizatora, skład, lista rezerwowa,
 * wolne miejsca, własne zgłoszenie oglądającego, a dla organizatora — oczekujące zgłoszenia.
 * Widoczność zgłoszeń ogranicza RLS, więc nie-organizator nie dostanie cudzych oczekujących.
 */
export async function getEventDetails(
  supabase: SupabaseClient,
  id: string,
  viewerId: string,
): Promise<EventDetails | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const { data, error } = await supabase
    .from("events")
    .select("*, organizer:profiles!events_organizer_profile_fkey(display_name)")
    .eq("id", id)
    .maybeSingle<EventRecord & { organizer: { display_name: string } | null }>();
  if (error) throw new Error(`Nie udało się pobrać ogłoszenia: ${error.message}`);
  if (!data) return null;

  const { data: rows, error: participationsError } = await supabase
    .from("participations")
    .select("id, user_id, status, stay_confirmed, created_at, updated_at, event_id, profile:profiles(display_name)")
    .eq("event_id", id)
    .in("status", ["pending", "accepted", "reserve"])
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true });
  if (participationsError) throw new Error(`Nie udało się pobrać zgłoszeń: ${participationsError.message}`);

  const { data: mine } = await supabase
    .from("participations")
    .select("id, event_id, user_id, status, stay_confirmed, created_at, updated_at")
    .eq("event_id", id)
    .eq("user_id", viewerId)
    .maybeSingle<ParticipationRecord>();

  const all = rows as unknown as ParticipationWithProfile[];
  const participants = all.filter((r) => r.status === "accepted").map(toParticipant);
  // Rezerwa w kolejności awansu: najdłużej czekający pierwszy (tak samo jak w bazie).
  const reserves = all.filter((r) => r.status === "reserve").map(toParticipant);
  const isOrganizer = data.organizer_id === viewerId;
  const pending = isOrganizer ? all.filter((r) => r.status === "pending").map(toParticipant) : [];

  const { organizer, ...event } = data;
  return {
    ...event,
    organizer_name: organizer?.display_name ?? "Użytkownik",
    participants,
    reserves,
    pending,
    my_participation: mine,
    free_spots: Math.max(event.spots - participants.length, 0),
  };
}

type MyEventRow = EventRecord & { accepted_count: number; reserve_count: number };

/**
 * „Moje spotkania” (FR-009): ogłoszenia użytkownika i spotkania, na które się zgłosił,
 * posortowane od najbliższego. `needs_answer` oznacza pytanie po odwołaniu przez organizatora.
 */
export async function listMyEvents(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ organized: MyEventItem[]; joined: MyEventItem[] }> {
  const { data: organized, error: organizedError } = await supabase
    .from("events")
    .select("*, accepted_count, pending_count, reserve_count")
    .eq("organizer_id", userId)
    .order("starts_at", { ascending: true });
  if (organizedError) throw new Error(`Nie udało się pobrać ogłoszeń: ${organizedError.message}`);

  const { data: joined, error: joinedError } = await supabase
    .from("participations")
    .select("status, stay_confirmed, event:events(*, accepted_count, reserve_count)")
    .eq("user_id", userId)
    .in("status", ["pending", "accepted", "reserve", "rejected"]);
  if (joinedError) throw new Error(`Nie udało się pobrać zgłoszeń: ${joinedError.message}`);

  const joinedItems = (
    joined as unknown as { status: ParticipationStatus; stay_confirmed: boolean | null; event: MyEventRow | null }[]
  )
    .filter(
      (row): row is { status: ParticipationStatus; stay_confirmed: boolean | null; event: MyEventRow } =>
        row.event !== null,
    )
    .map((row) => ({
      ...row.event,
      pending_count: 0,
      my_status: row.status,
      needs_answer: needsAnswer(row.event, row.status, row.stay_confirmed),
    }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return {
    organized: (organized as unknown as (MyEventRow & { pending_count: number })[]).map((e) => ({
      ...e,
      my_status: null,
      needs_answer: false,
    })),
    joined: joinedItems,
  };
}

/** Liczba zgłoszeń czekających na decyzję w nadchodzących, aktywnych ogłoszeniach użytkownika (znaczek w pasku). */
export async function countPendingRequests(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("events")
    .select("pending_count")
    .eq("organizer_id", userId)
    .eq("status", "active")
    .gt("starts_at", new Date().toISOString());
  if (error) return 0;
  return (data as unknown as { pending_count: number }[]).reduce((sum, e) => sum + e.pending_count, 0);
}

/** Czy uczestnik musi odpowiedzieć, czy zostaje po odwołaniu przez organizatora (ta sama reguła co w bazie). */
export function needsAnswer(
  event: Pick<EventRecord, "handover_at" | "status" | "starts_at">,
  status: ParticipationStatus | null,
  stayConfirmed: boolean | null,
  now: Date = new Date(),
): boolean {
  return (
    event.handover_at !== null &&
    event.status !== "cancelled" &&
    new Date(event.starts_at).getTime() > now.getTime() &&
    status === "accepted" &&
    stayConfirmed === null
  );
}

/** Czy organizator może jeszcze edytować ogłoszenie — ta sama granica 12 h co przy rezygnacji (PRD: Business Logic). */
export function canEditEvent(startsAt: string | Date, now: Date = new Date()): boolean {
  return canWithdrawAccepted(startsAt, now);
}
