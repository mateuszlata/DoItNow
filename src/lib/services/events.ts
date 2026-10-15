import { z } from "astro/zod";
import { KIT_COLUMNS, kitFrom, type KitColumns } from "@/lib/kit";
import { isPosition, supportsLineup } from "@/lib/lineup";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SPORT_IDS } from "@/lib/sports";
import { dayRange, localDateTimeToDate, whenRange } from "@/lib/time";
import { levelFitFilter, parseLevelRange, type Level } from "@/lib/levels";
import { isRouteSport } from "@/lib/route";
import { MAX_RADIUS_KM, NEAR_OPTIONS, NO_LIMIT_KM, boundingBox, distanceKm, withinRadius, type Near } from "@/lib/near";
import { isLastMinute } from "@/lib/services/participations";
import { getVenue } from "@/lib/services/venues";
import type {
  EventDetails,
  EventListItem,
  EventRecord,
  GuestGroup,
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
  // Czas trwania w minutach (lista wyboru w formularzu).
  durationMinutes: z.preprocess(
    (v) => (v === "" || v === undefined ? 90 : v),
    z.coerce
      .number({ error: "Wybierz czas trwania." })
      .int("Wybierz czas trwania.")
      .min(15, "Spotkanie musi trwać co najmniej 15 minut.")
      .max(720, "Spotkanie może trwać maks. 12 godzin."),
  ),
  // Obiekt zarządcy (puste = spotkanie poza obiektem).
  venueId: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.uuid({ error: "Wybierz obiekt z listy." }).nullable(),
  ),
  // Liczba osób w całym składzie, łącznie z organizatorem, jeśli bierze udział.
  total: z.coerce
    .number({ error: "Podaj liczbę osób." })
    .int("Liczba osób musi być całkowita.")
    .min(1, "Skład musi mieć co najmniej 1 osobę.")
    .max(50, "Maksymalnie 50 osób."),
  organizerPlays: checkbox,
  // Uczestnicy mogą zapraszać znajomych spoza Metando (domyślnie tak).
  membersCanInvite: checkbox,
  // Goście spoza Metando w chwili otwarcia formularza (ukryte pole; pule zmienia pasek nad składem).
  guests: z.preprocess(
    (v) => (v === "" || v === undefined ? 0 : v),
    z.coerce
      .number({ error: "Podaj liczbę znajomych." })
      .int("Liczba musi być całkowita.")
      .min(0, "Nie może być ujemna.")
      .max(49, "Maksymalnie 49 osób."),
  ),
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
  // Zakres poziomu „min-max” (puste = dla każdego).
  levelRange: z
    .string()
    .optional()
    .refine((v) => v === undefined || v === "" || parseLevelRange(v) !== null, "Wybierz poziom z listy."),
  // Trasa (tylko rower i bieganie): cel albo pętla, dystans, tempo i link do trasy.
  routeDestination: z.string().trim().max(120, "Cel może mieć maks. 120 znaków.").optional(),
  routeLoop: checkbox.optional(),
  routeDistance: z.preprocess(
    (v) => (v === "" || v === undefined ? null : typeof v === "string" ? v.replace(",", ".") : v),
    z.coerce
      .number({ error: "Podaj dystans w km." })
      .gt(0, "Dystans musi być większy od zera.")
      .max(500, "Maksymalnie 500 km.")
      .nullable(),
  ),
  routePace: z.string().trim().max(40, "Tempo może mieć maks. 40 znaków.").optional(),
  routeUrl: z
    .string()
    .trim()
    .max(500, "Link może mieć maks. 500 znaków.")
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Wklej link zaczynający się od https://.")
    .optional(),
});

export type EventFormField = keyof z.input<typeof createEventSchema>;
/** Surowe wartości pól formularza, tak jak przychodzą z przeglądarki (`guests` może nie wystąpić). */
type OptionalFormField =
  | "guests"
  | "membersCanInvite"
  | "levelRange"
  | "routeDestination"
  | "routeLoop"
  | "routeDistance"
  | "routePace"
  | "routeUrl";
export type EventFormValues = Record<Exclude<EventFormField, OptionalFormField>, string> &
  Partial<Record<OptionalFormField, string>>;
export type FieldErrors = Partial<Record<EventFormField | "form", string>>;

export type CreateEventResult = { ok: true; event: EventRecord } | { ok: false; errors: FieldErrors };

