-- RPAssistant: музыка — библиотека треков проекта и синхронное воспроизведение у всех участников
-- Безопасно выполнять повторно.

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('file','url','youtube','soundcloud','yadisk')),
  src text not null,
  thumb text,
  category text not null default 'music' check (category in ('music','ambient','sfx')),
  duration numeric,
  sort int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tracks_project_idx on public.tracks(project_id);

create table if not exists public.music_state (
  project_id uuid primary key references public.projects(id) on delete cascade,
  track_id uuid references public.tracks(id) on delete set null,
  playing boolean not null default false,
  position numeric not null default 0,       -- секунда трека в момент started_at
  started_at timestamptz not null default now(),
  volume numeric not null default 0.8,
  loop boolean not null default true,
  updated_by uuid,
  client text,
  updated_at timestamptz not null default now()
);

create or replace function public.server_now() returns timestamptz
language sql stable as $$ select now() $$;
grant execute on function public.server_now() to anon, authenticated;

alter table public.tracks enable row level security;
alter table public.music_state enable row level security;

drop policy if exists "tracks read" on public.tracks;
create policy "tracks read" on public.tracks for select to authenticated
  using (public.is_editor(project_id) or public.is_member(project_id));
drop policy if exists "tracks write" on public.tracks;
create policy "tracks write" on public.tracks for all to authenticated
  using (public.is_editor(project_id)) with check (public.is_editor(project_id));

drop policy if exists "music read" on public.music_state;
create policy "music read" on public.music_state for select to authenticated
  using (public.is_editor(project_id) or public.is_member(project_id));
drop policy if exists "music write" on public.music_state;
create policy "music write" on public.music_state for all to authenticated
  using (public.is_editor(project_id)) with check (public.is_editor(project_id));

alter table public.music_state replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.music_state; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.tracks; exception when duplicate_object then null; end;
end $$;

-- хранилище аудиофайлов
insert into storage.buckets (id, name, public, file_size_limit)
  values ('music', 'music', true, 52428800)
  on conflict (id) do nothing;

drop policy if exists "music upload own folder" on storage.objects;
create policy "music upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'music' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "music delete own" on storage.objects;
create policy "music delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'music' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- ссылки-приглашения: что за игра, видно ещё до входа ----------
create or replace function public.invite_info(c text) returns json
language sql security definer stable set search_path = public as $$
  select json_build_object('title', p.title, 'system', p.system->>'name', 'owner', pr.name,
         'kind', case when p.code = upper(trim(c)) then 'player' else 'comaster' end)
  from projects p join profiles pr on pr.id = p.owner_id
  where p.code = upper(trim(c)) or p.comaster_code = upper(trim(c))
  limit 1
$$;
grant execute on function public.invite_info(text) to anon, authenticated;
