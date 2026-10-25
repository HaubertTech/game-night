// Logged-in household, shared by the layout navigation and the pages.

import { api } from './api.ts';

export interface SessionState {
  loaded: boolean;
  household: { id: number; name: string } | null;
  setupRequired: boolean;
  /** The server (or its database) is not reachable. */
  offline: boolean;
}

export const session = $state<SessionState>({ loaded: false, household: null, setupRequired: false, offline: false });

export async function loadSession(): Promise<SessionState> {
  try {
    const me = await api<{ household: SessionState['household']; setup_required: boolean }>('/api/me');
    session.household = me.household;
    session.setupRequired = me.setup_required;
    session.offline = false;
  } catch {
    session.household = null;
    session.offline = true;
  }
  session.loaded = true;
  return session;
}
