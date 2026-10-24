-- Expo push token'ları. WhatsApp kanalından bağımsızdır.
create table if not exists public.mobile_push_tokens (
  expo_token  text        primary key,
  student_id  text        not null,
  platform    text        not null default 'unknown',
  updated_at  timestamptz not null default now()
);

create index if not exists mobile_push_tokens_student_idx
  on public.mobile_push_tokens (student_id);

alter table public.mobile_push_tokens enable row level security;
