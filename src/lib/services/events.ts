import { z } from "astro/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SPORT_IDS } from "@/lib/sports";
import { dayRange, localDateTimeToDate } from "@/lib/time";
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

export const createEventSchema = z.object({
  sport: z.enum(SPORT_IDS, { error: "Wybierz sport z listy." }),
  area: z.string().trim().min(2, "Podaj okolicę (min. 2 znaki).").max(80, "Okolica może mieć maks. 80 znaków."),
  place: z
    .string()
    .trim()
    .min(2, "Podaj dokładne miejsce (min. 2 znaki).")
    .max(200, "Miejsce może mieć maks. 200 znaków."),
  startsAt: z.string().min(1, "Podaj datę i godzinę."),
  spots: z.coerce
    .number({ error: "Podaj liczbę osób." })
    .int("Liczba osób musi być całkowita.")
    .min(1, "Potrzebna jest co najmniej 1 osoba.")
    .max(50, "Maksymalnie 50 osób."),
  description: z.string().trim().max(1000, "Opis może mieć maks. 1000 znaków.").optional(),
});

export type EventFormField = keyof z.input<typeof createEventSchema>;
/** Surowe wartości pól formularza, tak jak przychodzą z przeglądarki. */
export type EventFormValues = Record<EventFormField, string>;
export type FieldErrors = Partial<Record<EventFormField | "form", string>>;

export type CreateEventResult = { ok: true; event: EventRecord } | { ok: false; errors: FieldErrors };

/**
 * Tworzy ogłoszenie zalogowanego użytkownika. Reguła z PRD: wydarzenie musi być w przyszłości.
 * `now` jest parametrem, żeby regułę dało się testować.
 */
export async function createEvent(
  supabase: SupabaseClient,
  organizerId: string,
  input: EventFormValues,
  now: Date = new Date(),
): Promise<CreateEventResult> {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as EventFormField;
      errors[key] ??= issue.message;
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

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      organizer_id: organizerId,
      sport: data.sport,
      area: data.area,
      place: data.place,
      starts_at: startsAt.toISOString(),
      spots: data.spots,
      // puste pole opisu zapisujemy jako brak opisu
      description: data.description === "" ? null : (data.description ?? null),
    })
    .select()
    .single<EventRecord>();

  if (error) {
    return { ok: false, errors: { form: "Nie udało się zapisać ogłoszenia. Spróbuj ponownie." } };
  }
  return { ok: true, event };
}

export interface EventFilters {
  sport?: string;
  day?: string;
}

/**
 * Nadchodzące, aktywne ogłoszenia od najbliższego (FR-005).
 * Goście dostają ograniczony widok bez dokładnego miejsca, opisu i autora (FR-001).
 */
export async function listUpcomingEvents(
  supabase: SupabaseClient,
  filters: EventFilters,
  options: { authenticated: boolean; now?: Date },
): Promise<EventListItem[]> {
  const now = options.now ?? new Date();
  const columns = options.authenticated
    ? "id, sport, area, place, starts_at, spots, description, organizer_id, accepted_count"
    : "id, sport, area, starts_at, spots, accepted_count";

  let query = options.authenticated
    ? supabase.from("events").select(columns).eq("status", "active")
    : supabase.from("events_public").select(columns);

  query = query.gt("starts_at", now.toISOString()).order("starts_at", { ascending: true }).limit(100);

  if (filters.sport && (SPORT_IDS as readonly string[]).includes(filters.sport)) {
    query = query.eq("sport", filters.sport);
  }
  if (filters.day) {
    const range = dayRange(filters.day);
    if (range) {
      query = query.gte("starts_at", range.from.toISOString()).lt("starts_at", range.to.toISOString());
    }
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Nie udało się pobrać ogłoszeń: ${error.message}`);
  }
  return data as unknown as EventListItem[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ograniczone szczegóły dla gościa: tylko nadchodzące, aktywne ogłoszenia (FR-001). */
export async function getPublicEvent(supabase: SupabaseClient, id: string): Promise<PublicEvent | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const { data, error } = await supabase
    .from("events_public")
    .select("id, sport, area, starts_at, spots, accepted_count")
    .eq("id", id)
    .maybeSingle<PublicEvent>();
  if (error) throw new Error(`Nie udało się pobrać ogłoszenia: ${error.message}`);
  return data;
}

interface ParticipationWithProfile {
  id: string;
  user_id: string;
  status: ParticipationStatus;
  profile: { display_name: string } | null;
}

function toParticipant(row: ParticipationWithProfile): Participant {
  return { participation_id: row.id, user_id: row.user_id, display_name: row.profile?.display_name ?? "Użytkownik" };
}

/**
 * Pełne szczegóły dla zalogowanego (FR-006): nick organizatora, zaakceptowani uczestnicy,
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
    .select("id, user_id, status, created_at, updated_at, event_id, profile:profiles(display_name)")
    .eq("event_id", id)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: true });
  if (participationsError) throw new Error(`Nie udało się pobrać zgłoszeń: ${participationsError.message}`);

  const { data: mine } = await supabase
    .from("participations")
    .select("id, event_id, user_id, status, created_at, updated_at")
    .eq("event_id", id)
    .eq("user_id", viewerId)
    .maybeSingle<ParticipationRecord>();

  const all = rows as unknown as ParticipationWithProfile[];
  const participants = all.filter((r) => r.status === "accepted").map(toParticipant);
  const isOrganizer = data.organizer_id === viewerId;
  const pending = isOrganizer ? all.filter((r) => r.status === "pending").map(toParticipant) : [];

  const { organizer, ...event } = data;
  return {
    ...event,
    organizer_name: organizer?.display_name ?? "Użytkownik",
    participants,
    pending,
    my_participation: mine,
    free_spots: Math.max(event.spots - participants.length, 0),
  };
}

/**
 * „Moje spotkania” (FR-009): ogłoszenia użytkownika i spotkania, na które się zgłosił,
 * posortowane od najbliższego.
 */
export async function listMyEvents(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ organized: MyEventItem[]; joined: MyEventItem[] }> {
  const { data: organized, error: organizedError } = await supabase
    .from("events")
    .select("*, accepted_count, pending_count")
    .eq("organizer_id", userId)
    .order("starts_at", { ascending: true });
  if (organizedError) throw new Error(`Nie udało się pobrać ogłoszeń: ${organizedError.message}`);

  const { data: joined, error: joinedError } = await supabase
    .from("participations")
    .select("status, event:events(*, accepted_count)")
    .eq("user_id", userId)
    .in("status", ["pending", "accepted", "rejected"]);
  if (joinedError) throw new Error(`Nie udało się pobrać zgłoszeń: ${joinedError.message}`);

  const joinedItems = (
    joined as unknown as { status: ParticipationStatus; event: (EventRecord & { accepted_count: number }) | null }[]
  )
    .filter((row) => row.event !== null)
    .map((row) => ({
      ...(row.event as EventRecord & { accepted_count: number }),
      pending_count: 0,
      my_status: row.status,
    }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return {
    organized: (organized as unknown as Omit<MyEventItem, "my_status">[]).map((e) => ({ ...e, my_status: null })),
    joined: joinedItems,
  };
}