/** Dane ogłoszenia po walidacji, gotowe do zapisu. */
export interface ParsedEvent {
  sport: string;
  area: string;
  place: string;
  startsAt: Date;
  durationMinutes: number;
  venueId: string | null;
  /** Miejsca do obsadzenia przez Metando: skład minus organizator, jeśli gra, i jego goście. */
  spots: number;
  /** Goście spoza Metando w chwili otwarcia formularza (do przeliczenia miejsc przy edycji). */
  guestCount: number;
  membersCanInvite: boolean;
  organizerPlays: boolean;
  requiresApproval: boolean;
  reserveSpots: number;
  minPeople: number | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  levelMin: number | null;
  levelMax: number | null;
  /** Trasa — tylko dla roweru i biegania (dla innych sportów puste). */
  routeDestination: string | null;
  routeLoop: boolean;
  routeDistanceKm: number | null;
  routePace: string | null;
  routeUrl: string | null;
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
  const spots = data.total - (data.organizerPlays ? 1 : 0) - data.guests;
  if (data.total - (data.organizerPlays ? 1 : 0) < 1) {
    return { ok: false, errors: { total: "Skoro bierzesz udział, skład musi liczyć co najmniej 2 osoby." } };
  }
  if (spots < 1) {
    return { ok: false, errors: { guests: "Zostaw co najmniej jedno miejsce dla graczy z Metando." } };
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
      durationMinutes: data.durationMinutes,
      venueId: data.venueId,
      spots,
      guestCount: data.guests,
      membersCanInvite: data.membersCanInvite,
      organizerPlays: data.organizerPlays,
      requiresApproval: data.requiresApproval,
      reserveSpots: data.reserveSpots,
      minPeople: data.minPeople,
      lat: data.lat,
      lng: data.lng,
      // puste pole opisu zapisujemy jako brak opisu
      description: data.description === "" ? null : (data.description ?? null),
      levelMin: parseLevelRange(data.levelRange)?.min ?? null,
      levelMax: parseLevelRange(data.levelRange)?.max ?? null,
      ...parseRoute(data),
    },
  };
}

/** Pola trasy po walidacji; poza rowerem i bieganiem trasy nie zapisujemy. */
function parseRoute(data: z.output<typeof createEventSchema>) {
  const route = isRouteSport(data.sport);
  const loop = route && data.routeLoop === true;
  const text = (value: string | undefined) => (value === undefined || value === "" ? null : value);
  return {
    routeDestination: route && !loop ? text(data.routeDestination) : null,
    routeLoop: loop,
    routeDistanceKm: route ? data.routeDistance : null,
    routePace: route ? text(data.routePace) : null,
    routeUrl: route ? text(data.routeUrl) : null,
  };
}

/** Komunikaty reguł obiektu zgłaszanych przez bazę (supabase/migrations/*_venues_and_duration.sql). */
const VENUE_ERRORS: Record<string, FieldErrors> = {
  VENUE_CLOSED: { startsAt: "Obiekt jest wtedy zamknięty — wybierz termin w godzinach otwarcia." },
  VENUE_BUSY: { startsAt: "Obiekt jest w tym czasie zajęty przez inne spotkanie." },
  VENUE_SPORT: { venueId: "Ten obiekt nie oferuje wybranego sportu." },
  VENUE_NOT_FOUND: { venueId: "Nie znaleziono obiektu." },
};

function venueError(error: { code?: string; message: string }): FieldErrors | undefined {
  if (error.code === "23P01") return VENUE_ERRORS.VENUE_BUSY;
  return VENUE_ERRORS[error.message];
}

/** Przy wybranym obiekcie miejsce, okolica i pinezka pochodzą z obiektu. */
async function withVenue(
  supabase: SupabaseClient,
  input: EventFormValues,
): Promise<{ ok: true; values: EventFormValues } | { ok: false; errors: FieldErrors }> {
  if (!input.venueId) return { ok: true, values: input };
  const venue = await getVenue(supabase, input.venueId);
  if (!venue) return { ok: false, errors: { venueId: "Nie znaleziono obiektu." } };
  const values: EventFormValues = {
    ...input,
    place: `${venue.name}, ${venue.address}`.slice(0, 200),
    area: venue.area,
    lat: String(venue.lat),
    lng: String(venue.lng),
  };
  return { ok: true, values };
}

