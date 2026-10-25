import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type CloveceMove } from '../../../src/lib/games/clovece/engine.ts';
import { eventText, promptText, recentLines, rolledText } from '../../../src/lib/ui/clovece/texts.ts';

const players = [
  { id: 'a', name: 'Ema' },
  { id: 'b', name: 'Táta' },
];
const move = (kind: CloveceMove['kind']): CloveceMove => ({ pawn: 0, from: kind === 'enter' ? -1 : 3, to: kind === 'enter' ? 0 : 7, kind, captures: null });

describe('Člověče texts', () => {
  it('describes rolls, moves, captures and places', () => {
    expect(eventText(players, { seq: 1, type: 'roll', playerId: 'a', value: 3, canMove: false, triesLeft: 2 })).toBe('Ema hodil(a) 3 — ještě 2 pokusy na šestku.');
    expect(eventText(players, { seq: 2, type: 'roll', playerId: 'a', value: 2, canMove: false, triesLeft: 0 })).toMatch(/nejde táhnout/);
    expect(eventText(players, { seq: 3, type: 'move', playerId: 'a', pawn: 0, from: -1, to: 0, value: 6 })).toMatch(/nasadil/);
    expect(eventText(players, { seq: 4, type: 'move', playerId: 'a', pawn: 0, from: 38, to: 41, value: 3 })).toMatch(/v domečku/);
    expect(eventText(players, { seq: 5, type: 'capture', playerId: 'a', victimId: 'b', victimPawn: 0, field: 4 })).toBe('Ema vyhodil(a) figurku hráče Táta!');
    expect(eventText(players, { seq: 6, type: 'done', playerId: 'b', place: 2 })).toMatch(/2\. místo/);
    expect(recentLines(players, [{ seq: 1, type: 'done', playerId: 'a', place: 1 }, { seq: 2, type: 'done', playerId: 'b', place: 2 }], 1)).toHaveLength(1);
  });

  it('tells the player on turn what to do', () => {
    const s = { stage: 'roll' as const, tries: 3, dice: null, settings: DEFAULT_SETTINGS };
    expect(promptText('Ema', s, [])).toBe('Ema, hoď kostkou! Potřebuješ šestku — máš 3 pokusy.');
    expect(promptText('Ema', { ...s, tries: 1 }, [])).toBe('Ema, hoď kostkou!');
    expect(promptText('Ema', { ...s, stage: 'move', dice: 6 }, [move('enter')])).toBe('Padla šestka. Nasaď figurku na start — ťukni na ni.');
    expect(promptText('Ema', { ...s, stage: 'move', dice: 4 }, [move('move'), { ...move('move'), pawn: 1 }])).toMatch(/^Padla čtyřka\. Vyber figurku/);
    expect(rolledText(null)).toBe('');
  });
});
