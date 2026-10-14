import type { SupabaseClient } from "@supabase/supabase-js";

// Ustawienia powiadomień (supabase/migrations/*_notifications.sql): główny wyłącznik i tabela
// rodzaj × sposób. Brak wiersza w bazie = wartości domyślne.

export const NOTIFICATION_CATEGORIES = [
  {
    id: "activity",
    label: "Moje spotkania",
    hint: "Ktoś dołączył, zgłosił się do akceptacji albo zrezygnował — gdy organizujesz.",
  },
  {
    id: "status",
    label: "Mój udział",
    hint: "Zgłoszenie zaakceptowane lub odrzucone, awans z rezerwy do składu.",
  },
  { id: "changes", label: "Zmiany w spotkaniu", hint: "Odwołanie, nowy termin albo miejsce." },
  { id: "reminder", label: "Przypomnienia", hint: "Dzień przed meczem, w którym grasz." },
  { id: "chat", label: "Czat", hint: "Nowe wiadomości w spotkaniach — zbiorczo, nie po każdej." },
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]["id"];
export type NotificationChannel = "email" | "push";

export type NotificationSettings = { enabled: boolean } & Record<
  `${NotificationCategory}_${NotificationChannel}`,
  boolean
>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  activity_email: true,
  activity_push: true,
  status_email: true,
  status_push: true,
  changes_email: true,
  changes_push: true,
  reminder_email: true,
  reminder_push: true,
  chat_email: false,
  chat_push: true,
};

const SETTING_KEYS = Object.keys(DEFAULT_NOTIFICATION_SETTINGS) as (keyof NotificationSettings)[];

export async function getNotificationSettings(supabase: SupabaseClient, userId: string): Promise<NotificationSettings> {
  const { data } = await supabase
    .from("notification_settings")
    .select(SETTING_KEYS.join(", "))
    .eq("user_id", userId)
    .maybeSingle<NotificationSettings>();
  return data ?? DEFAULT_NOTIFICATION_SETTINGS;
}

/** Ustawienia z formularza: zaznaczone pola = włączone (niezaznaczone pola formularz pomija). */
export function settingsFromForm(form: FormData): NotificationSettings {
  return Object.fromEntries(SETTING_KEYS.map((key) => [key, form.get(key) === "on"])) as NotificationSettings;
}

export async function saveNotificationSettings(
  supabase: SupabaseClient,
  userId: string,
  settings: NotificationSettings,
): Promise<boolean> {
  const { error } = await supabase
    .from("notification_settings")
    .upsert({ user_id: userId, ...settings, updated_at: new Date().toISOString() });
  return !error;
}
