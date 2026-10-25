// „Řekni, ukaž, nakresli“ as a pure reducer (TV = host, phones = players).
//
// Teams take turns; inside a team the players rotate. The explainer picks a difficulty, the
// engine draws a card for the explainer's level, and only the explainer's phone (plus the adult
// helper of a preschooler) sees the word until the turn ends. The team guesses aloud; the host or
// the explainer taps „uhodli“ or „přeskočit“, the server sends `timeout` once `deadline` passes.
//
// The state is plain JSON. Time never comes from the clock here: every action carries `now`
// (epoch ms). Randomness comes only from `config.seed` (mulberry32), so a game replays exactly.

import type { Level } from '../../types.ts';
import type { MatchParticipant, MatchResult } from '../../league/types.ts';
import { mulberry32, pickIndex, seedFromString, shuffle } from '../../engine/rng.ts';
import {
  DIFFICULTIES,
  modesForLevel,
  type AktivityCard,
  type AktivityMode,
  type Difficulty,
} from './types.ts';

export const AKTIVITY_STATE_VERSION = 1;
export const DEFAULT_TIMER_SECONDS = 60;
export const MIN_TIMER_SECONDS = 10;
export const MAX_TIMER_SECONDS = 300;
/** Cards kept per level and difficulty; enough for a long evening, small enough to send around. */
export const DEFAULT_DECK_SIZE = 40;
/** A tap that arrives this late after the deadline still counts (network + reaction time). */
export const GUESS_GRACE_MS = 1500;
export const MIN_TEAMS = 2;
export const MAX_TEAMS = 4;

export interface AktivityPlayer {
  /** Player profile id (league memberIds). */
  id: string;
  name: string;
  avatar?: string;
  /** Decides the level of the words the player explains. */
  level: Level;
}

export interface AktivityTeam {
  id: string;
  name: string;
  avatar?: string;
  /** Explaining order inside the team. A pair is a team of two. */
  players: AktivityPlayer[];
}

export type AktivityGoal = { kind: 'points'; points: number } | { kind: 'rounds'; rounds: number };

export interface AktivityConfig {
  seed: number;
  /** Seconds per turn. */
  timerSeconds: number;
  /** Points: the game ends after the round in which a team reaches them. Rounds: after N rounds. */
  goal: AktivityGoal;
  /** Probability (0–1) that a turn is „všichni hádají“: any team may guess and take the points. */
  allPlayChance: number;
  deckSize: number;
}

export type AktivityPhase = 'setup' | 'turnIntro' | 'playing' | 'result' | 'finished';

export type TurnOutcome = 'guessed' | 'skipped' | 'timeout';

export interface CurrentTurn {
  /** 0-based turn number in the game. */
  index: number;
  /** 0-based round (every team explained once per round). */
  round: number;
  teamId: string;
  explainerId: string;
  /** Adult teammate who reads the word to a preschool explainer; null otherwise. */
  helperId: string | null;
  /** Chosen in turnIntro; points for a guessed word. */
  difficulty: Difficulty | null;
  /** Filled when the turn starts. */
  cardId: string | null;
  mode: AktivityMode | null;
  allPlay: boolean;
  startedAt: number | null;
}

export interface TurnRecord {
  index: number;
  round: number;
  teamId: string;
  explainerId: string;
  cardId: string;
  mode: AktivityMode;
  difficulty: Difficulty;
  allPlay: boolean;
  outcome: TurnOutcome;
  /** Team that guessed the word (on an all-play card possibly another team); null otherwise. */
  scoringTeamId: string | null;
  points: number;
  startedAt: number;
  endedAt: number;
}

export interface AktivityState {
  mode: 'aktivity';
  version: number;
  id: string;
  createdAt: string;
  nightId: string | null;
  config: AktivityConfig;
  teams: AktivityTeam[];
  phase: AktivityPhase;
  /** Index into `teams` of the team on turn. */
  teamCursor: number;
  /** Next explainer index per team (mod team size). */
  playerCursor: Record<string, number>;
  current: CurrentTurn | null;
  /** Epoch ms when the running turn times out; null outside `playing`. */
  deadline: number | null;
  /** Remaining card ids per level and difficulty, drawn from the front. */
  decks: Partial<Record<Level, Record<Difficulty, string[]>>>;
  cards: Record<string, AktivityCard>;
  history: TurnRecord[];
  scores: Record<string, number>;
  warnings: string[];
}

