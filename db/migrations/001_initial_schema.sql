-- Domácí liga: households, players, league, matches and quiz statistics.

CREATE TABLE households (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  pin_hash    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX households_name_key ON households (lower(name));

CREATE TABLE players (
  id            BIGSERIAL PRIMARY KEY,
  household_id  BIGINT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  avatar        TEXT NOT NULL DEFAULT '🙂',
  level         TEXT NOT NULL CHECK (level IN ('hospoda', 'lavice', 'piskoviste')),
  birth_year    INT CHECK (birth_year BETWEEN 1900 AND 2100),
  archived_at   TIMESTAMPTZ,
  -- Profile id from the tablet (localStorage) version; used by the import.
  legacy_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX players_household_idx ON players (household_id) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX players_legacy_key ON players (household_id, legacy_id) WHERE legacy_id IS NOT NULL;

CREATE TABLE teams (
  id            BIGSERIAL PRIMARY KEY,
  household_id  BIGINT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  avatar        TEXT NOT NULL DEFAULT '👥',
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX teams_household_idx ON teams (household_id) WHERE archived_at IS NULL;

CREATE TABLE team_members (
  team_id    BIGINT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  player_id  BIGINT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, player_id)
);
CREATE INDEX team_members_player_idx ON team_members (player_id);

CREATE TABLE seasons (
  id            BIGSERIAL PRIMARY KEY,
  household_id  BIGINT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  starts_on     DATE NOT NULL,
  ends_on       DATE NOT NULL,
  points_table  JSONB NOT NULL DEFAULT '[10, 7, 5, 3, 2, 1]'::jsonb CHECK (jsonb_typeof(points_table) = 'array'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
CREATE INDEX seasons_household_idx ON seasons (household_id, starts_on);

CREATE TABLE game_nights (
  id            BIGSERIAL PRIMARY KEY,
  household_id  BIGINT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  season_id     BIGINT REFERENCES seasons (id) ON DELETE SET NULL,
  played_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  title         TEXT,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX game_nights_household_idx ON game_nights (household_id, played_on DESC);
CREATE INDEX game_nights_season_idx ON game_nights (season_id);

CREATE TABLE matches (
  id            BIGSERIAL PRIMARY KEY,
  household_id  BIGINT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  night_id      BIGINT REFERENCES game_nights (id) ON DELETE SET NULL,
  game_type     TEXT NOT NULL CHECK (game_type IN ('quiz', 'prsi', 'zoliky')),
  mode          TEXT CHECK (mode IN ('pass', 'live')),
  status        TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'running', 'finished', 'abandoned')),
  -- Serialized engine state (quiz GameState / live room); null for card games.
  state         JSONB,
  room_code     TEXT,
  -- Game id from the tablet history; makes the import idempotent.
  legacy_id     TEXT,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX matches_household_idx ON matches (household_id, finished_at DESC);
CREATE INDEX matches_night_idx ON matches (night_id);
-- One live room per code at a time.
CREATE UNIQUE INDEX matches_active_room_key ON matches (room_code) WHERE room_code IS NOT NULL AND status IN ('lobby', 'running');
CREATE UNIQUE INDEX matches_legacy_key ON matches (household_id, legacy_id) WHERE legacy_id IS NOT NULL;

CREATE TABLE match_participants (
  id             BIGSERIAL PRIMARY KEY,
  match_id       BIGINT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  player_id      BIGINT REFERENCES players (id) ON DELETE CASCADE,
  team_id        BIGINT REFERENCES teams (id) ON DELETE CASCADE,
  place          INT CHECK (place >= 1),
  score          NUMERIC NOT NULL DEFAULT 0,
  league_points  INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((player_id IS NULL) <> (team_id IS NULL))
);
CREATE INDEX match_participants_match_idx ON match_participants (match_id);
CREATE INDEX match_participants_player_idx ON match_participants (player_id) WHERE player_id IS NOT NULL;
CREATE INDEX match_participants_team_idx ON match_participants (team_id) WHERE team_id IS NOT NULL;
CREATE UNIQUE INDEX match_participants_player_key ON match_participants (match_id, player_id) WHERE player_id IS NOT NULL;
CREATE UNIQUE INDEX match_participants_team_key ON match_participants (match_id, team_id) WHERE team_id IS NOT NULL;

CREATE TABLE quiz_answers (
  id              BIGSERIAL PRIMARY KEY,
  match_id        BIGINT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  participant_id  BIGINT NOT NULL REFERENCES match_participants (id) ON DELETE CASCADE,
  -- Set when the participant is a single player; team answers keep it null.
  player_id       BIGINT REFERENCES players (id) ON DELETE CASCADE,
  question_id     TEXT NOT NULL,
  theme           TEXT NOT NULL,
  level           TEXT NOT NULL CHECK (level IN ('hospoda', 'lavice', 'piskoviste')),
  round_no        INT,
  correct         BOOLEAN NOT NULL,
  points          NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX quiz_answers_match_idx ON quiz_answers (match_id);
CREATE INDEX quiz_answers_participant_idx ON quiz_answers (participant_id);
CREATE INDEX quiz_answers_player_idx ON quiz_answers (player_id, theme) WHERE player_id IS NOT NULL;

CREATE TABLE seen_questions (
  player_id    BIGINT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL,
  seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, question_id)
);

CREATE TABLE ratings (
  player_id   BIGINT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  game_type   TEXT NOT NULL CHECK (game_type IN ('quiz', 'prsi', 'zoliky')),
  mu          DOUBLE PRECISION NOT NULL,
  sigma       DOUBLE PRECISION NOT NULL,
  games       INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, game_type)
);

CREATE TABLE card_rounds (
  id          BIGSERIAL PRIMARY KEY,
  match_id    BIGINT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  round_no    INT NOT NULL CHECK (round_no >= 1),
  player_id   BIGINT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  points      INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, round_no, player_id)
);
CREATE INDEX card_rounds_player_idx ON card_rounds (player_id);
