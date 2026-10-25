// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {}
}

interface ImportMetaEnv {
  /** `fixtures` loads tests/fixtures/questions instead of data/questions (used by e2e). */
  readonly VITE_QUESTIONS?: string;
}

export {};
