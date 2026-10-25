// Room tokens in localStorage: the TV keeps the host token, a phone its player token.
// A phone that reloads (or reconnects) with the same token gets its contestant back.

import type { ClientRole } from '../live/protocol.ts';
import type { TokenStore } from './connection.ts';

const PREFIX = 'domaci-liga:live';

export function tokenKey(role: ClientRole, code: string): string {
  return `${PREFIX}:${role}:${code.toUpperCase()}`;
}

export function readToken(role: ClientRole, code: string): string | undefined {
  try {
    return localStorage.getItem(tokenKey(role, code)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeToken(role: ClientRole, code: string, token: string): void {
  try {
    localStorage.setItem(tokenKey(role, code), token);
  } catch {
    // Private mode: the token lives only in memory for this page.
  }
}

export function tokenStore(role: ClientRole, code: string): TokenStore {
  let memory = readToken(role, code);
  return {
    get: () => memory ?? readToken(role, code),
    set: (token) => {
      memory = token;
      writeToken(role, code, token);
    },
  };
}
