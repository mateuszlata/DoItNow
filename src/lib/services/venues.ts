import { z } from "astro/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SPORT_IDS } from "@/lib/sports";
import { parsePriceToCents } from "@/lib/money";
import type { Venue, VenueHours, VenueWithHours } from "@/types";

/** Dni tygodnia w kolejności formularza (1 = poniedziałek). */
export const WEEKDAYS = [
  { day: 1, label: "Poniedziałek", short: "Pn" },
  { day: 2, label: "Wtorek", short: "Wt" },
  { day: 3, label: "Środa", short: "Śr" },
  { day: 4, label: "Czwartek", short: "Cz" },
  { day: 5, label: "Piątek", short: "Pt" },
  { day: 6, label: "Sobota", short: "Sb" },
  { day: 7, label: "Niedziela", short: "Nd" },
] as const;

/** Surowe pola formularza obiektu; godziny jako `open-<dzień>`, `opens-<dzień>`, `closes-<dzień>`. */
export interface VenueFormValues {
  name: string;
  area: string;
  address: string;
  lat: string;
  lng: string;
  /** Identyfikator miejsca Google, gdy pinezka pochodzi z podpowiedzi Google. */
  googlePlaceId: string;
  sports: string[];
  price: string;
  hours: Record<number, { open: boolean; opens: string; closes: string }>;
}

export type VenueFieldErrors = Partial<
  Record<"name" | "area" | "address" | "lat" | "sports" | "price" | "hours" | "form", string>
>;

export interface ParsedVenue {
  name: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  googlePlaceId: string | null;
  sports: string[];
  pricePerHourCents: number;
  hours: VenueHours[];
}

const venueSchema = z.object({
  name: z.string().trim().min(2, "Podaj nazwę obiektu (min. 2 znaki).").max(100, "Nazwa może mieć maks. 100 znaków."),
  area: z.string().trim().min(2, "Podaj okolicę (min. 2 znaki).").max(80, "Okolica może mieć maks. 80 znaków."),
  address: z.string().trim().min(2, "Podaj adres (min. 2 znaki).").max(200, "Adres może mieć maks. 200 znaków."),
  sports: z.array(z.enum(SPORT_IDS)).min(1, "Zaznacz co najmniej jeden sport."),
});

const TIME = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export const EMPTY_VENUE_FORM: VenueFormValues = {
  name: "",
  area: "",
  address: "",
  lat: "",
  lng: "",
  googlePlaceId: "",
  sports: [],
  price: "",
  hours: Object.fromEntries(
    WEEKDAYS.map(({ day }) => [day, { open: true, opens: day >= 6 ? "09:00" : "16:00", closes: "22:00" }]),
  ),
};

/** Walidacja formularza obiektu: wymagana pinezka, co najmniej jeden sport i jeden dzień otwarcia. */
export function parseVenueForm(
  input: VenueFormValues,
): { ok: true; data: ParsedVenue } | { ok: false; errors: VenueFieldErrors } {
  const parsed = venueSchema.safeParse(input);
  const errors: VenueFieldErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof VenueFieldErrors;
      errors[key] ??= issue.message;
    }
  }
  const lat = input.lat.trim() === "" ? NaN : Number(input.lat);
  const lng = input.lng.trim() === "" ? NaN : Number(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    errors.lat = "Zaznacz obiekt na mapie — wyszukaj adres albo kliknij w mapę.";
  }
  const price = parsePriceToCents(input.price);
  if (price === null || price > 1000000) errors.price = "Podaj cenę za godzinę w złotych, np. 120 albo 89,50.";

  const hours: VenueHours[] = [];
  for (const { day, label } of WEEKDAYS) {
    const h = input.hours[day];
    if (!h.open) continue;
    if (!TIME.test(h.opens) || !TIME.test(h.closes) || h.closes <= h.opens) {
      errors.hours = `${label}: godzina zamknięcia musi być późniejsza niż otwarcia.`;
      break;
    }
    hours.push({ weekday: day, opens: h.opens, closes: h.closes === "24:00" ? "24:00:00" : h.closes });
  }
  if (!errors.hours && hours.length === 0) errors.hours = "Obiekt musi być otwarty co najmniej jeden dzień w tygodniu.";

  if (!parsed.success || Object.keys(errors).length > 0 || price === null) return { ok: false, errors };
  return {
    ok: true,
    data: {
      ...parsed.data,
      lat,
      lng,
      googlePlaceId: /^[A-Za-z0-9_-]{10,300}$/.test(input.googlePlaceId) ? input.googlePlaceId : null,
      pricePerHourCents: price,
      hours,
    },
  };
}

/** Odczyt pól formularza obiektu z żądania POST. */
export async function readVenueForm(request: Request): Promise<VenueFormValues> {
  const form = await request.formData();
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    name: field("name"),
    area: field("area"),
    address: field("place"),
    lat: field("lat"),
    lng: field("lng"),
    googlePlaceId: field("googlePlaceId"),
    sports: form.getAll("sports").filter((v): v is string => typeof v === "string"),
    price: field("price"),
    hours: Object.fromEntries(
      WEEKDAYS.map(({ day }) => [
        day,
        {
          open: field(`open-${String(day)}`) === "on",
          opens: field(`opens-${String(day)}`),
          closes: field(`closes-${String(day)}`),
        },
      ]),
    ),
  };
}