export type Actor = { role: 'host' } | { role: 'contestant'; contestantId: string } | { role: 'system' };

export type AktivityCommand =
  | { type: 'configure'; timerSeconds?: number; goal?: AktivityGoal; allPlayChance?: number }
  | { type: 'start' }
  | { type: 'chooseDifficulty'; difficulty: Difficulty }
  | { type: 'startTurn'; difficulty?: Difficulty }
  /** „Uhodli“; `teamId` names the guessing team on an all-play card (default: explainer's team). */
  | { type: 'guessed'; teamId?: string }
  /** „Vzdáváme / přeskočit“: the turn ends without points. */
  | { type: 'skip' }
  | { type: 'timeout' }
  | { type: 'next' }
  | { type: 'end' };

export type AktivityAction = AktivityCommand & { by: Actor; now: number };

export type AktivityError =
  | 'forbidden'
  | 'wrongPhase'
  | 'invalidConfig'
  | 'invalidDifficulty'
  | 'noDifficulty'
  | 'unknownTeam'
  | 'deckEmpty'
  | 'notYet'
  | 'timeUp';

export type AktivityResult =
  | { ok: true; state: AktivityState }
  | { ok: false; error: AktivityError; state: AktivityState };

export interface CreateAktivityInput {
  id?: string;
  createdAt?: string;
  nightId?: string | null;
  seed: number;
  teams: AktivityTeam[];
  timerSeconds?: number;
  goal?: AktivityGoal;
  allPlayChance?: number;
  deckSize?: number;
}

// ---------- setup ----------

/** Errors of a team setup (Czech, for the UI); empty = valid. */
export function validateTeams(teams: AktivityTeam[]): string[] {
  const errors: string[] = [];
  if (teams.length < MIN_TEAMS || teams.length > MAX_TEAMS) errors.push(`Hrají ${MIN_TEAMS} až ${MAX_TEAMS} týmy.`);
  const ids = new Set<string>();
  for (const t of teams) {
    if (ids.has(t.id)) errors.push(`Tým je zadaný dvakrát: ${t.id}`);
    ids.add(t.id);
    if (t.players.length < 2) errors.push(`Tým ${t.name} potřebuje aspoň dva hráče (jeden vysvětluje, druhý hádá).`);
  }
  const players = new Set<string>();
  for (const p of teams.flatMap((t) => t.players)) {
    if (players.has(p.id)) errors.push(`Hráč je ve dvou týmech: ${p.name}`);
    players.add(p.id);
  }
  return errors;
}

function validGoal(goal: AktivityGoal): boolean {
  const n = goal.kind === 'points' ? goal.points : goal.rounds;
  return Number.isInteger(n) && n > 0 && n <= 1000;
}

function validTimer(s: number): boolean {
  return Number.isInteger(s) && s >= MIN_TIMER_SECONDS && s <= MAX_TIMER_SECONDS;
}

function validChance(p: number): boolean {
  return typeof p === 'number' && p >= 0 && p <= 1;
}

/** Card ids per difficulty for one level: unseen first, then seen, each part shuffled by the seed. */
function buildDeck(
  level: Level,
  pool: AktivityCard[],
  seen: ReadonlySet<string>,
  seed: number,
  size: number,
): Record<Difficulty, string[]> {
  const modes = modesForLevel(level);
  const deck = {} as Record<Difficulty, string[]>;
  for (const d of DIFFICULTIES) {
    const rand = mulberry32(seedFromString(`${seed}:${level}:${d}`));
    const fits = pool.filter((c) => c.level === level && c.difficulty === d && (c.mode === 'any' || modes.includes(c.mode)));
    const fresh = shuffle(fits.filter((c) => !seen.has(c.id)), rand);
    const old = shuffle(fits.filter((c) => seen.has(c.id)), rand);
    deck[d] = [...fresh, ...old].slice(0, size).map((c) => c.id);
  }
  return deck;
}

/**
 * New game in `setup`. `seen` = card ids the household already played (they go to the end of the
 * deck, so they come back only when the fresh cards run out). Throws on an invalid team setup.
 */
