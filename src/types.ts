import type { SportId } from "@/lib/sports";

export type EventStatus = "active" | "cancelled";

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
  /** Pinezka na mapie (opcjonalna, tylko dla zalogowanych). */
  lat: number | null;
  lng: number | null;
}

/** Ograniczony widok ogłoszenia dla gości (FR-001), z liczbą zajętych miejsc. */
export type PublicEvent = Pick<EventRecord, "id" | "sport" | "area" | "starts_at" | "spots" | "organizer_plays"> & {
  accepted_count: number;
};

export type ParticipationStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export interface ParticipationRecord {
  id: string;
  event_id: string;
  user_id: string;
  status: ParticipationStatus;
  created_at: string;
  updated_at: string;
}

/** Uczestnik lub zgłaszający widoczny w szczegółach: tylko nick, nigdy e-mail (FR-006). */
export interface Participant {
  participation_id: string;
  user_id: string;
  display_name: string;
}

/** Szczegóły ogłoszenia dla zalogowanego użytkownika. */
export interface EventDetails extends EventRecord {
  organizer_name: string;
  /** Zaakceptowani uczestnicy. */
  participants: Participant[];
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
  pending_count: number;
  my_status: ParticipationStatus | null;
}
