-- Public operation: household accounts (e-mail + password), one-time tokens, invites of another
-- adult manager, PIN lockout and the consent record. Players (children included) stay profiles
-- without an account. Existing households keep working: they have no account until the manager
-- adds e-mail and password („Doplnit účet“), and until then they may still log in by name + PIN.

-- Household names are no longer unique: anyone may create „Novákovi“.
DROP INDEX IF EXISTS households_name_key;
CREATE INDEX IF NOT EXISTS households_name_idx ON households (lower(name));

-- The PIN is set later in the household settings; registration does not ask for it.
ALTER TABLE households ALTER COLUMN pin_hash DROP NOT NULL;
ALTER TABLE households ADD COLUMN IF NOT EXISTS pin_failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE households ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

CREATE TABLE accounts (
  id                 BIGSERIAL PRIMARY KEY,
  household_id       BIGINT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  -- Stored lower-cased and trimmed; uniqueness is case-insensitive among live accounts.
  email              TEXT NOT NULL CHECK (email = lower(trim(email)) AND length(email) BETWEEN 3 AND 254),
  password_hash      TEXT NOT NULL,
  email_verified_at  TIMESTAMPTZ,
  -- Version of the terms and privacy policy the user agreed to, and when.
  terms_version      TEXT NOT NULL,
  terms_accepted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Bumped on password change/reset: older session cookies stop working.
  session_version    INT NOT NULL DEFAULT 1,
  last_login_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A deleted account keeps its row (household audit) with the e-mail scrubbed.
  deleted_at         TIMESTAMPTZ
);
CREATE UNIQUE INDEX accounts_email_key ON accounts (lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX accounts_household_idx ON accounts (household_id) WHERE deleted_at IS NULL;
CREATE INDEX accounts_unverified_idx ON accounts (created_at) WHERE email_verified_at IS NULL AND deleted_at IS NULL;

-- One-time tokens sent by e-mail; only the sha256 of the token is stored.
CREATE TABLE account_tokens (
  id          BIGSERIAL PRIMARY KEY,
  account_id  BIGINT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX account_tokens_account_idx ON account_tokens (account_id, kind);

-- Invitation of another adult manager into the household.
CREATE TABLE invites (
  id            BIGSERIAL PRIMARY KEY,
  household_id  BIGINT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  email         TEXT NOT NULL CHECK (email = lower(trim(email))),
  token_hash    TEXT NOT NULL UNIQUE,
  invited_by    BIGINT REFERENCES accounts (id) ON DELETE SET NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invites_household_idx ON invites (household_id) WHERE accepted_at IS NULL AND revoked_at IS NULL;
