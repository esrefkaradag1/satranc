-- WhatsApp şema uyumu + teslim durumu takibi.
-- Supabase SQL Editor'de bir kez çalıştırın (idempotent — tekrar çalıştırılabilir).
--
-- ÖNEMLİ: Panel ve sunucu kodu bu kolonlar OLMADAN da çalışır. Teslim durumu
-- bu durumda tarayıcı önbelleğinde (localStorage) tutulur. Kolonlar eklenirse
-- durum veritabanında kalıcı olur ve başka cihaz/tarayıcıdan da görünür.
--
-- Neden gerekli: canlı whatsapp_templates tablosunda `id`/`name` zorunlu ve
-- `updated_at` yok; whatsapp_auto_rules'ta `updated_at` yok; gönderim
-- günlüğünde sağlayıcı rapor kolonları yok. Kod artık bu farkları tolere
-- ediyor, bu dosya şemayı repodaki supabase_whatsapp.sql ile eşitler.

-- 1) Gönderim günlüğü: sağlayıcı (WaMessage) rapor kimliği + teslim durumu
--    queued = kuyrukta/bekliyor · delivered = iletti · failed = başarısız
alter table public.whatsapp_message_logs
  add column if not exists provider_report_id text;
alter table public.whatsapp_message_logs
  add column if not exists delivery_state text;
alter table public.whatsapp_message_logs
  add column if not exists delivery_checked_at timestamptz;

create index if not exists whatsapp_message_logs_report_idx
  on public.whatsapp_message_logs (provider_report_id);

-- 2) Şablon ve otomatik kural tablolarına updated_at (+ kural → şablon eşlemesi)
alter table public.whatsapp_templates
  add column if not exists updated_at timestamptz not null default now();
alter table public.whatsapp_auto_rules
  add column if not exists updated_at timestamptz not null default now();
alter table public.whatsapp_auto_rules
  add column if not exists template_key text;

-- 3) Sağlayıcı yapılandırması: gönderici telefon / sağlayıcı adı (opsiyonel)
alter table public.whatsapp_config
  add column if not exists device_phone text;
alter table public.whatsapp_config
  add column if not exists provider text default 'wamessage';

-- 4) Kontrol: çalıştıktan sonra kolonları listeler
select 'whatsapp_message_logs' as tablo,
       string_agg(column_name, ', ' order by ordinal_position) as kolonlar
  from information_schema.columns
 where table_schema = 'public' and table_name = 'whatsapp_message_logs'
union all
select 'whatsapp_templates',
       string_agg(column_name, ', ' order by ordinal_position)
  from information_schema.columns
 where table_schema = 'public' and table_name = 'whatsapp_templates'
union all
select 'whatsapp_auto_rules',
       string_agg(column_name, ', ' order by ordinal_position)
  from information_schema.columns
 where table_schema = 'public' and table_name = 'whatsapp_auto_rules';
