// Czech sentences for the screens of Člověče, nezlob se: what just happened, what the player on
// turn should do, and the numbers read aloud while a pawn walks.

import { TRACK, type CloveceEvent, type CloveceMove, type CloveceSettings } from '../../games/clovece/engine.ts';

export const NUMBER_WORDS = ['nula', 'jedna', 'dvě', 'tři', 'čtyři', 'pět', 'šest'];
const ROLL_WORDS = ['', 'jednička', 'dvojka', 'trojka', 'čtyřka', 'pětka', 'šestka'];

/** „Padla čtyřka.“ */
export function rolledText(value: number | null): string {
  return value ? `Padla ${ROLL_WORDS[value]}.` : '';
}

interface Named {
  id: string;
  name: string;
}

const nameOf = (players: readonly Named[], id: string) => players.find((p) => p.id === id)?.name ?? id;

function triesWord(n: number): string {
  return n === 1 ? 'pokus' : n < 5 ? 'pokusy' : 'pokusů';
}

/** One line of the game log. */
export function eventText(players: readonly Named[], e: CloveceEvent): string {
  const who = nameOf(players, e.playerId);
  switch (e.type) {
    case 'roll':
      if (e.canMove) return `${who} hodil(a) ${e.value}.`;
      if (e.triesLeft > 0) return `${who} hodil(a) ${e.value} — ještě ${e.triesLeft} ${triesWord(e.triesLeft)} na šestku.`;
      return `${who} hodil(a) ${e.value} — nejde táhnout.`;
    case 'move':
      if (e.from < 0) return `${who} nasadil(a) figurku na start.`;
      if (e.to >= TRACK && e.from < TRACK) return `${who} má figurku v domečku!`;
      return `${who} táhne o ${e.value}.`;
    case 'capture':
      return `${who} vyhodil(a) figurku hráče ${nameOf(players, e.victimId)}!`;
    case 'done':
      return `${who} má všechny figurky doma — ${e.place}. místo!`;
  }
}

/** Latest lines first. */
export function recentLines(players: readonly Named[], log: readonly CloveceEvent[], count: number): string[] {
  return log.slice(-count).reverse().map((e) => eventText(players, e));
}

/** What the person on turn should do now (the owl's line). */
export function promptText(
  name: string,
  state: { stage: 'roll' | 'move'; tries: number; dice: number | null; settings: CloveceSettings },
  moves: readonly CloveceMove[],
): string {
  if (state.stage === 'roll') {
    if (state.tries > 1) return `${name}, hoď kostkou! Potřebuješ ${state.settings.enterOnOne ? 'šestku nebo jedničku' : 'šestku'} — máš ${state.tries} ${triesWord(state.tries)}.`;
    return `${name}, hoď kostkou!`;
  }
  if (moves.length === 1) {
    const m = moves[0];
    if (m.kind === 'enter') return `${rolledText(state.dice)} Nasaď figurku na start — ťukni na ni.`;
    return `${rolledText(state.dice)} Táhnout jde jen zvýrazněná figurka — ťukni na ni.`;
  }
  return `${rolledText(state.dice)} Vyber figurku — zvýrazněné můžou táhnout, čárkovaně je vidět, kam dojdou.`;
}
