-- RPAssistant: карты локаций, фишки персонажей, шаблоны объектов
-- Безопасно выполнять повторно.

create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  settings jsonb not null default '{}'::jsonb,   -- сетка, размеры, фон
  items jsonb not null default '[]'::jsonb,      -- нарисованные объекты (стены, комнаты, шаблоны, текст…)
  fog jsonb not null default '{"enabled":false,"ops":[]}'::jsonb,
  shared boolean not null default false,          -- открыта игрокам
  sort int not null default 0,
  client text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists maps_project_idx on public.maps(project_id);

create table if not exists public.map_tokens (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default '',
  color text not null default '#e3b75b',
  img text,
  x numeric not null default 0,
  y numeric not null default 0,
  size numeric not null default 1,               -- в клетках
  owner_id uuid references public.profiles(id) on delete set null,
  hidden boolean not null default false,
  hp int,
  hp_max int,
  client text,
  updated_at timestamptz not null default now()
);
create index if not exists map_tokens_map_idx on public.map_tokens(map_id);

create table if not exists public.map_templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  icon text not null default '📦',
  items jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.maps enable row level security;
alter table public.map_tokens enable row level security;
alter table public.map_templates enable row level security;

drop policy if exists "maps read" on public.maps;
create policy "maps read" on public.maps for select to authenticated
  using (public.is_editor(project_id) or (shared and public.is_member(project_id)));
drop policy if exists "maps write" on public.maps;
create policy "maps write" on public.maps for all to authenticated
  using (public.is_editor(project_id)) with check (public.is_editor(project_id));

drop policy if exists "tokens read" on public.map_tokens;
create policy "tokens read" on public.map_tokens for select to authenticated
  using (public.is_editor(project_id) or (not hidden and public.is_member(project_id)
         and exists(select 1 from public.maps m where m.id = map_id and m.shared)));
drop policy if exists "tokens write" on public.map_tokens;
create policy "tokens write" on public.map_tokens for all to authenticated
  using (public.is_editor(project_id)) with check (public.is_editor(project_id));

drop policy if exists "templates read" on public.map_templates;
create policy "templates read" on public.map_templates for select to authenticated
  using (public.is_editor(project_id));
drop policy if exists "templates write" on public.map_templates;
create policy "templates write" on public.map_templates for all to authenticated
  using (public.is_editor(project_id)) with check (public.is_editor(project_id));

-- игрок двигает только свою фишку и только на открытой карте
create or replace function public.move_token(t uuid, nx numeric, ny numeric, cl text) returns void
language plpgsql security definer set search_path = public as $$
declare tk map_tokens;
begin
  select * into tk from map_tokens where id = t;
  if not found then raise exception 'not found'; end if;
  if not (public.is_editor(tk.project_id)
          or (tk.owner_id = auth.uid() and exists(select 1 from maps m where m.id = tk.map_id and m.shared))) then
    raise exception 'forbidden';
  end if;
  update map_tokens set x = nx, y = ny, client = cl, updated_at = now() where id = t;
end $$;
grant execute on function public.move_token(uuid, numeric, numeric, text) to authenticated;

-- атомарное применение изменений нарисованного слоя карты
create or replace function public.apply_map_ops(m uuid, ups jsonb, dels text[], ord text[], cl text) returns void
language plpgsql security definer set search_path = public as $$
declare cur jsonb; res jsonb; upmap jsonb; pid uuid;
begin
  select project_id, items into pid, cur from maps where id = m for update;
  if not found then raise exception 'not found'; end if;
  if not public.is_editor(pid) then raise exception 'forbidden'; end if;
  cur := coalesce(cur, '[]'::jsonb); ups := coalesce(ups, '[]'::jsonb);
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
  update maps set items = res, updated_at = now(), updated_by = auth.uid(), client = cl where id = m;
end $$;
grant execute on function public.apply_map_ops(uuid, jsonb, text[], text[], text) to authenticated;

alter table public.maps replica identity full;
alter table public.map_tokens replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.maps; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.map_tokens; exception when duplicate_object then null; end;
end $$;