export function createAktivity(
  input: CreateAktivityInput,
  pool: AktivityCard[],
  seen: readonly string[] = [],
): AktivityState {
  const errors = validateTeams(input.teams);
  if (errors.length > 0) throw new Error(errors.join(' '));
  const config: AktivityConfig = {
    seed: input.seed >>> 0,
    timerSeconds: input.timerSeconds ?? DEFAULT_TIMER_SECONDS,
    goal: input.goal ?? { kind: 'points', points: 30 },
    allPlayChance: input.allPlayChance ?? 0,
    deckSize: input.deckSize ?? DEFAULT_DECK_SIZE,
  };
  if (!validTimer(config.timerSeconds) || !validGoal(config.goal) || !validChance(config.allPlayChance)) {
    throw new Error('Neplatné nastavení hry.');
  }
  const levels = [...new Set(input.teams.flatMap((t) => t.players.map((p) => p.level)))];
  const seenSet = new Set(seen);
  const decks: AktivityState['decks'] = {};
  const cards: Record<string, AktivityCard> = {};
  const byId = new Map(pool.map((c) => [c.id, c]));
  const warnings: string[] = [];
  for (const level of levels) {
    const deck = buildDeck(level, pool, seenSet, config.seed, config.deckSize);
    decks[level] = deck;
    for (const ids of Object.values(deck)) for (const id of ids) cards[id] = byId.get(id)!;
    if (DIFFICULTIES.every((d) => deck[d].length === 0)) warnings.push(`Pro úroveň ${level} nejsou žádná slova.`);
  }
  return {
    mode: 'aktivity',
    version: AKTIVITY_STATE_VERSION,
    id: input.id ?? `aktivity-${config.seed.toString(36)}`,
    createdAt: input.createdAt ?? '',
    nightId: input.nightId ?? null,
    config,
    teams: input.teams,
    phase: 'setup',
    teamCursor: 0,
    playerCursor: Object.fromEntries(input.teams.map((t) => [t.id, 0])),
    current: null,
    deadline: null,
    decks,
    cards,
    history: [],
    scores: Object.fromEntries(input.teams.map((t) => [t.id, 0])),
    warnings,
  };
}

// ---------- selectors ----------

export function findPlayer(state: AktivityState, playerId: string): { team: AktivityTeam; player: AktivityPlayer } | undefined {
  for (const team of state.teams) {
    const player = team.players.find((p) => p.id === playerId);
    if (player) return { team, player };
  }
  return undefined;
}

export function teamOnTurn(state: AktivityState): AktivityTeam {
  return state.teams[state.teamCursor];
}

/** Who explains next in the team on turn. */
export function nextExplainer(state: AktivityState): AktivityPlayer {
  const team = teamOnTurn(state);
  return team.players[state.playerCursor[team.id] % team.players.length];
}

/** The card of the current turn (only once the turn has started). */
export function currentCard(state: AktivityState): AktivityCard | null {
  const id = state.current?.cardId;
  return id ? state.cards[id] ?? null : null;
}

/** May this viewer see the word of the running turn? */
export function seesWord(state: AktivityState, playerId: string): boolean {
  const c = state.current;
  return c !== null && (c.explainerId === playerId || c.helperId === playerId);
}

export interface AktivityStanding {
  teamId: string;
  score: number;
  guessed: number;
  place: number;
}

/** Teams by score (ties: more guessed words), competition ranking 1, 1, 3. */
export function aktivityStandings(state: AktivityState): AktivityStanding[] {
  const rows = state.teams.map((t) => ({
    teamId: t.id,
    score: state.scores[t.id] ?? 0,
    guessed: state.history.filter((h) => h.scoringTeamId === t.id).length,
    place: 0,
  }));
  const cmp = (a: AktivityStanding, b: AktivityStanding) => b.score - a.score || b.guessed - a.guessed;
  rows.sort(cmp);
  rows.forEach((r, i) => {
    r.place = i > 0 && cmp(rows[i - 1], r) === 0 ? rows[i - 1].place : i + 1;
  });
  return rows;
}

export function aktivityWinners(state: AktivityState): string[] {
  if (state.history.length === 0) return [];
  return aktivityStandings(state)
    .filter((r) => r.place === 1)
    .map((r) => r.teamId);
}

export type AktivityMatchResult = MatchResult & { gameType: 'aktivity' };

