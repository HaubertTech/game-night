-- New live games: „Řekni, ukaž, nakresli“ (aktivity) and „Město, jméno, zvíře“ (mjz).
-- Idempotent: the checks are dropped (if present) and recreated with the full list.

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_game_type_check;
ALTER TABLE matches ADD CONSTRAINT matches_game_type_check
  CHECK (game_type IN ('quiz', 'aktivity', 'mjz', 'prsi', 'zoliky'));

ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_game_type_check;
ALTER TABLE ratings ADD CONSTRAINT ratings_game_type_check
  CHECK (game_type IN ('quiz', 'aktivity', 'mjz', 'prsi', 'zoliky'));
