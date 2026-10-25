// Where each card of the hand sits. A wide hand overlaps in one row; when the cards would show
// less than a readable strip (16 žolíky cards on a narrow phone), the fan breaks into two rows.

export interface FanSlot {
  x: number;
  y: number;
  rot: number;
}

export interface FanLayout {
  cardWidth: number;
  width: number;
  height: number;
  rows: 1 | 2;
  slots: FanSlot[];
}

/** Room above the cards for lifting the selected one. */
export const FAN_LIFT = 26;
const MIN_CARD = 56;
const MAX_CARD = 96;
/** Visible strip of an overlapped card, as a share of its width (corner index + tap target). */
const MIN_VISIBLE = 0.4;
/** Second row starts this share of the card height below the first one. */
const ROW_OFFSET = 0.52;

function rowStep(count: number, width: number, cardWidth: number): number {
  if (count <= 1) return 0;
  return Math.max(0, Math.min(cardWidth * 0.92, (width - cardWidth - 24) / (count - 1)));
}

function rowSlots(count: number, step: number, maxRot: number, y: number, offsetX: number): FanSlot[] {
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => {
    const rot = count > 1 ? ((i - mid) / Math.max(mid, 1)) * Math.min(maxRot, count) : 0;
    return { x: offsetX + i * step, y, rot };
  });
}

export function fanLayout(count: number, available: number): FanLayout {
  const width = Math.max(0, available);
  const cardWidth = Math.max(MIN_CARD, Math.min(MAX_CARD, width / 6.5));
  const cardHeight = cardWidth * 1.5;
  const single = rowStep(count, width, cardWidth);

  if (count <= 1 || single >= cardWidth * MIN_VISIBLE) {
    const total = cardWidth + single * Math.max(0, count - 1);
    return { cardWidth, width: total, height: cardHeight + FAN_LIFT, rows: 1, slots: rowSlots(count, single, 8, FAN_LIFT, 0) };
  }

  const top = Math.ceil(count / 2);
  const bottom = count - top;
  const step = rowStep(top, width, cardWidth);
  const topWidth = cardWidth + step * (top - 1);
  const bottomWidth = cardWidth + step * Math.max(0, bottom - 1);
  const offset = cardHeight * ROW_OFFSET;
  const slots = [
    ...rowSlots(top, step, 4, FAN_LIFT, 0),
    ...rowSlots(bottom, step, 4, FAN_LIFT + offset, (topWidth - bottomWidth) / 2),
  ];
  return { cardWidth, width: topWidth, height: cardHeight + offset + FAN_LIFT, rows: 2, slots };
}
