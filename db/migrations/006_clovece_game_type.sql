-- Člověče, nezlob se joins the league: live rooms on TV + phones and games on one tablet.
-- Idempotent and backward compatible: the checks are dropped (if present) and recreated with the
-- full list, which only adds a value.

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_game_type_check;
ALTER TABLE matches ADD CONSTRAINT matches_game_type_check
  CHECK (game_type IN ('quiz', 'aktivity', 'mjz', 'prsi', 'zoliky', 'chess', 'clovece'));

ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_game_type_check;
ALTER TABLE ratings ADD CONSTRAINT ratings_game_type_check
  CHECK (game_type IN ('quiz', 'aktivity', 'mjz', 'prsi', 'zoliky', 'chess', 'clovece'));
