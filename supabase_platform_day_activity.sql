-- Platform (Lichess + Chess.com) günlük AKTİVİTE DETAYI önbelleği (bulmaca kayıtları).
-- Chess.com yalnızca son ~25 bulmaca denemesini herkese açık tutar; öğrenci gün içinde
-- daha fazla çözerse eskiler kaybolur. Bu tablo antrenör detayı her açtığında yalnızca
-- YENİ denemeleri getirip mevcutların ÜZERİNE ekleyerek (id ile birleştirme) günün
-- tamamını kalıcı saklar ve tüm cihaz/antrenörlerde paylaşır.

create table if not exists public.chess_platform_day_activity (
  student_id text        not null,
  day        date        not null,
  records    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (student_id, day)
);

create index if not exists chess_platform_day_activity_day_idx
  on public.chess_platform_day_activity (day);

alter table public.chess_platform_day_activity enable row level security;

-- Okuma: herkes (anon dahil)
drop policy if exists chess_platform_day_activity_select on public.chess_platform_day_activity;
create policy chess_platform_day_activity_select
  on public.chess_platform_day_activity
  for select
  using (true);

-- Yazma: anon + service role
drop policy if exists chess_platform_day_activity_write on public.chess_platform_day_activity;
create policy chess_platform_day_activity_write
  on public.chess_platform_day_activity
  for all
  using (true)
  with check (true);
