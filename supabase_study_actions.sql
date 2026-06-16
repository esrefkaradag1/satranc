-- ============================================================
-- Lichess-like Study Actions (Event Sourcing) — Supabase SQL
-- Supabase Dashboard > SQL Editor'da bu dosyayı çalıştırın.
-- ============================================================
-- Amaç:
-- - chess_study_actions: tüm değişiklikler tek event log'dan akar (REC/SYNC semantiği)
-- - chess_study_snapshots: hızlı initial load (opsiyonel ama önerilen)
-- - chess_study_presence: sticky (SYNC) + kullanıcı konumu
--
-- Not: Bu dosya mevcut `chess_studies` snapshot tablosunu bozmaz;
--      yeni event-stream yapısını ekler.
-- ============================================================

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- 1) Actions (append-only log)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.chess_study_actions (
  id uuid primary key default gen_random_uuid(),
  study_id text not null,
  chapter_id text not null,
  seq bigint not null,
  actor_id text,
  actor_role text,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_chess_study_actions_study_chapter_seq
  on public.chess_study_actions (study_id, chapter_id, seq);

create index if not exists idx_chess_study_actions_study_created
  on public.chess_study_actions (study_id, created_at);

create unique index if not exists uq_chess_study_actions_study_chapter_seq
  on public.chess_study_actions (study_id, chapter_id, seq);

-- seq generator: per (study_id, chapter_id) monotonik sıra
create or replace function public.next_chess_study_action_seq(p_study_id text, p_chapter_id text)
returns bigint
language plpgsql
as $$
declare
  v_next bigint;
begin
  -- transaction-level lock to avoid concurrent seq collisions
  perform pg_advisory_xact_lock(hashtext(p_study_id || ':' || p_chapter_id));
  select coalesce(max(seq), 0) + 1
    into v_next
    from public.chess_study_actions
   where study_id = p_study_id
     and chapter_id = p_chapter_id;
  return v_next;
end;
$$;

create or replace function public.chess_study_actions_set_seq()
returns trigger
language plpgsql
as $$
begin
  if new.seq is null or new.seq <= 0 then
    new.seq := public.next_chess_study_action_seq(new.study_id, new.chapter_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_chess_study_actions_set_seq on public.chess_study_actions;
create trigger trg_chess_study_actions_set_seq
before insert on public.chess_study_actions
for each row
execute function public.chess_study_actions_set_seq();

-- ─────────────────────────────────────────────────────────────
-- 2) Snapshots (fast load)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.chess_study_snapshots (
  study_id text not null,
  chapter_id text not null,
  last_seq bigint not null default 0,
  tree jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (study_id, chapter_id)
);

create index if not exists idx_chess_study_snapshots_updated
  on public.chess_study_snapshots (updated_at desc);

-- ─────────────────────────────────────────────────────────────
-- 3) Presence (sticky sync)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.chess_study_presence (
  study_id text not null,
  user_id text not null,
  chapter_id text,
  path text,
  sticky boolean not null default false,
  last_seen timestamptz not null default now(),
  primary key (study_id, user_id)
);

create index if not exists idx_chess_study_presence_study_seen
  on public.chess_study_presence (study_id, last_seen desc);

-- ─────────────────────────────────────────────────────────────
-- 4) RLS policies (minimal / service-role compatible)
-- ─────────────────────────────────────────────────────────────
-- ÖNEMLİ:
-- Bu projede frontend tarafında service role key kullanıldığı için (getServiceSupabase),
-- aşağıdaki politikalar "herkes yazabilir" gibi görünür.
-- Lichess’e birebir yaklaşmak için öneri:
-- - service role key'i client'tan kaldırın
-- - Supabase Auth (JWT) + RLS ile actor_role / memberIds doğrulaması yapın
-- - `appendStudyAction` insert'lerini sadece contributor'lara (admin/coach) izinli hale getirin
--
-- Bu dosyada minimal politikalar bırakıldı ki mevcut kurulum kırılmasın.
alter table public.chess_study_actions enable row level security;
alter table public.chess_study_snapshots enable row level security;
alter table public.chess_study_presence enable row level security;

drop policy if exists "Public read study actions" on public.chess_study_actions;
create policy "Public read study actions"
  on public.chess_study_actions for select
  using (true);

drop policy if exists "Service role write study actions" on public.chess_study_actions;
create policy "Service role write study actions"
  on public.chess_study_actions for all
  using (true)
  with check (true);

drop policy if exists "Public read study snapshots" on public.chess_study_snapshots;
create policy "Public read study snapshots"
  on public.chess_study_snapshots for select
  using (true);

drop policy if exists "Service role write study snapshots" on public.chess_study_snapshots;
create policy "Service role write study snapshots"
  on public.chess_study_snapshots for all
  using (true)
  with check (true);

drop policy if exists "Public read study presence" on public.chess_study_presence;
create policy "Public read study presence"
  on public.chess_study_presence for select
  using (true);

drop policy if exists "Service role write study presence" on public.chess_study_presence;
create policy "Service role write study presence"
  on public.chess_study_presence for all
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────
-- 5) Realtime publication
-- ─────────────────────────────────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.chess_study_actions;
exception when duplicate_object then
  null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.chess_study_snapshots;
exception when duplicate_object then
  null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.chess_study_presence;
exception when duplicate_object then
  null;
end;
$$;

