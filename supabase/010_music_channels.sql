-- RPAssistant: отдельные каналы «Атмосфера» и «Эффекты» в плеере
-- Выполнить в Supabase → SQL Editor. Можно запускать повторно.

alter table public.music_state add column if not exists amb_track_id uuid references public.tracks(id) on delete set null;
alter table public.music_state add column if not exists amb_playing boolean not null default false;
alter table public.music_state add column if not exists amb_position double precision not null default 0;
alter table public.music_state add column if not exists amb_started_at timestamptz;
alter table public.music_state add column if not exists amb_volume double precision not null default 0.6;
alter table public.music_state add column if not exists sfx_volume double precision not null default 0.9;

notify pgrst, 'reload schema';
