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
}

/** Ograniczony widok ogłoszenia dla gości (FR-001). */
export type PublicEvent = Pick<EventRecord, "id" | "sport" | "area" | "starts_at" | "spots">;

/** Uczestnik widoczny w szczegółach ogłoszenia: tylko nick, nigdy e-mail (FR-006). */
export interface Participant {
  user_id: string;
  display_name: string;
}

/** Szczegóły ogłoszenia dla zalogowanego użytkownika. */
export interface EventDetails extends EventRecord {
  organizer_name: string;
  participants: Participant[];
  free_spots: number;
}

/** Element listy: pełne dane dla zalogowanych, ograniczone dla gości. */
export type EventListItem = PublicEvent & Partial<Pick<EventRecord, "place" | "description" | "organizer_id">>;
