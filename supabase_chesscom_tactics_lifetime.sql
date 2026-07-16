-- Chess.com lifetime tactics snapshots (günlük delta için).
-- Chess.com yalnız son ~25 puanlı bulmaca denemesini listeler; bir günde 25+'ten fazla
-- çözülürse veya ertesi gün yeni denemeler gelirse geçmiş gün listeden düşer.
-- Gece senkronu her kullanıcı için gün sonu lifetime sayaçlarını burada saklar;
-- ertesi gün farkı (= o günün deneme sayısı) güvenilir biçimde hesaplanır.

create table if not exists public.chess_com_tactics_lifetime (
  username       text        not null,
  day            date        not null,
  attempt_count  integer     not null default 0,
  passed_count   integer     not null default 0,
  failed_count   integer     not null default 0,
  total_seconds  integer     not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (username, day)
);

create index if not exists chess_com_tactics_lifetime_day_idx
  on public.chess_com_tactics_lifetime (day);

alter table public.chess_com_tactics_lifetime enable row level security;

drop policy if exists chess_com_tactics_lifetime_select on public.chess_com_tactics_lifetime;
create policy chess_com_tactics_lifetime_select
  on public.chess_com_tactics_lifetime
  for select
  using (true);

drop policy if exists chess_com_tactics_lifetime_write on public.chess_com_tactics_lifetime;
create policy chess_com_tactics_lifetime_write
  on public.chess_com_tactics_lifetime
  for all
  using (true)
  with check (true);
