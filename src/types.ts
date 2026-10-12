import type { PlayerKit } from "@/lib/kit";

import type { SportId } from "@/lib/sports";

/** `organizer_left`: organizator odwołał spotkanie z uczestnikami, czeka na przejęcie przez uczestnika. */
export type EventStatus = "active" | "organizer_left" | "cancelled";

/** Pełne ogłoszenie, widoczne dla zalogowanych użytkowników. */
export interface EventRecord {
  id: string;
  organizer_id: string;
  sport: SportId;
  area: string;
  place: string;
  starts_at: string;
  spots: number;
  description: string | null;
  status: EventStatus;
  created_at: string;
  /** Czy organizator zajmuje miejsce w składzie. */
  organizer_plays: boolean;
  /** Czy zgłoszenia czekają na akceptację organizatora (inaczej dołączenie jest natychmiastowe). */
  requires_approval: boolean;
  /** Pinezka na mapie (opcjonalna, tylko dla zalogowanych). */
  lat: number | null;
  lng: number | null;
  /** Limit listy rezerwowej (0 = bez rezerwy). */
  reserve_spots: number;
  /** Goście organizatora — znajomi spoza Metando zajmujący miejsca w składzie. */
  guest_count: number;
  /** Minimalna liczba osób w składzie (z grającym organizatorem), żeby spotkanie się odbyło. */
  min_people: number | null;
  /** Kiedy pierwotny organizator odwołał spotkanie z uczestnikami. */
  handover_at: string | null;
  /** Czas trwania w minutach i wyliczony koniec spotkania. */
  duration_minutes: number;
  ends_at: string;
  /** Obiekt, na którym odbywa się spotkanie (opcjonalny), i koszt całego spotkania w groszach. */
  venue_id: string | null;
  cost_cents: number | null;
  /** Decyzja zarządcy obiektu o terminie (null, gdy spotkanie nie jest na obiekcie). */
  venue_status: VenueBookingStatus | null;
  venue_decided_at: string | null;
  /** Uzasadnienie zarządcy, np. powód odrzucenia. */
  venue_note: string | null;
}

export type VenueBookingStatus = "pending" | "approved" | "rejected";

/** Ograniczony widok ogłoszenia dla gości (FR-001), z liczbą zajętych miejsc. */
export type PublicEvent = Pick<
  EventRecord,
  | "id"
  | "sport"
  | "area"
  | "starts_at"
  | "spots"
  | "organizer_plays"
  | "reserve_spots"
  | "min_people"
  | "requires_approval"
  | "duration_minutes"
  | "cost_cents"
  | "venue_status"
  | "guest_count"
> & {
  accepted_count: number;
  reserve_count: number;
};

/** `removed`: organizator usunął osobę ze spotkania; nie może zgłosić się ponownie. */
export type ParticipationStatus = "pending" | "accepted" | "reserve" | "rejected" | "withdrawn" | "removed";

export interface ParticipationRecord {
  id: string;
  event_id: string;
  user_id: string;
  status: ParticipationStatus;
  created_at: string;
  updated_at: string;
  /** Odpowiedź na odwołanie przez organizatora (null = brak odpowiedzi). */
  stay_confirmed: boolean | null;
}

/** Uczestnik lub zgłaszający widoczny w szczegółach: tylko nick i strój, nigdy e-mail (FR-006). */
export interface Participant {
  participation_id: string;
  user_id: string;
  display_name: string;
  /** Barwy gracza (własne albo domyślne z id konta). */
  kit: PlayerKit;
  /** Ulubiona pozycja w sporcie wydarzenia („Składy na mecz”); „obojetnie”, gdy brak. */
  position: string;
  /** Po odwołaniu przez organizatora: czy uczestnik potwierdził, że zostaje (null = nie odpowiedział). */
  stay_confirmed?: boolean | null;
}

/** Szczegóły ogłoszenia dla zalogowanego użytkownika. */
export interface EventDetails extends EventRecord {
  organizer_name: string;
  organizer_kit: PlayerKit;
  organizer_position: string;
  /** Odpowiedzi zaproszonych spoza Metando (widoczne dla członków spotkania). */
  invites: { id: string; name: string; answer: "yes" | "no" }[];
  /** Zaakceptowani uczestnicy. */
  participants: Participant[];
  /** Lista rezerwowa w kolejności awansu. */
  reserves: Participant[];
  /** Oczekujące zgłoszenia — wypełnione tylko dla organizatora. */
  pending: Participant[];
  /** Zgłoszenie oglądającego użytkownika, jeśli istnieje. */
  my_participation: ParticipationRecord | null;
  free_spots: number;
}

/** Element listy: pełne dane dla zalogowanych, ograniczone dla gości. */
export type EventListItem = PublicEvent &
  Partial<Pick<EventRecord, "place" | "description" | "organizer_id" | "lat" | "lng">>;

/** Spotkanie na stronie „Moje spotkania” (FR-009). */
export interface MyEventItem extends EventRecord {
  accepted_count: number;
  reserve_count: number;
  /** Zalogowany użytkownik musi odpowiedzieć na odwołanie przez organizatora. */
  needs_answer: boolean;
  pending_count: number;
  my_status: ParticipationStatus | null;
}

/** Obiekt (orlik, hala, korty) prowadzony przez zarządcę terenu. */
export interface Venue {
  id: string;
  manager_id: string;
  name: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  sports: SportId[];
  /** Cena za godzinę w groszach. */
  price_per_hour_cents: number;
  /** Identyfikator miejsca Google (do odświeżania współrzędnych zgodnie z regulaminem Google). */
  google_place_id: string | null;
  created_at: string;
}

/** Godziny otwarcia w danym dniu tygodnia (1 = poniedziałek … 7 = niedziela), czas lokalny „HH:MM:SS”. */
export interface VenueHours {
  weekday: number;
  opens: string;
  closes: string;
}

export type VenueWithHours = Venue & { hours: VenueHours[] };

/** Wiadomość w czacie wydarzenia; treść ukrytej wiadomości nie jest wydawana (body = null). */
export interface ChatMessage {
  id: string;
  author_id: string;
  author_name: string;
  body: string | null;
  created_at: string;
  hidden: boolean;
  /** Strój autora (puste = domyślny z id konta). */
  kit_pattern: string | null;
  kit_primary: string | null;
  kit_secondary: string | null;
  kit_label: string | null;
}

/** Otwarte zgłoszenie wiadomości do moderacji (strona administratora). */
export interface MessageReport {
  message_id: string;
  event_id: string;
  author_name: string;
  body: string;
  created_at: string;
  report_count: number;
  reasons: string[];
  last_reported_at: string;
}