/** Tworzy ogłoszenie zalogowanego użytkownika (FR-003). */
export async function createEvent(
  supabase: SupabaseClient,
  organizerId: string,
  input: EventFormValues,
  now: Date = new Date(),
): Promise<CreateEventResult> {
  const prepared = await withVenue(supabase, input);
  if (!prepared.ok) return prepared;
  const parsed = parseEventForm(prepared.values, now);
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
      members_can_invite: data.membersCanInvite,
      lat: data.lat,
      lng: data.lng,
      reserve_spots: data.reserveSpots,
      min_people: data.minPeople,
      requires_approval: data.requiresApproval,
      duration_minutes: data.durationMinutes,
      venue_id: data.venueId,
      level_min: data.levelMin,
      level_max: data.levelMax,
      route_destination: data.routeDestination,
      route_loop: data.routeLoop,
      route_distance_km: data.routeDistanceKm,
      route_pace: data.routePace,
      route_url: data.routeUrl,
    })
    .select()
    .single<EventRecord>();

  if (error) {
    return {
      ok: false,
      errors: venueError(error) ?? { form: "Nie udało się zapisać ogłoszenia. Spróbuj ponownie." },
    };
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
  const prepared = await withVenue(supabase, input);
  if (!prepared.ok) return prepared;
  const parsed = parseEventForm(prepared.values, now);
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
    p_guest_count: data.guestCount,
    p_members_can_invite: data.membersCanInvite,
    p_lat: data.lat,
    p_lng: data.lng,
    p_reserve_spots: data.reserveSpots,
    p_min_people: data.minPeople,
    p_requires_approval: data.requiresApproval,
    p_duration_minutes: data.durationMinutes,
    p_venue_id: data.venueId,
  });
  if (response.error) {
    const code = response.error.message;
    const known = Object.hasOwn(UPDATE_ERRORS, code) ? UPDATE_ERRORS[code] : venueError(response.error);
    return { ok: false, errors: known ?? { form: "Nie udało się zapisać zmian. Spróbuj ponownie." } };
  }
  const level = await supabase.rpc("set_event_level", {
    p_event_id: eventId,
    p_min: data.levelMin,
    p_max: data.levelMax,
  });
  if (level.error) return { ok: false, errors: { levelRange: "Nie udało się zapisać poziomu." } };
  const route = await supabase.rpc("set_event_route", {
    p_event_id: eventId,
    p_destination: data.routeDestination,
    p_loop: data.routeLoop,
    p_distance_km: data.routeDistanceKm,
    p_pace: data.routePace,
    p_url: data.routeUrl,
  });
  if (route.error) return { ok: false, errors: { routeDistance: "Nie udało się zapisać trasy." } };
  const event = response.data as unknown as EventRecord;
  return {
    ok: true,
    event: {
      ...event,
      level_min: data.levelMin,
      level_max: data.levelMax,
      route_destination: data.routeDestination,
      route_loop: data.routeLoop,
      route_distance_km: data.routeDistanceKm,
      route_pace: data.routePace,
      route_url: data.routeUrl,
    },
  };
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
  /** Jeden sport (starsze linki); `sports` ma pierwszeństwo. */
  sport?: string;
  /** Kilka sportów naraz; pusta lista = wszystkie. */
  sports?: string[];
  day?: string;
  /** Szybki filtr terminu: today | tomorrow | weekend (ma pierwszeństwo przed `day`). */
  when?: string;
  /** „W pobliżu”: tylko spotkania w promieniu od okolicy oglądającego. */
  near?: Near | null;
  /** Kolejność przy „W pobliżu”: najbliższe albo (domyślnie) najwcześniejsze. */
  sort?: "time" | "distance";
  /** „Pasujące do mojego poziomu”: moje deklaracje poziomu w sportach (src/lib/levels.ts, levelFitFilter). */
  levels?: Partial<Record<string, Level>> | null;
}

/** Położenie spotkania na liście: dokładne dla zalogowanych, zaokrąglone z publicznego widoku dla gości. */
function eventPoint(event: EventListItem): { lat: number; lng: number } | null {
  const lat = event.lat ?? event.approx_lat;
  const lng = event.lng ?? event.approx_lng;
  return lat != null && lng != null ? { lat, lng } : null;
}

/**
 * Dopisuje odległość od okolicy oglądającego. Spotkania bez położenia odpadają — chyba że `keepUnplaced`
 * („Bez limitu” pokazuje wszystko; takie spotkania nie mają odległości i trafiają na koniec „Najbliżej”).
 */
