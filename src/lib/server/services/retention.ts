// Retention jobs. No SvelteKit imports: runs from server.ts and scripts/purge-unverified.ts
// under plain Node (the production image has no dev dependencies).

import { query, tx } from '../db.ts';

export const UNVERIFIED_RETENTION_DAYS = 30;

/**
 * Unverified accounts older than the retention are removed; a household whose only managers were
 * such accounts goes with them (households without any account — the pre-account ones — stay).
 */
export async function purgeUnverified(days = UNVERIFIED_RETENTION_DAYS): Promise<{ accounts: number; households: number }> {
  return tx(async (c) => {
    const stale = await query<{ id: number; household_id: number }>(
      `SELECT id, household_id FROM accounts
        WHERE email_verified_at IS NULL AND deleted_at IS NULL AND created_at < now() - make_interval(days => $1::int)
        FOR UPDATE`,
      [days],
      c,
    );
    if (!stale.length) return { accounts: 0, households: 0 };
    const staleIds = stale.map((s) => s.id);
    const householdIds = [...new Set(stale.map((s) => s.household_id))];
    const orphaned = await query<{ id: number }>(
      `SELECT h.id FROM households h
        WHERE h.id = ANY($1::bigint[])
          AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.household_id = h.id AND a.deleted_at IS NULL AND NOT (a.id = ANY($2::bigint[])))`,
      [householdIds, staleIds],
      c,
    );
    await query('DELETE FROM households WHERE id = ANY($1::bigint[])', [orphaned.map((h) => h.id)], c);
    await query('DELETE FROM accounts WHERE id = ANY($1::bigint[])', [staleIds], c);
    // Housekeeping: spent tokens and old invites.
    await query(`DELETE FROM account_tokens WHERE expires_at < now() - interval '7 days'`, [], c);
    await query(`DELETE FROM invites WHERE (accepted_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at < now()) AND created_at < now() - interval '30 days'`, [], c);
    return { accounts: stale.length, households: orphaned.length };
  });
}
