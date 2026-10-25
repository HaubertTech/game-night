import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '#lib/server/db.ts';
import { listMigrations, migrate } from '#lib/server/migrate.ts';

const url = process.env.DATABASE_URL_TEST!;

afterAll(closePool);

describe('migrate', () => {
  it('runs twice without applying anything the second time', async () => {
    await migrate(url);
    const second = await migrate(url);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(listMigrations());
  });

  it('records every migration in schema_migrations', async () => {
    const rows = await query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
    expect(rows.map((r) => r.name)).toEqual(listMigrations());
  });

  it('creates the domain tables', async () => {
    const rows = await query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining([
        'households', 'players', 'teams', 'team_members', 'seasons', 'game_nights', 'matches',
        'match_participants', 'quiz_answers', 'seen_questions', 'ratings', 'card_rounds',
      ]),
    );
  });

  it('allows the levels v2 in every level check (005_levels_v2)', async () => {
    const rows = await query<{ table_name: string; def: string }>(
      `SELECT conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conname IN ('players_level_check', 'quiz_answers_level_check') ORDER BY 1`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(['players', 'quiz_answers']);
    for (const r of rows) for (const level of ['kocarek', 'piskoviste', 'prvnacek', 'lavice', 'hospoda']) expect(r.def).toContain(`'${level}'`);
  });
});
