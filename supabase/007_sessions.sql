-- RPAssistant: сессии — планирование, запуск, общий экран сессии (доска с фоном + то, что мастер выводит игрокам).
-- Безопасно выполнять повторно.

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default 'Сессия',
  starts_at timestamptz,
  duration_min int not null default 180,
  announce text not null default '',          -- анонс, видят игроки
  summary text not null default '',           -- итоги после игры, видят игроки
  status text not null default 'planned' check (status in ('planned','live','done')),
  started_at timestamptz,
  ended_at timestamptz,
  items jsonb not null default '[]'::jsonb,   -- общая доска сессии
  bg jsonb not null default '{}'::jsonb,      -- фон доски: {color, image}
  stage jsonb not null default '{}'::jsonb,   -- что выведено игрокам: {scene:'board'|'map', map_id, image, overlays:{chars,dice,draw}}
  created_by uuid references public.profiles(id) on delete set null,
  client text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists game_sessions_project_idx on public.game_sessions(project_id, starts_at);
-- в проекте одновременно идёт не больше одной сессии
create unique index if not exists game_sessions_one_live on public.game_sessions(project_id) where status = 'live';

-- план мастера к сессии — отдельно, чтобы игроки его не видели
create table if not exists public.session_gm_notes (
  session_id uuid primary key references public.game_sessions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  plan text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.game_sessions enable row level security;
alter table public.session_gm_notes enable row level security;

drop policy if exists "sessions read" on public.game_sessions;
create policy "sessions read" on public.game_sessions for select to authenticated
  using (public.is_editor(project_id) or public.is_member(project_id));
drop policy if exists "sessions write" on public.game_sessions;
create policy "sessions write" on public.game_sessions for all to authenticated
  using (public.is_editor(project_id)) with check (public.is_editor(project_id));

drop policy if exists "session plan" on public.session_gm_notes;
create policy "session plan" on public.session_gm_notes for all to authenticated
  using (public.is_editor(project_id)) with check (public.is_editor(project_id));

-- правки общей доски сессии: мастера всегда, игроки — когда мастер разрешил рисовать
create or replace function public.apply_session_ops(s uuid, ups jsonb, dels text[], ord text[], cl text) returns void
language plpgsql security definer set search_path = public as $$
declare g game_sessions; cur jsonb; res jsonb; upmap jsonb;
begin
  select * into g from game_sessions where id = s for update;
  if not found then raise exception 'not found'; end if;
  if not (public.is_editor(g.project_id)
          or (public.is_member(g.project_id) and g.status = 'live' and coalesce((g.stage->'overlays'->>'draw')::boolean, false))) then
    raise exception 'forbidden';
  end if;
  cur := coalesce(g.items, '[]'::jsonb);
  ups := coalesce(ups, '[]'::jsonb);
  select coalesce(jsonb_object_agg(u->>'id', u), '{}'::jsonb) into upmap from jsonb_array_elements(ups) u;
  select coalesce(jsonb_agg(coalesce(upmap->(e->>'id'), e) order by n), '[]'::jsonb) into res
    from jsonb_array_elements(cur) with ordinality t(e, n)
    where not ((e->>'id') = any(coalesce(dels, '{}'::text[])));
  select res || coalesce(jsonb_agg(u order by n), '[]'::jsonb) into res
    from jsonb_array_elements(ups) with ordinality t(u, n)
    where not exists (select 1 from jsonb_array_elements(cur) c where c->>'id' = u->>'id')
      and not ((u->>'id') = any(coalesce(dels, '{}'::text[])));
  if ord is not null then
    select coalesce(jsonb_agg(e order by coalesce(array_position(ord, e->>'id'), 1000000 + n)), '[]'::jsonb) into res
      from jsonb_array_elements(res) with ordinality t(e, n);
  end if;
  update game_sessions set items = res, client = cl, updated_at = now() where id = s;
end $$;
grant execute on function public.apply_session_ops(uuid, jsonb, text[], text[], text) to authenticated;

-- начать сессию: остальные «идущие» завершаются, эта становится live
create or replace function public.start_session(s uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g game_sessions;
begin
  select * into g from game_sessions where id = s;
  if not found then raise exception 'not found'; end if;
  if not public.is_editor(g.project_id) then raise exception 'forbidden'; end if;
  update game_sessions set status = 'done', ended_at = now(), updated_at = now() where project_id = g.project_id and status = 'live' and id <> s;
  update game_sessions set status = 'live', started_at = coalesce(started_at, now()), ended_at = null, updated_at = now(),
    stage = case when stage = '{}'::jsonb then '{"scene":"board","overlays":{"chars":true,"dice":true,"draw":false}}'::jsonb else stage end
   where id = s;
end $$;
grant execute on function public.start_session(uuid) to authenticated;

alter table public.game_sessions replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.game_sessions; exception when duplicate_object then null; end;
end $$;
