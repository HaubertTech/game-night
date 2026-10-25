// Logged-in household, shared by the layout navigation and the pages.

import { api } from './api.ts';

export interface SessionState {
  loaded: boolean;
  household: { id: number; name: string } | null;
  /** Manager logged in by e-mail and password; null on a PIN device. */
  account: { id: number; email: string; email_verified: boolean } | null;
  role: 'manager' | 'device' | null;
  hasPin: boolean;
  /** Household from before accounts: the manager should add e-mail and password. */
  needsAccount: boolean;
  /** Logged out on a device that remembers its household (PIN login). */
  deviceHousehold: { id: number; name: string; has_pin: boolean } | null;
  setupRequired: boolean;
  /** The server (or its database) is not reachable. */
  offline: boolean;
}

export const session = $state<SessionState>({
  loaded: false,
  household: null,
  account: null,
  role: null,
  hasPin: false,
  needsAccount: false,
  deviceHousehold: null,
  setupRequired: false,
  offline: false,
});

interface Me {
  household: SessionState['household'];
  account: SessionState['account'];
  role: SessionState['role'];
  has_pin: boolean;
  needs_account: boolean;
  device_household: SessionState['deviceHousehold'];
  setup_required: boolean;
}

export async function loadSession(): Promise<SessionState> {
  try {
    const me = await api<Me>('/api/me');
    session.household = me.household;
    session.account = me.account;
    session.role = me.role;
    session.hasPin = me.has_pin;
    session.needsAccount = me.needs_account;
    session.deviceHousehold = me.device_household;
    session.setupRequired = me.setup_required;
    session.offline = false;
  } catch {
    session.household = null;
    session.account = null;
    session.role = null;
    session.offline = true;
  }
  session.loaded = true;
  return session;
}
