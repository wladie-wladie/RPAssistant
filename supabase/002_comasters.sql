-- RPAssistant: сомастера и совместное редактирование доски
-- Безопасно выполнять повторно.

alter table public.projects add column if not exists comaster_code text unique;
update public.projects set comaster_code = upper(substr(md5(random()::text || id::text), 1, 6)) where comaster_code is null;

alter table public.project_members add column if not exists role text not null default 'player';
do $$ begin
  alter table public.project_members add constraint project_members_role_check check (role in ('player','comaster'));
exception when duplicate_object then null; end $$;

-- владелец или сомастер
create or replace function public.is_editor(p uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from projects where id = p and owner_id = auth.uid())
      or exists(select 1 from project_members where project_id = p and user_id = auth.uid() and role = 'comaster')
$$;

-- вход по коду: обычный код -> игрок, код сомастера -> сомастер (только для аккаунтов мастеров)
create or replace function public.join_project(join_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; r text; my_role text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into pid from projects where code = upper(trim(join_code));
  if pid is not null then r := 'player';
  else
    select id into pid from projects where comaster_code = upper(trim(join_code));
    if pid is null then return null; end if;
    select role into my_role from profiles where id = auth.uid();
    if my_role is distinct from 'master' then raise exception 'COMASTER_NEEDS_MASTER'; end if;
    r := 'comaster';
  end if;
  if exists(select 1 from projects where id = pid and owner_id = auth.uid()) then return pid; end if;
  insert into project_members(project_id, user_id, role) values (pid, auth.uid(), r)
    on conflict (project_id, user_id) do update
      set role = case when excluded.role = 'comaster' then 'comaster' else project_members.role end;
  return pid;
end $$;

-- атомарное применение изменений доски: правки отдельных объектов не затирают друг друга
create or replace function public.apply_board_ops(p uuid, ups jsonb, dels text[], ord text[], cl text) returns void
language plpgsql security definer set search_path = public as $$
declare cur jsonb; res jsonb; upmap jsonb;
begin
  if not public.is_editor(p) then raise exception 'forbidden'; end if;
  select items into cur from boards where project_id = p for update;
  if not found then
    insert into boards(project_id, items) values (p, '[]'::jsonb);
    cur := '[]'::jsonb;
  end if;
  cur := coalesce(cur, '[]'::jsonb);
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
  update boards set items = res, updated_at = now(), updated_by = auth.uid(), client = cl where project_id = p;
  update projects set updated_at = now() where id = p;
end $$;
grant execute on function public.apply_board_ops(uuid, jsonb, text[], text[], text) to authenticated;

-- доступ к доскам: сомастера читают и пишут
drop policy if exists "boards read" on public.boards;
create policy "boards read" on public.boards for select to authenticated
  using (public.is_editor(project_id) or (public.is_member(project_id)
         and exists(select 1 from public.projects pr where pr.id = project_id and pr.board_access = 'view')));
drop policy if exists "boards insert" on public.boards;
create policy "boards insert" on public.boards for insert to authenticated
  with check (public.is_editor(project_id));
drop policy if exists "boards update" on public.boards;
create policy "boards update" on public.boards for update to authenticated
  using (public.is_editor(project_id)) with check (public.is_editor(project_id));