function withDistance(rows: EventListItem[], near: Near, keepUnplaced = false): EventListItem[] {
  return rows.flatMap((event) => {
    const point = eventPoint(event);
    if (point) return [{ ...event, distance_km: distanceKm(near, point) }];
    return keepUnplaced ? [event] : [];
  });
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
): Promise<{
  events: EventListItem[];
  hasMore: boolean;
  radiusCounts: Record<number, number> | null;
  /** Sporty spotkań w każdym promieniu, od najczęstszego (podpowiedź w liście promieni). */
  radiusSports: Record<number, string[]> | null;
}> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? EVENTS_PAGE_SIZE, 1), MAX_EVENTS_SHOWN);
  // Zwykły `string`: dosłowna lista kolumn przeciąża typowanie zapytań Supabase.
  const columns: string = options.authenticated
    ? "id, sport, area, place, starts_at, spots, description, organizer_id, accepted_count, organizer_plays, lat, lng, reserve_spots, reserve_count, min_people, requires_approval, duration_minutes, cost_cents, venue_status, guest_count, guest_confirmed, level_min, level_max, route_destination, route_loop, route_distance_km, route_pace"
    : "id, sport, area, starts_at, spots, accepted_count, organizer_plays, reserve_spots, reserve_count, min_people, requires_approval, duration_minutes, cost_cents, venue_status, guest_count, guest_confirmed, approx_lat, approx_lng, level_min, level_max, route_destination, route_loop, route_distance_km, route_pace";
  const near = filters.near ?? null;

  let query = options.authenticated
    ? supabase.from("events").select(columns).eq("status", "active")
    : supabase.from("events_public").select(columns);

  // Jeden element ponad limit mówi, czy pokazać „Pokaż więcej”; id ustala kolejność przy tym samym terminie.
  // Przy „W pobliżu” baza zawęża do prostokąta wokół okolicy (dla największego promienia — żeby policzyć,
  // ile spotkań czeka w każdym), a dokładne koło, kolejność i stronę liczymy tutaj.
  query = query
    .gt("starts_at", now.toISOString())
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(near ? MAX_EVENTS_SHOWN + 1 : limit + 1);
  // „Bez limitu” nie zawęża do prostokąta — odległość liczymy dla wszystkich spotkań.
  if (near && near.radiusKm !== NO_LIMIT_KM) {
    const box = boundingBox({ ...near, radiusKm: MAX_RADIUS_KM });
    const [latColumn, lngColumn] = options.authenticated ? ["lat", "lng"] : ["approx_lat", "approx_lng"];
    query = query
      .gte(latColumn, box.minLat)
      .lte(latColumn, box.maxLat)
      .gte(lngColumn, box.minLng)
      .lte(lngColumn, box.maxLng);
  }

  const sports = (filters.sports ?? (filters.sport ? [filters.sport] : [])).filter((id) =>
    (SPORT_IDS as readonly string[]).includes(id),
  );
  if (sports.length > 0) {
    query = query.in("sport", sports);
  }
  const levelFilter = filters.levels ? levelFitFilter(filters.levels) : null;
  if (levelFilter) {
    query = query.or(levelFilter);
  }
  const quickRange = filters.when ? whenRange(filters.when, now) : null;
  if (quickRange) {
    query = query.gte("starts_at", quickRange.from.toISOString()).lt("starts_at", quickRange.to.toISOString());
  } else if (filters.day) {
    const range = dayRange(filters.day);
    if (range) {
      query = query.gte("starts_at", range.from.toISOString()).lt("starts_at", range.to.toISOString());
    }
  }

  const { data, error, status } = await query;
  if (error) {
    throw new Error(`Nie udało się pobrać ogłoszeń (HTTP ${String(status)}): ${JSON.stringify(error)}`);
  }
  let rows = data as unknown as EventListItem[];
  let radiusCounts: Record<number, number> | null = null;
  let radiusSports: Record<number, string[]> | null = null;
  if (near) {
    const unlimited = near.radiusKm === NO_LIMIT_KM;
    const measured = withDistance(rows, near, unlimited);
    // Ile spotkań (przy tych samych filtrach sportu i terminu) jest w każdym z oferowanych promieni.
    // Liczbę dla „Bez limitu” znamy tylko wtedy, gdy jest wybrany (inaczej baza zwraca okolicę do 200 km).
    const options = NEAR_OPTIONS.filter((km) => km !== NO_LIMIT_KM || unlimited);
    const inside = (km: number) => measured.filter((event) => withinRadius(event.distance_km, km));
    radiusCounts = Object.fromEntries(options.map((km) => [km, inside(km).length]));
    radiusSports = Object.fromEntries(
      options.map((km) => [
        km,
        Object.entries(tally(inside(km)))
          .sort((a, b) => b[1] - a[1])
          .map(([sport]) => sport),
      ]),
    );
    rows = inside(near.radiusKm);
    if (filters.sort === "distance") {
      rows.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
    }
  }
  return { events: rows.slice(0, limit), hasMore: rows.length > limit, radiusCounts, radiusSports };
}

