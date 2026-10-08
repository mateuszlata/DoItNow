import type { EventFormValues } from "@/lib/services/events";

export const EMPTY_EVENT_FORM: EventFormValues = {
  sport: "",
  area: "",
  place: "",
  startsAt: "",
  spots: "",
  description: "",
};

/** Odczytuje pola formularza ogłoszenia z żądania POST. */
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
    spots: field("spots"),
    description: field("description"),
  };
}
