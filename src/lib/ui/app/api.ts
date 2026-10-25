// Small fetch wrapper for the JSON API: throws ApiError with the server's Czech message.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('Server není dostupný. Zkontroluj připojení.', 0, null);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = (data as { message?: string } | null)?.message ?? `Chyba serveru (${res.status}).`;
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

export const GAME_LABELS = {
  quiz: 'Kvíz',
  aktivity: 'Řekni-ukaž-nakresli',
  mjz: 'Město-jméno-zvíře',
  prsi: 'Prší',
  zoliky: 'Žolíky',
} as const;
export const GAME_EMOJI = { quiz: '🦉', aktivity: '🎭', mjz: '✍️', prsi: '🃏', zoliky: '🂡' } as const;

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' });
}

export function percent(rate: number): string {
  return `${Math.round(rate * 100)} %`;
}

export function placeMedal(place: number | null | undefined): string {
  return place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : place ? `${place}.` : '–';
}