/** League result of the game: every team is one seat, `score` = points. */
export function aktivityToMatchResult(state: AktivityState, playedAt: string = state.createdAt): AktivityMatchResult {
  const teams = new Map(state.teams.map((t) => [t.id, t]));
  return {
    matchId: state.id,
    gameType: 'aktivity',
    playedAt,
    nightId: state.nightId,
    participants: aktivityStandings(state).map(
      (r): MatchParticipant => ({
        participantId: r.teamId,
        kind: 'team',
        memberIds: teams.get(r.teamId)!.players.map((p) => p.id),
        place: r.place,
        score: r.score,
      }),
    ),
  };
}

export { aktivityToMatchResult as toMatchResult };

// ---------- transitions ----------

/** Preschoolers explain with an adult who reads them the word; prefer hospoda, then lavice. */
function helperFor(team: AktivityTeam, explainer: AktivityPlayer): string | null {
  if (explainer.level !== 'piskoviste') return null;
  const mates = team.players.filter((p) => p.id !== explainer.id);
  return (mates.find((p) => p.level === 'hospoda') ?? mates.find((p) => p.level === 'lavice'))?.id ?? null;
}

function enterTurnIntro(state: AktivityState): AktivityState {
  const team = teamOnTurn(state);
  const explainer = nextExplainer(state);
  const index = state.history.length;
  return {
    ...state,
    phase: 'turnIntro',
    deadline: null,
    current: {
      index,
      round: Math.floor(index / state.teams.length),
      teamId: team.id,
      explainerId: explainer.id,
      helperId: helperFor(team, explainer),
      difficulty: null,
      cardId: null,
      mode: null,
      allPlay: false,
      startedAt: null,
    },
  };
}

const normWord = (w: string) => w.trim().toLocaleLowerCase('cs');

/** Wanted difficulty first, then the nearest other one (4 → 3 → 5 etc.). */
function difficultyOrder(d: Difficulty): Difficulty[] {
  return [...DIFFICULTIES].sort((a, b) => Math.abs(a - d) - Math.abs(b - d) || a - b);
}

function drawCard(
  state: AktivityState,
  level: Level,
  wanted: Difficulty,
): { decks: AktivityState['decks']; card: AktivityCard } | null {
  const deck = state.decks[level];
  if (!deck) return null;
  // The same word can sit in two levels' decks; it is played at most once per game.
  const played = new Set(state.history.map((h) => normWord(state.cards[h.cardId]?.word ?? '')));
  for (const d of difficultyOrder(wanted)) {
    const rest = deck[d].filter((id) => !played.has(normWord(state.cards[id].word)));
    const [id, ...remaining] = rest;
    if (id === undefined) continue;
    return { decks: { ...state.decks, [level]: { ...deck, [d]: remaining } }, card: state.cards[id] };
  }
  return null;
}

function finishTurn(state: AktivityState, outcome: TurnOutcome, now: number, scoringTeamId: string | null): AktivityState {
  const c = state.current!;
  const card = state.cards[c.cardId!];
  const points = outcome === 'guessed' ? card.difficulty : 0;
  const record: TurnRecord = {
    index: c.index,
    round: c.round,
    teamId: c.teamId,
    explainerId: c.explainerId,
    cardId: card.id,
    mode: c.mode!,
    difficulty: card.difficulty,
    allPlay: c.allPlay,
    outcome,
    scoringTeamId: outcome === 'guessed' ? scoringTeamId : null,
    points,
    startedAt: c.startedAt!,
    endedAt: now,
  };
  const scores = { ...state.scores };
  if (record.scoringTeamId) scores[record.scoringTeamId] = (scores[record.scoringTeamId] ?? 0) + points;
  return { ...state, phase: 'result', deadline: null, history: [...state.history, record], scores };
}

function goalReached(state: AktivityState): boolean {
  const { goal } = state.config;
  // Only at the end of a round, so every team explained the same number of times.
  if (state.history.length % state.teams.length !== 0) return false;
  if (goal.kind === 'rounds') return state.history.length >= goal.rounds * state.teams.length;
  return Object.values(state.scores).some((s) => s >= goal.points);
}

function isDifficulty(d: unknown): d is Difficulty {
  return (DIFFICULTIES as readonly unknown[]).includes(d);
}

// ---------- reducer ----------

const fail = (state: AktivityState, error: AktivityError): AktivityResult => ({ ok: false, error, state });
const ok = (state: AktivityState): AktivityResult => ({ ok: true, state });

/** Host, or the explainer (and a preschooler's helper) of the current turn. */
function controlsTurn(state: AktivityState, by: Actor): boolean {
  if (by.role === 'host') return true;
  return by.role === 'contestant' && seesWord(state, by.contestantId);
}