/** Wartości formularza edycji z zapisanego obiektu. */
export function venueToForm(venue: VenueWithHours): VenueFormValues {
  const byDay = new Map(venue.hours.map((h) => [h.weekday, h]));
  return {
    name: venue.name,
    area: venue.area,
    address: venue.address,
    lat: String(venue.lat),
    lng: String(venue.lng),
    googlePlaceId: venue.google_place_id ?? "",
    sports: venue.sports,
    price: String(venue.price_per_hour_cents / 100).replace(".", ","),
    hours: Object.fromEntries(
      WEEKDAYS.map(({ day }) => {
        const h = byDay.get(day);
        return [
          day,
          h
            ? {
                open: true,
                opens: h.opens.slice(0, 5),
                closes: h.closes.startsWith("24") ? "24:00" : h.closes.slice(0, 5),
              }
            : { open: false, opens: "16:00", closes: "22:00" },
        ];
      }),
    ),
  };
}

type VenueResult = { ok: true; venue: Venue } | { ok: false; errors: VenueFieldErrors };

async function saveHours(supabase: SupabaseClient, venueId: string, hours: VenueHours[]): Promise<boolean> {
  const { error: deleteError } = await supabase.from("venue_hours").delete().eq("venue_id", venueId);
  if (deleteError) return false;
  const { error } = await supabase.from("venue_hours").insert(hours.map((h) => ({ venue_id: venueId, ...h })));
  return !error;
}

/** Dodaje obiekt zalogowanego użytkownika (zostaje jego zarządcą) wraz z godzinami otwarcia. */
export async function createVenue(
  supabase: SupabaseClient,
  managerId: string,
  input: VenueFormValues,
): Promise<VenueResult> {
  const parsed = parseVenueForm(input);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  const { data: venue, error } = await supabase
    .from("venues")
    .insert({
      manager_id: managerId,
      name: d.name,
      area: d.area,
      address: d.address,
      lat: d.lat,
      lng: d.lng,
      sports: d.sports,
      google_place_id: d.googlePlaceId,
      price_per_hour_cents: d.pricePerHourCents,
    })
    .select()
    .single<Venue>();
  if (error) return { ok: false, errors: { form: "Nie udało się zapisać obiektu. Spróbuj ponownie." } };
  if (!(await saveHours(supabase, venue.id, d.hours))) {
    return { ok: false, errors: { hours: "Nie udało się zapisać godzin otwarcia." } };
  }
  return { ok: true, venue };
}

/** Zmienia dane i godziny obiektu; RLS pozwala na to tylko zarządcy. */
export async function updateVenue(
  supabase: SupabaseClient,
  venueId: string,
  input: VenueFormValues,
): Promise<VenueResult> {
  const parsed = parseVenueForm(input);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  const { data: venue, error } = await supabase
    .from("venues")
    .update({
      name: d.name,
      area: d.area,
      address: d.address,
      lat: d.lat,
      lng: d.lng,
      sports: d.sports,
      google_place_id: d.googlePlaceId,
      price_per_hour_cents: d.pricePerHourCents,
    })
    .eq("id", venueId)
    .select()
    .maybeSingle<Venue>();
  if (error || !venue) return { ok: false, errors: { form: "Nie udało się zapisać zmian obiektu." } };
  if (!(await saveHours(supabase, venue.id, d.hours))) {
    return { ok: false, errors: { hours: "Nie udało się zapisać godzin otwarcia." } };
  }
  return { ok: true, venue };
}

const VENUE_COLUMNS = "*, hours:venue_hours(weekday, opens, closes)";

function sortHours(venue: VenueWithHours): VenueWithHours {
  return { ...venue, hours: [...venue.hours].sort((a, b) => a.weekday - b.weekday) };
}

/** Obiekty zarządzane przez użytkownika („Moje obiekty”). */
export async function listMyVenues(supabase: SupabaseClient, managerId: string): Promise<VenueWithHours[]> {
  const { data, error } = await supabase.from("venues").select(VENUE_COLUMNS).eq("manager_id", managerId).order("name");
  if (error) throw new Error(`Nie udało się pobrać obiektów: ${error.message}`);
  return (data as unknown as VenueWithHours[]).map(sortHours);
}

/** Wszystkie obiekty do wyboru w ogłoszeniu. */
export async function listVenues(supabase: SupabaseClient): Promise<VenueWithHours[]> {
  const { data, error } = await supabase.from("venues").select(VENUE_COLUMNS).order("name").limit(300);
  if (error) throw new Error(`Nie udało się pobrać obiektów: ${error.message}`);
  return (data as unknown as VenueWithHours[]).map(sortHours);
}

export async function getVenue(supabase: SupabaseClient, id: string): Promise<VenueWithHours | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from("venues").select(VENUE_COLUMNS).eq("id", id).maybeSingle<VenueWithHours>();
  return data ? sortHours(data) : null;
}

/** Godziny otwarcia jako krótki tekst, np. „Pn–Pt 16:00–22:00 · Sb–Nd 9:00–20:00”. */
export function formatHours(hours: VenueHours[]): string {
  const label = (h: VenueHours) =>
    `${h.opens.slice(0, 5).replace(/^0/, "")}–${h.closes.startsWith("24") ? "24:00" : h.closes.slice(0, 5)}`;
  const groups: { from: number; to: number; text: string }[] = [];
  for (const h of hours) {
    const text = label(h);
    const last = groups.at(-1);
    if (last?.text === text && last.to === h.weekday - 1) last.to = h.weekday;
    else groups.push({ from: h.weekday, to: h.weekday, text });
  }
  const short = (day: number) => WEEKDAYS[day - 1].short;
  return groups
    .map((g) => `${g.from === g.to ? short(g.from) : `${short(g.from)}–${short(g.to)}`} ${g.text}`)
    .join(" · ");
}
