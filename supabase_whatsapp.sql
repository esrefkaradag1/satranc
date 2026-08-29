-- WhatsApp otomatik mesaj altyapısı için Supabase tabloları.
-- Bu tablolar sunucu tarafı zamanlayıcı (lib/trainingWhatsAppNotify.mjs) tarafından
-- SADECE service_role anahtarıyla okunur/yazılır. api_key gibi sırlar içerdiği için
-- RLS açık bırakılır ve anon/authenticated'a hiçbir policy verilmez (service_role RLS'i bypass eder).

-- 1) Sağlayıcı yapılandırması (env değişkenlerini geçersiz kılan opsiyonel override)
create table if not exists public.whatsapp_config (
  id            text        primary key default 'default',
  api_base_url  text,
  api_key       text,
  instance_name text        default 'netchess',
  enabled       boolean     default false,
  updated_at    timestamptz not null default now()
);

-- 2) Otomatik mesaj kuralları (parent_login, parent_consent, lesson_start,
--    training_completed, training_partial, training_incomplete)
create table if not exists public.whatsapp_auto_rules (
  event      text        primary key,
  enabled    boolean     not null default false,
  updated_at timestamptz not null default now()
);

-- 3) Mesaj şablonları (varsayılanlar kodda; buradaki satır override eder)
create table if not exists public.whatsapp_templates (
  key        text        primary key,
  body       text,
  enabled    boolean     not null default true,
  updated_at timestamptz not null default now()
);

-- 4) Tekrar-gönderim engeli (dedup): aynı öğrenciye aynı gün aynı türde mesaj bir kez gider
create table if not exists public.whatsapp_training_notifications (
  student_id text        not null,
  day_iso    text        not null,
  kind       text        not null,
  sent_at    timestamptz not null default now(),
  primary key (student_id, day_iso, kind)
);

-- 5) Gönderim günlüğü (denetim/log)
create table if not exists public.whatsapp_message_logs (
  id            text        primary key,
  phone         text,
  message       text,
  status        text,
  template_key  text,
  student_id    text,
  student_name  text,
  recipient_name text,
  branch_office text,
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists whatsapp_message_logs_created_idx
  on public.whatsapp_message_logs (created_at desc);
create index if not exists whatsapp_message_logs_student_idx
  on public.whatsapp_message_logs (student_id);

-- RLS: hepsinde açık, policy YOK -> yalnızca service_role erişir (sırlar korunur).
alter table public.whatsapp_config                enable row level security;
alter table public.whatsapp_auto_rules            enable row level security;
alter table public.whatsapp_templates             enable row level security;
alter table public.whatsapp_training_notifications enable row level security;
alter table public.whatsapp_message_logs          enable row level security;

alter table public.whatsapp_message_logs
  add column if not exists recipient_name text;

-- 6) Bildirim kanalı: whatsapp | panel | both | off
create table if not exists public.notification_delivery_rules (
  event       text        primary key,
  channel     text        not null default 'whatsapp',
  updated_at  timestamptz not null default now()
);

-- 7) Veli paneli bildirim kutusu
create table if not exists public.parent_panel_notifications (
  id            text        primary key,
  student_id    text        not null,
  event         text        not null,
  title         text        not null,
  body          text        not null,
  branch_office text,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists parent_panel_notifications_student_idx
  on public.parent_panel_notifications (student_id, created_at desc);

alter table public.notification_delivery_rules enable row level security;
alter table public.parent_panel_notifications enable row level security;

-- (Opsiyonel) Otomatik kuralları varsayılan olarak açmak istersen aşağıyı çalıştır.
-- Kod zaten satır yoksa training_completed/training_incomplete'i açık kabul eder.
-- insert into public.whatsapp_auto_rules (event, enabled) values
--   ('parent_login', true),
--   ('parent_consent', true),
--   ('lesson_start', true),
--   ('training_completed', true),
--   ('training_partial', true),
--   ('training_incomplete', true)
-- on conflict (event) do update set enabled = excluded.enabled;

-- (Opsiyonel) Sağlayıcıyı env yerine DB'den yönetmek istersen (WaMessage):
-- insert into public.whatsapp_config (id, api_base_url, api_key, instance_name, enabled)
-- values ('default', 'https://api.toplusms.app', 'WAMESSAGE_API_KEY', 'REG_ID', true)
-- on conflict (id) do update set
--   api_base_url = excluded.api_base_url,
--   api_key = excluded.api_key,
--   instance_name = excluded.instance_name,
--   enabled = excluded.enabled,
--   updated_at = now();