/** Applies an action and says why it was refused. Never mutates `state`. */
export function applyAktivity(state: AktivityState, action: AktivityAction): AktivityResult {
  const { by, now } = action;
  if (action.type !== 'timeout' && by.role === 'system') return fail(state, 'forbidden');
  if (by.role === 'contestant' && !findPlayer(state, by.contestantId)) return fail(state, 'forbidden');

  switch (action.type) {
    case 'configure': {
      if (by.role !== 'host') return fail(state, 'forbidden');
      if (state.phase !== 'setup') return fail(state, 'wrongPhase');
      const config = {
        ...state.config,
        ...(action.timerSeconds !== undefined ? { timerSeconds: action.timerSeconds } : {}),
        ...(action.goal !== undefined ? { goal: action.goal } : {}),
        ...(action.allPlayChance !== undefined ? { allPlayChance: action.allPlayChance } : {}),
      };
      if (!validTimer(config.timerSeconds) || !validGoal(config.goal) || !validChance(config.allPlayChance)) {
        return fail(state, 'invalidConfig');
      }
      return ok({ ...state, config });
    }
    case 'start': {
      if (by.role !== 'host') return fail(state, 'forbidden');
      if (state.phase !== 'setup') return fail(state, 'wrongPhase');
      return ok(enterTurnIntro(state));
    }
    case 'chooseDifficulty':
    case 'startTurn': {
      if (state.phase !== 'turnIntro') return fail(state, 'wrongPhase');
      if (!controlsTurn(state, by)) return fail(state, 'forbidden');
      const chosen = action.difficulty ?? state.current!.difficulty;
      if (action.difficulty !== undefined && !isDifficulty(action.difficulty)) return fail(state, 'invalidDifficulty');
      if (action.type === 'chooseDifficulty') {
        return ok({ ...state, current: { ...state.current!, difficulty: chosen } });
      }
      if (chosen === null) return fail(state, 'noDifficulty');
      const found = findPlayer(state, state.current!.explainerId)!;
      const drawn = drawCard(state, found.player.level, chosen);
      if (!drawn) return fail(state, 'deckEmpty');
      // Per-turn generator: the mode of an „any“ card and the all-play roll replay from the seed.
      const rand = mulberry32(seedFromString(`${state.config.seed}:turn:${state.current!.index}`));
      const modes = modesForLevel(found.player.level);
      const mode = drawn.card.mode === 'any' ? modes[pickIndex(modes.length, rand)] : drawn.card.mode;
      const allPlay = state.config.allPlayChance > 0 && rand() < state.config.allPlayChance;
      return ok({
        ...state,
        phase: 'playing',
        decks: drawn.decks,
        deadline: now + state.config.timerSeconds * 1000,
        current: { ...state.current!, difficulty: chosen, cardId: drawn.card.id, mode, allPlay, startedAt: now },
      });
    }
    case 'guessed': {
      if (state.phase !== 'playing') return fail(state, 'wrongPhase');
      if (!controlsTurn(state, by)) return fail(state, 'forbidden');
      if (state.deadline !== null && now > state.deadline + GUESS_GRACE_MS) return fail(state, 'timeUp');
      const c = state.current!;
      const teamId = action.teamId ?? c.teamId;
      if (!state.teams.some((t) => t.id === teamId)) return fail(state, 'unknownTeam');
      if (!c.allPlay && teamId !== c.teamId) return fail(state, 'forbidden');
      return ok(finishTurn(state, 'guessed', now, teamId));
    }
    case 'skip': {
      if (state.phase !== 'playing') return fail(state, 'wrongPhase');
      if (!controlsTurn(state, by)) return fail(state, 'forbidden');
      return ok(finishTurn(state, 'skipped', now, null));
    }
    case 'timeout': {
      if (by.role !== 'system') return fail(state, 'forbidden');
      if (state.phase !== 'playing') return fail(state, 'wrongPhase');
      if (state.deadline === null || now < state.deadline) return fail(state, 'notYet');
      return ok(finishTurn(state, 'timeout', now, null));
    }
    case 'next': {
      if (by.role !== 'host') return fail(state, 'forbidden');
      if (state.phase !== 'result') return fail(state, 'wrongPhase');
      const team = teamOnTurn(state);
      const advanced: AktivityState = {
        ...state,
        current: null,
        playerCursor: { ...state.playerCursor, [team.id]: state.playerCursor[team.id] + 1 },
        teamCursor: (state.teamCursor + 1) % state.teams.length,
      };
      return ok(goalReached(advanced) ? { ...advanced, phase: 'finished' } : enterTurnIntro(advanced));
    }
    case 'end': {
      if (by.role !== 'host') return fail(state, 'forbidden');
      if (state.phase === 'finished') return fail(state, 'wrongPhase');
      // A running or unstarted turn is dropped; finished turns keep their points.
      const keep = state.phase === 'result';
      return ok({ ...state, phase: 'finished', deadline: null, current: keep ? state.current : null });
    }
    default:
      return fail(state, 'wrongPhase');
  }
}

