-- Semantic matching support (design: subsystem B).
--
-- Exact-tag matching scores `pottery` against `ceramics` as zero, so conceptually close people
-- never meet. Embeddings fix that. Meta's Model API has no embeddings endpoint (/v1/embeddings
-- returns 404), so vectors are produced locally by a small sentence-transformer and stored here.
--
-- Two tables, because they answer different questions:
--   interest_embeddings  one row per distinct interest tag. Small and shared, so the "nearest
--                        concept pair" behind an explanation can be computed without embedding
--                        a whole profile. This is what keeps semantic matches *explainable*:
--                        the UI shows "ceramics <-> pottery", never a cosine score.
--   profile_embeddings   one row per user, over their whole preference text. Drives the
--                        semantic half of the interests score.
create extension if not exists vector;

create table if not exists interest_embeddings (
  tag        text primary key,
  embedding  vector(384) not null,
  updated_at timestamptz not null default now()
);

create table if not exists profile_embeddings (
  user_id    uuid primary key references profiles(id) on delete cascade,
  embedding  vector(384) not null,
  -- Hash of the text the vector was built from; a reseed or preference edit changes it, and an
  -- unchanged hash lets a backfill skip the row instead of re-embedding 300 people.
  source_hash text not null,
  updated_at timestamptz not null default now()
);

-- Approximate nearest neighbour on cosine distance. HNSW builds slower than IVFFlat but needs no
-- training pass and stays accurate at these row counts.
create index if not exists interest_embeddings_vec_idx
  on interest_embeddings using hnsw (embedding vector_cosine_ops);
create index if not exists profile_embeddings_vec_idx
  on profile_embeddings using hnsw (embedding vector_cosine_ops);

-- A derived embedding of someone's preferences is personal data, and nothing in the browser has
-- any reason to read one. RLS on with no policies denies every anon and authenticated request;
-- the service role bypasses RLS, which is the only path that writes or reads these.
alter table interest_embeddings enable row level security;
alter table profile_embeddings  enable row level security;

comment on table interest_embeddings is 'Vector per interest tag; powers the nameable nearest-concept-pair explanation.';
comment on table profile_embeddings is 'Vector per user over their preference text; semantic half of the interests score.';
