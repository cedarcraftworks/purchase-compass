-- Purchase Compass is a single-user application: one person's purchase history.
-- (Multi-user support would add a users table and a user_id column here.)

CREATE TABLE imports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text        NOT NULL,
  format      text        NOT NULL,
  row_count   integer     NOT NULL,
  inserted    integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE purchases (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text        NOT NULL CHECK (source IN ('amazon', 'rakuten', 'mercari', 'store', 'other')),
  ordered_at  timestamptz NOT NULL,
  title       text        NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  amount_yen  integer     NOT NULL CHECK (amount_yen >= 0),
  quantity    integer     NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  store       text,
  category    text,
  import_id   uuid        REFERENCES imports (id) ON DELETE SET NULL,
  -- Same source + time + title + amount + quantity = the same purchase.
  -- Re-importing a file therefore adds nothing instead of doubling every total.
  dedupe_key  text        NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX purchases_ordered_at_idx ON purchases (ordered_at DESC);

-- A single counter bumped by every write. Analysis results are cached per
-- version, so the dashboard reuses them until the data actually changes.
CREATE TABLE data_version (
  id      boolean PRIMARY KEY DEFAULT true CHECK (id),
  version bigint  NOT NULL DEFAULT 0
);
INSERT INTO data_version DEFAULT VALUES;

CREATE TABLE analysis_cache (
  kind         text        NOT NULL,
  data_version bigint      NOT NULL,
  payload      jsonb       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, data_version)
);
