// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    interface Locals {
      /** Logged-in household (from the signed cookie), null when logged out. */
      household: import('#lib/server/repo/households.ts').Household | null;
      /** Manager logged in by e-mail and password; null for a PIN/device session. */
      account: import('#lib/server/repo/accounts.ts').Account | null;
      /** Household this device remembers (PIN login), even when logged out. */
      deviceHouseholdId: number | null;
    }
  }
}

interface ImportMetaEnv {
  /** `fixtures` loads tests/fixtures/questions instead of data/questions (used by e2e). */
  readonly VITE_QUESTIONS?: string;
}

export {};