/** Reducer form: refused actions leave the state unchanged. */
export function reduceAktivity(state: AktivityState, action: AktivityAction): AktivityState {
  return applyAktivity(state, action).state;
}

// ---------- views ----------

export type AktivityViewer = { role: 'host' } | { role: 'contestant'; contestantId: string } | { role: 'spectator' };

/** What only the explainer sees while the turn runs. */
export interface SecretCard {
  cardId: string;
  word: string;
  image?: string;
  forbidden?: string[];
}

export interface PublicTurn {
  index: number;
  round: number;
  teamId: string;
  explainerId: string;
  helperId: string | null;
  difficulty: Difficulty | null;
  mode: AktivityMode | null;
  allPlay: boolean;
  startedAt: number | null;
}

export interface RevealedTurn extends TurnRecord {
  word: string;
  image?: string;
}

export interface AktivityView {
  mode: 'aktivity';
  id: string;
  phase: AktivityPhase;
  timerSeconds: number;
  goal: AktivityGoal;
  deadline: number | null;
  teams: (AktivityTeam & { score: number })[];
  /** Mode and difficulty are public (the team must know how it is explained); the word is not. */
  current: PublicTurn | null;
  /** The viewer explains (or reads for a preschooler) the current turn. */
  youExplain: boolean;
  /** Only for the explainer while playing. */
  secret: SecretCard | null;
  /** Finished turns, words included (they are no longer secret). */
  history: RevealedTurn[];
  /** Cards left for the next explainer's level (UI can warn before the deck runs out). */
  cardsLeft: number;
  standings: AktivityStanding[];
  winners: string[];
}

/** Turns the authoritative state into what one screen may see. The TV is `host` and never sees the word. */
export function viewFor(state: AktivityState, viewer: AktivityViewer): AktivityView {
  const me = viewer.role === 'contestant' ? viewer.contestantId : null;
  const c = state.current;
  const youExplain = me !== null && seesWord(state, me) && (state.phase === 'turnIntro' || state.phase === 'playing');
  const card = currentCard(state);
  const secret: SecretCard | null =
    state.phase === 'playing' && youExplain && card
      ? { cardId: card.id, word: card.word, ...(card.image ? { image: card.image } : {}), ...(card.forbidden ? { forbidden: card.forbidden } : {}) }
      : null;
  const level = state.phase === 'finished' ? null : (c ? findPlayer(state, c.explainerId)?.player.level : nextExplainer(state).level) ?? null;
  const deck = level ? state.decks[level] : undefined;
  return {
    mode: 'aktivity',
    id: state.id,
    phase: state.phase,
    timerSeconds: state.config.timerSeconds,
    goal: state.config.goal,
    deadline: state.deadline,
    teams: state.teams.map((t) => ({ ...t, score: state.scores[t.id] ?? 0 })),
    current: c
      ? {
          index: c.index,
          round: c.round,
          teamId: c.teamId,
          explainerId: c.explainerId,
          helperId: c.helperId,
          difficulty: c.difficulty,
          mode: c.mode,
          allPlay: c.allPlay,
          startedAt: c.startedAt,
        }
      : null,
    youExplain,
    secret,
    history: state.history.map((h) => {
      const k = state.cards[h.cardId];
      return { ...h, word: k?.word ?? '', ...(k?.image ? { image: k.image } : {}) };
    }),
    cardsLeft: deck ? DIFFICULTIES.reduce((n, d) => n + deck[d].length, 0) : 0,
    standings: aktivityStandings(state),
    winners: state.phase === 'finished' ? aktivityWinners(state) : [],
  };
}
