// Plain helpers shared by the reactive room (kept out of .svelte.ts so tests import them directly).

export function wsUrl(loc: Pick<Location, 'protocol' | 'host'>): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`;
}

/** Seconds left until `deadline` (server clock), given local time and the server−local offset. */
export function secondsLeft(deadline: number | null, localNow: number, offset: number): number | null {
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - (localNow + offset)) / 1000));
}
