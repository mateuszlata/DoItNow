import { z } from "astro/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SPORT_IDS } from "@/lib/sports";
import { dayRange, localDateTimeToDate } from "@/lib/time";
import type { EventListItem, EventRecord } from "@/types";

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
    ? "id, sport, area, place, starts_at, spots, description, organizer_id"
    : "id, sport, area, starts_at, spots";

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
