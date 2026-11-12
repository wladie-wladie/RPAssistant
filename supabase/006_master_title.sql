-- RPAssistant: «Мастер» — только титул. Мастер и сомастера проекта имеют одинаковые права:
-- настройки, ссылки-приглашения, участники, экспорт, удаление проекта.
-- Мастер может передать титул сомастеру — сам он при этом становится сомастером.
-- Безопасно выполнять повторно.

-- проект: менять и удалять могут мастер и сомастера
drop policy if exists "projects update" on public.projects;
create policy "projects update" on public.projects for update to authenticated
  using (public.is_editor(id)) with check (public.is_editor(id));
drop policy if exists "projects delete" on public.projects;
create policy "projects delete" on public.projects for delete to authenticated
  using (public.is_editor(id));

-- титул мастера нельзя поменять обычным обновлением — только через transfer_master
create or replace function public.guard_project_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id
     and coalesce(current_setting('rpa.transfer_master', true), '') <> '1' then
    raise exception 'owner can only change via transfer_master';
  end if;
  return new;
end $$;
drop trigger if exists guard_project_owner on public.projects;
create trigger guard_project_owner before update on public.projects
  for each row execute function public.guard_project_owner();

-- участники: видят и убирают мастер и сомастера (и каждый может уйти сам)
drop policy if exists "members read" on public.project_members;
create policy "members read" on public.project_members for select to authenticated
  using (user_id = auth.uid() or public.is_editor(project_id) or public.is_member(project_id));
drop policy if exists "members delete" on public.project_members;
create policy "members delete" on public.project_members for delete to authenticated
  using (user_id = auth.uid() or public.is_editor(project_id));

-- передать титул мастера сомастеру; прежний мастер становится сомастером
create or replace function public.transfer_master(p uuid, new_master uuid) returns void
language plpgsql security definer set search_path = public as $$
declare old_master uuid;
begin
  select owner_id into old_master from projects where id = p for update;
  if not found then raise exception 'not found'; end if;
  if old_master is distinct from auth.uid() then raise exception 'only the master can pass the title'; end if;
  if new_master = old_master then return; end if;
  if not exists(select 1 from project_members where project_id = p and user_id = new_master and role = 'comaster') then
    raise exception 'new master must be a comaster of this project';
  end if;
  delete from project_members where project_id = p and user_id = new_master;
  insert into project_members(project_id, user_id, role) values (p, old_master, 'comaster')
    on conflict (project_id, user_id) do update set role = 'comaster';
  perform set_config('rpa.transfer_master', '1', true);
  update projects set owner_id = new_master, updated_at = now() where id = p;
  perform set_config('rpa.transfer_master', '', true);
end $$;
grant execute on function public.transfer_master(uuid, uuid) to authenticated;
