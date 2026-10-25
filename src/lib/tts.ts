// Czech read-aloud via the Web Speech API (used mainly for preschool players).

const EMOJI =
  /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{FE0F}\u{FE0E}\u{200D}\u{20E3}]/gu;

const KEYCAP = /[0-9#*]\uFE0F?\u20E3/gu;

/** Removes emoji so the voice does not read "smiling face with…". */
export function stripEmoji(text: string): string {
  return text
    .replace(KEYCAP, '')
    .replace(EMOJI, '').replace(/\s+/g, ' ').trim();
}

export function isSpeechSupported(): boolean {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  } catch {
    return false;
  }
}

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function czechVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  try {
    const voices = window.speechSynthesis.getVoices();
    const czech = voices.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('cs'));
    // Prefer an on-device voice (works offline) and an exact cs-CZ match.
    cachedVoice =
      czech.find((v) => v.localService && v.lang.toLowerCase().replace('_', '-') === 'cs-cz') ??
      czech.find((v) => v.localService) ??
      czech[0] ??
      null;
    return cachedVoice;
  } catch {
    return null;
  }
}

if (isSpeechSupported()) {
  try {
    window.speechSynthesis.addEventListener?.('voiceschanged', () => {
      cachedVoice = undefined;
    });
  } catch {
    // ignore
  }
}

export function stop(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

/** Speaks the given parts one after another (cancels anything currently speaking). */
export function speak(...parts: string[]): void {
  if (!isSpeechSupported()) return;
  try {
    stop();
    const voice = czechVoice();
    for (const part of parts) {
      const text = stripEmoji(part);
      if (!text) continue;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'cs-CZ';
      if (voice) u.voice = voice;
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  } catch (err) {
    console.warn('[tts] speak failed', { err: (err as Error).message });
  }
}

/** "Kdo dělá haf? Pejsek, nebo Kočička?" */
export function questionSpeech(text: string, options: string[] = []): string[] {
  const names = options.map(stripEmoji).filter(Boolean);
  if (names.length === 0) return [text];
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')}, nebo ${names[names.length - 1]}?`;
  return [text, list];
}
