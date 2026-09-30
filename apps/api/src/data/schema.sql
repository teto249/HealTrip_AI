-- HealTrip Patient Decision Assistant — reference Postgres schema.
--
-- This prototype's DataRepository (data.repository.ts) reads seed JSON files
-- shaped exactly like these tables, and every repository method's doc comment
-- carries the SQL it stands in for. Swapping the repository's implementation
-- from JSON reads to `pg`/an ORM over this schema is meant to touch exactly
-- one file — see docs/architecture.html §09 "Assumptions and non-goals".
--
-- sessions/messages are kept in-memory in this prototype (session/session.service.ts)
-- rather than persisted — they're included here to document the production shape.

CREATE TABLE specialties (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE facilities (
  id                        TEXT PRIMARY KEY,
  name                      TEXT NOT NULL,
  city                      TEXT NOT NULL,
  country                   TEXT NOT NULL,
  address                   TEXT NOT NULL,
  has_emergency_department  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE providers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  specialty_id  TEXT NOT NULL REFERENCES specialties(id),
  facility_id   TEXT NOT NULL REFERENCES facilities(id),
  fee_amount    NUMERIC(10, 2) NOT NULL,
  fee_currency  TEXT NOT NULL DEFAULT 'USD',
  languages     TEXT[] NOT NULL,
  telehealth    BOOLEAN NOT NULL DEFAULT FALSE,
  bio           TEXT NOT NULL
);

CREATE INDEX idx_providers_specialty ON providers(specialty_id);
CREATE INDEX idx_providers_facility  ON providers(facility_id);

-- Deterministic symptom → specialty routing table. The model never guesses
-- that "chest pain" implies cardiology — it calls map_symptoms_to_specialties,
-- which is this table, ranked by weight.
CREATE TABLE symptom_specialty_map (
  id              SERIAL PRIMARY KEY,
  symptom_keyword TEXT NOT NULL,
  specialty_id    TEXT NOT NULL REFERENCES specialties(id),
  weight          NUMERIC(3, 2) NOT NULL CHECK (weight > 0 AND weight <= 1)
);

CREATE INDEX idx_symptom_map_keyword ON symptom_specialty_map(symptom_keyword);

-- Vetted, human-authored explanatory copy the model may select by key but
-- never write itself — see tools/explainPathway.tool.ts.
CREATE TABLE pathway_content (
  key       TEXT PRIMARY KEY,
  body_en   TEXT NOT NULL,
  body_ar   TEXT NOT NULL
);

-- Production-shape only — this prototype keeps both in memory per process.
CREATE TABLE sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  locale              TEXT NOT NULL,
  stage               TEXT NOT NULL,
  patient_case        JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  tool_calls      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_session ON messages(session_id, created_at);
