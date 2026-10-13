// Linki „udostępnij przez…” dla menu udostępniania na komputerze. Nic nie jest wysyłane, dopóki
// użytkownik sam nie kliknie opcji — wtedy otwiera się WhatsApp, Gmail itd. z gotową treścią.

export interface ShareInput {
  /** Pełna wiadomość z linkiem na końcu (src/lib/share.ts). */
  text: string;
  url: string;
  /** Temat wiadomości e-mail. */
  subject: string;
}

/** Wiadomość bez linku na końcu — dla serwisów, które dostają adres osobnym parametrem. */
function withoutUrl(text: string, url: string): string {
  const trimmed = text.trimEnd();
  return trimmed.endsWith(url) ? trimmed.slice(0, -url.length).trimEnd() : trimmed;
}

export function whatsappLink({ text }: ShareInput): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function gmailLink({ text, subject }: ShareInput): string {
  const params = new URLSearchParams({ view: "cm", fs: "1", su: subject, body: text });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function mailtoLink({ text, subject }: ShareInput): string {
  // mailto wymaga kodowania %20 zamiast „+”, więc bez URLSearchParams.
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

export function telegramLink({ text, url }: ShareInput): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(withoutUrl(text, url))}`;
}

export function smsLink({ text }: ShareInput): string {
  return `sms:?&body=${encodeURIComponent(text)}`;
}

export const MESSENGER_WEB = "https://www.messenger.com/";
