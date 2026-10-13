import type { EventFormValues } from "@/lib/services/events";
import { toLocalDateTime } from "@/lib/time";
import { teamSize } from "@/lib/capacity";
import type { EventRecord } from "@/types";

// Nowe ogłoszenie: domyślnie organizator bierze udział.
export const EMPTY_EVENT_FORM: EventFormValues = {
  sport: "",
  area: "",
  place: "",
  startsAt: "",
  durationMinutes: "90",
  venueId: "",
  total: "",
  organizerPlays: "on",
  guests: "",
  membersCanInvite: "on",
  requiresApproval: "",
  reserveSpots: "",
  minPeople: "",
  lat: "",
  lng: "",
  description: "",
};

/** Wartości formularza edycji z zapisanego ogłoszenia. */
export function eventToForm(event: EventRecord): EventFormValues {
  return {
    sport: event.sport,
    area: event.area,
    place: event.place,
    startsAt: toLocalDateTime(event.starts_at),
    durationMinutes: String(event.duration_minutes),
    venueId: event.venue_id ?? "",
    total: String(teamSize(event)),
    organizerPlays: event.organizer_plays ? "on" : "",
    guests: String(event.guest_count),
    membersCanInvite: event.members_can_invite ? "on" : "",
    requiresApproval: event.requires_approval ? "on" : "",
    reserveSpots: event.reserve_spots === 0 ? "" : String(event.reserve_spots),
    minPeople: event.min_people === null ? "" : String(event.min_people),
    lat: event.lat === null ? "" : String(event.lat),
    lng: event.lng === null ? "" : String(event.lng),
    description: event.description ?? "",
  };
}

/** Odczytuje pola formularza ogłoszenia z żądania POST. Niezaznaczone pole wyboru nie jest wysyłane. */
export async function readEventForm(request: Request): Promise<EventFormValues> {
  const form = await request.formData();
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    sport: field("sport"),
    area: field("area"),
    place: field("place"),
    startsAt: field("startsAt"),
    durationMinutes: field("durationMinutes"),
    venueId: field("venueId"),
    total: field("total"),
    organizerPlays: field("organizerPlays"),
    guests: field("guests"),
    membersCanInvite: field("membersCanInvite"),
    requiresApproval: field("requiresApproval"),
    reserveSpots: field("reserveSpots"),
    minPeople: field("minPeople"),
    lat: field("lat"),
    lng: field("lng"),
    description: field("description"),
  };
}
