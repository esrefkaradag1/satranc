-- Platform (Lichess + Chess.com) günlük istatistik önbelleği.
-- Geçmiş günler platform API'lerinden yeniden çekilemediği için bir kez hesaplanan
-- doğru veri burada kalıcı saklanır ve tüm cihaz/antrenörlerde paylaşılır.

create table if not exists public.chess_platform_day_stats (
  student_id   text        not null,
  day          date        not null,
  stats        jsonb       not null default '{}'::jsonb,
  time_seconds integer     not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (student_id, day)
);

create index if not exists chess_platform_day_stats_day_idx
  on public.chess_platform_day_stats (day);

alter table public.chess_platform_day_stats enable row level security;

-- Okuma: herkes (anon dahil)
drop policy if exists chess_platform_day_stats_select on public.chess_platform_day_stats;
create policy chess_platform_day_stats_select
  on public.chess_platform_day_stats
  for select
  using (true);

-- Yazma: anon + service role (uygulama service role anahtarıyla yazar)
drop policy if exists chess_platform_day_stats_write on public.chess_platform_day_stats;
create policy chess_platform_day_stats_write
  on public.chess_platform_day_stats
  for all
  using (true)
  with check (true);
