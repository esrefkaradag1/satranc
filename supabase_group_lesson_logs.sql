-- Grup ders konuları (yoklama ekranı) — grup adı bazında paylaşılan konu listesi.
-- Tüm antrenörler aynı grubu düzenler; senkronizasyon kayıt bazında (id) yapılır.

create table if not exists public.group_lesson_logs (
  group_name  text        primary key,
  entries     jsonb       not null default '[]'::jsonb,
  -- Silme izleri: silinen kayıt id'si -> silinme zamanı (ISO). Bir kayıt bir cihazda
  -- silindiğinde, başka cihaz eski listeyi geri yazsa bile buradaki iz sayesinde
  -- kayıt tekrar getirilmez ("delete keeps coming back" sorununu çözer).
  deleted_ids jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Var olan tabloya kolon ekleme (idempotent).
alter table public.group_lesson_logs
  add column if not exists deleted_ids jsonb not null default '{}'::jsonb;

alter table public.group_lesson_logs enable row level security;

-- Okuma: herkes (anon dahil) — tüm antrenörler görebilir
drop policy if exists group_lesson_logs_select on public.group_lesson_logs;
create policy group_lesson_logs_select
  on public.group_lesson_logs
  for select
  using (true);

-- Yazma: anon + service role (uygulama service role anahtarıyla yazar)
drop policy if exists group_lesson_logs_write on public.group_lesson_logs;
create policy group_lesson_logs_write
  on public.group_lesson_logs
  for all
  using (true)
  with check (true);