/** Liczba spotkań w każdym sporcie. */
function tally(rows: EventListItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of rows) counts[event.sport] = (counts[event.sport] ?? 0) + 1;
  return counts;
}

/**
 * Ile spotkań czeka w każdym sporcie przy pozostałych filtrach (termin, okolica i promień) —
 * liczby przy kafelkach sportów na liście.
 */
export async function countEventsBySport(
  supabase: SupabaseClient,
  filters: EventFilters,
  options: { authenticated: boolean; now?: Date },
): Promise<Record<string, number>> {
  const { events } = await listUpcomingEvents(
    supabase,
    { ...filters, sport: undefined, sports: [] },
    { ...options, limit: MAX_EVENTS_SHOWN },
  );
  return tally(events);
}

/**
 * Najbliższe spotkania poza promieniem — podpowiedź, gdy „W pobliżu” nic nie znalazło
 * (te same filtry sportu i terminu, bez ograniczenia odległości).
 */
export async function nearestEvents(
  supabase: SupabaseClient,
  filters: EventFilters & { near: Near },
  options: { authenticated: boolean; now?: Date; count?: number },
): Promise<EventListItem[]> {
  const { events } = await listUpcomingEvents(
    supabase,
    { ...filters, near: null },
    { ...options, limit: MAX_EVENTS_SHOWN },
  );
  return withDistance(events, filters.near)
    .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))
    .slice(0, options.count ?? 3);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ograniczone szczegóły dla gościa: tylko nadchodzące, aktywne ogłoszenia (FR-001). */
export async function getPublicEvent(supabase: SupabaseClient, id: string): Promise<PublicEvent | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const { data, error } = await supabase
    .from("events_public")
    .select(
      "id, sport, area, starts_at, spots, accepted_count, organizer_plays, reserve_spots, reserve_count, min_people, requires_approval, duration_minutes, cost_cents, venue_status, guest_count, guest_confirmed, approx_lat, approx_lng, level_min, level_max, route_destination, route_loop, route_distance_km, route_pace",
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
  profile: ({ display_name: string } & KitColumns) | null;
}

