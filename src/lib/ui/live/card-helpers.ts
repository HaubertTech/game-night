// Texts and small derivations for the digital card rooms (prší, žolíky) on the TV and phones.

import { MARIAS_SUIT_LABELS, frenchCardName, mariasCardName } from '../../games/karty-hra/cards.ts';
import type { PrsiEvent } from '../../games/karty-hra/prsi-engine.ts';
import type { ZolikyEvent } from '../../games/karty-hra/zoliky-engine.ts';
import type { PrsiRoomView, TableSeat, ZolikyRoomView } from '../../live/table-games.ts';

export function seatName(seats: readonly TableSeat[], id: string): string {
  return seats.find((s) => s.id === id)?.name ?? id;
}

export function cardsWord(n: number): string {
  return n === 1 ? 'karta' : n >= 2 && n <= 4 ? 'karty' : 'karet';
}

/** One line about a prší event, or null for events not worth showing. */
export function prsiEventText(seats: readonly TableSeat[], e: PrsiEvent): string | null {
  switch (e.type) {
    case 'play':
      return e.suit ? `${seatName(seats, e.playerId)}: svršek, přeje si ${MARIAS_SUIT_LABELS[e.suit]}` : `${seatName(seats, e.playerId)}: ${mariasCardName(e.cardId)}`;
    case 'draw':
      return `${seatName(seats, e.playerId)} bere ${e.count} ${cardsWord(e.count)}${e.penalty ? ' (sedma)' : ''}`;
    case 'stand':
      return `${seatName(seats, e.playerId)} stojí (eso)`;
    case 'out':
      return `${seatName(seats, e.playerId)} je bez karet — ${e.place}. místo`;
    case 'reshuffle':
      return 'Balíček došel, odhozené karty se zamíchaly';
    case 'deal':
      return e.dealIndex > 0 ? `Partie ${e.dealIndex + 1}` : null;
    default:
      return null;
  }
}

export function zolikyEventText(seats: readonly TableSeat[], e: ZolikyEvent): string | null {
  switch (e.type) {
    case 'drawStock':
      return `${seatName(seats, e.playerId)} si líže z balíčku`;
    case 'takeDiscard':
      return `${seatName(seats, e.playerId)} si bere ${frenchCardName(e.cardId)} z odhozených`;
    case 'meld':
      return `${seatName(seats, e.playerId)} vykládá${e.opening ? ' poprvé' : ''}`;
    case 'layOff':
      return `${seatName(seats, e.playerId)} přikládá`;
    case 'swapJoker':
      return `${seatName(seats, e.playerId)} mění žolíka`;
    case 'discard':
      return `${seatName(seats, e.playerId)} odhazuje ${frenchCardName(e.cardId)}`;
    case 'restock':
      return 'Balíček došel, odhozené se otočily';
    case 'close':
      return `${seatName(seats, e.playerId)} zavírá${e.fromHand ? ' z ruky' : ''}!`;
    case 'deal':
      return `Kolo ${e.round + 1}`;
    default:
      return null;
  }
}

/** Last few readable events, newest first. */
export function recentPrsi(view: PrsiRoomView, n = 5): string[] {
  return view.log
    .map((e) => prsiEventText(view.seats, e))
    .filter((t): t is string => !!t)
    .slice(-n)
    .reverse();
}

export function recentZoliky(view: ZolikyRoomView, n = 5): string[] {
  return view.log
    .map((e) => zolikyEventText(view.seats, e))
    .filter((t): t is string => !!t)
    .slice(-n)
    .reverse();
}

/** Prší standings over all deals: sum of places (lower is better), then wins. */
export function prsiStandings(view: PrsiRoomView): { id: string; name: string; placeSum: number; wins: number; place: number }[] {
  const rows = view.players.map((p) => ({
    id: p.id,
    name: p.name,
    placeSum: view.deals.reduce((sum, order) => sum + (order.indexOf(p.id) + 1 || view.players.length), 0),
    wins: view.deals.filter((order) => order[0] === p.id).length,
    place: 0,
  }));
  rows.sort((a, b) => a.placeSum - b.placeSum || b.wins - a.wins);
  rows.forEach((r, i) => (r.place = i > 0 && rows[i - 1].placeSum === r.placeSum && rows[i - 1].wins === r.wins ? rows[i - 1].place : i + 1));
  return rows;
}

/** Žolíky standings by total points (fewer is better). */
export function zolikyStandings(view: ZolikyRoomView): { id: string; name: string; total: number; place: number }[] {
  const rows = view.players.map((p) => ({ id: p.id, name: p.name, total: p.total, place: 0 }));
  rows.sort((a, b) => a.total - b.total);
  rows.forEach((r, i) => (r.place = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].place : i + 1));
  return rows;
}
