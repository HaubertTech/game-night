-- Levels v2 (docs/UROVNE.md): new levels kocarek (2–3 years) and prvnacek (1st grade).
-- Only widens the allowed values, so existing rows stay valid and a server on the previous
-- version keeps working against the same database. Drop + add makes it safe to run twice.

ALTER TABLE players DROP CONSTRAINT IF EXISTS players_level_check;
ALTER TABLE players ADD CONSTRAINT players_level_check
  CHECK (level IN ('kocarek', 'piskoviste', 'prvnacek', 'lavice', 'hospoda'));

ALTER TABLE quiz_answers DROP CONSTRAINT IF EXISTS quiz_answers_level_check;
ALTER TABLE quiz_answers ADD CONSTRAINT quiz_answers_level_check
  CHECK (level IN ('kocarek', 'piskoviste', 'prvnacek', 'lavice', 'hospoda'));