function toParticipant(row: ParticipationWithProfile): Participant {
  return {
    participation_id: row.id,
    user_id: row.user_id,
    display_name: row.profile?.display_name ?? "Użytkownik",
    kit: kitFrom(row.profile, row.user_id),
    position: "obojetnie",
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
    .select(`*, organizer:profiles!events_organizer_profile_fkey(display_name, ${KIT_COLUMNS})`)
    .eq("id", id)
    .maybeSingle<EventRecord & { organizer: ({ display_name: string } & KitColumns) | null }>();
  if (error) throw new Error(`Nie udało się pobrać ogłoszenia: ${error.message}`);
  if (!data) return null;

  const { data: rows, error: participationsError } = await supabase
    .from("participations")
    .select(
      `id, user_id, status, stay_confirmed, created_at, updated_at, event_id, profile:profiles(display_name, ${KIT_COLUMNS})`,
    )
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
  // Ulubione pozycje graczy w sporcie wydarzenia (Składy na mecz).
  const positions = new Map<string, string>();
  if (supportsLineup(event.sport)) {
    const userIds = [event.organizer_id, ...all.map((r) => r.user_id)];
    const { data: rowsWithPositions } = await supabase
      .from("player_positions")
      .select("user_id, position")
      .eq("sport", event.sport)
      .in("user_id", userIds);
    for (const row of (rowsWithPositions ?? []) as { user_id: string; position: string }[]) {
      if (isPosition(event.sport, row.position)) positions.set(row.user_id, row.position);
    }
  }
  const { data: inviteRows } = await supabase
    .from("invite_responses")
    .select("id, name, answer, inviter_id")
    .eq("event_id", id)
    .order("created_at", { ascending: true });
  // Pule zaproszeń w składzie (kto zaprosił, ile zarezerwował, kto potwierdził) — tylko dla członków spotkania.
  const groupsResponse = await supabase.rpc("event_guest_groups", { p_event_id: id });
  const groupRows: unknown = groupsResponse.data;
  const guestGroups = (Array.isArray(groupRows) ? groupRows : []) as GuestGroup[];
  const withPosition = (p: Participant): Participant => ({ ...p, position: positions.get(p.user_id) ?? "obojetnie" });
  return {
    ...event,
    organizer_name: organizer?.display_name ?? "Użytkownik",
    organizer_kit: kitFrom(organizer, event.organizer_id),
    organizer_position: positions.get(event.organizer_id) ?? "obojetnie",
    invites: inviteRows ?? [],
    guest_groups: guestGroups,
    participants: participants.map(withPosition),
    reserves: reserves.map(withPosition),
    pending: pending.map(withPosition),
    my_participation: mine,
    free_spots: Math.max(event.spots - participants.length, 0),
  };
}

interface GuestViewRow {
  event: EventRecord;
  me: { name: string; inviter_id: string | null };
  organizer: ({ display_name: string } & KitColumns) | null;
  participations: ParticipationWithProfile[];
  guest_groups: GuestGroup[];
}

/** Spotkanie dla gościa bez konta, który odpowiedział „Będę” (rozpoznany po urządzeniu); null dla innych. */
export async function getGuestEventDetails(
  supabase: SupabaseClient,
  id: string,
  device: string,
): Promise<{ details: EventDetails; guestName: string } | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const response = await supabase.rpc("guest_event_view", { p_event_id: id, p_device: device });
  const row = response.data as GuestViewRow | null;
  if (response.error || !row) return null;
  const participants = row.participations.filter((r) => r.status === "accepted").map(toParticipant);
  const reserves = row.participations.filter((r) => r.status === "reserve").map(toParticipant);
  return {
    guestName: row.me.name,
    details: {
      ...row.event,
      organizer_name: row.organizer?.display_name ?? "Użytkownik",
      organizer_kit: kitFrom(row.organizer, row.event.organizer_id),
      organizer_position: "obojetnie",
      invites: [],
      guest_groups: row.guest_groups,
      participants,
      reserves,
      pending: [],
      my_participation: null,
      free_spots: Math.max(row.event.spots - participants.length, 0),
    },
  };
}

/** Rozkład zadeklarowanych poziomów w składzie (same liczby — dostępne także bez konta). */
export async function getLevelMix(
  supabase: SupabaseClient,
  eventId: string,
): Promise<{ level: number; players: number }[]> {
  const response = await supabase.rpc("event_level_mix", { p_event_id: eventId });
  const rows: unknown = response.data;
  return response.error || !Array.isArray(rows) ? [] : (rows as { level: number; players: number }[]);
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

/** Czy organizator może jeszcze edytować ogłoszenie — najpóźniej 12 h przed spotkaniem (PRD: Business Logic). */
export function canEditEvent(startsAt: string | Date, now: Date = new Date()): boolean {
  return !isLastMinute(startsAt, now);
}

/** Okolica organizatora do formularza ogłoszenia (start mapy, kolejność podpowiedzi, ostrzeżenie o dalekim miejscu). */
export interface PlaceHome {
  lat: number;
  lng: number;
  label: string;
}

/**
 * Okolica z „W pobliżu” (ciasteczko), a bez niej — miejsce ostatniego innego ogłoszenia organizatora.
 * `null`, gdy nie wiemy nic (wtedy mapa startuje z domyślnego środka).
 */
export async function organizerHome(
  supabase: SupabaseClient,
  userId: string,
  near: { lat: number; lng: number; label: string } | null,
  excludeEventId?: string,
): Promise<PlaceHome | null> {
  if (near) return { lat: near.lat, lng: near.lng, label: near.label };
  let query = supabase
    .from("events")
    .select("lat, lng, area")
    .eq("organizer_id", userId)
    .not("lat", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (excludeEventId) query = query.neq("id", excludeEventId);
  const { data } = await query.maybeSingle<{ lat: number; lng: number; area: string }>();
  return data ? { lat: data.lat, lng: data.lng, label: data.area } : null;
}
