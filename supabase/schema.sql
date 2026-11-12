-- RPAssistant: схема базы данных Supabase
-- Выполнить один раз в SQL Editor проекта.

-- ---------- профили ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  login text unique,
  name text not null,
  role text check (role in ('master','player')),
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- вход по логину передаёт login/name/role; вход через Google — только имя и аватар, роль выбирается в приложении
  insert into public.profiles (id, login, name, role, avatar_url)
  values (
    new.id,
    lower(nullif(new.raw_user_meta_data->>'login','')),
    coalesce(nullif(new.raw_user_meta_data->>'name',''), nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
    case when new.raw_user_meta_data->>'role' in ('master','player') then new.raw_user_meta_data->>'role' else null end,
    new.raw_user_meta_data->>'avatar_url'
  ) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- проекты ----------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  system jsonb not null,
  description text not null default '',
  color text not null default '#7c5cff',
  code text unique not null,
  board_access text not null default 'view' check (board_access in ('view','none')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.boards (
  project_id uuid primary key references public.projects(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  client text
);
alter table public.boards add column if not exists client text;

-- ---------- вспомогательные функции (обходят RLS безопасно) ----------
create or replace function public.is_owner(p uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from projects where id = p and owner_id = auth.uid())
$$;

create or replace function public.is_member(p uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from project_members where project_id = p and user_id = auth.uid())
$$;

create or replace function public.shares_project(u uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from projects pr
    left join project_members m on m.project_id = pr.id
    where (pr.owner_id = auth.uid() and m.user_id = u)
       or (pr.owner_id = u and m.user_id = auth.uid())
       or (m.user_id = auth.uid() and exists(select 1 from project_members m2 where m2.project_id = pr.id and m2.user_id = u))
  )
$$;

-- вход по коду приглашения
create or replace function public.join_project(join_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into pid from projects where code = upper(trim(join_code));
  if pid is null then return null; end if;
  insert into project_members(project_id, user_id) values (pid, auth.uid()) on conflict do nothing;
  return pid;
end $$;

-- проверка, свободен ли логин (до регистрации)
create or replace function public.login_taken(l text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from profiles where login = lower(trim(l)))
$$;
grant execute on function public.login_taken(text) to anon, authenticated;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.boards enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_project(id));
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- напрямую можно менять только имя; роль задаётся один раз через complete_profile
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

create or replace function public.complete_profile(p_name text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_role not in ('master','player') then raise exception 'bad role'; end if;
  update profiles set role = coalesce(role, p_role), name = coalesce(nullif(trim(p_name),''), name)
  where id = auth.uid();
end $$;

drop policy if exists "projects read" on public.projects;
create policy "projects read" on public.projects for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id));
drop policy if exists "projects insert" on public.projects;
create policy "projects insert" on public.projects for insert to authenticated
  with check (owner_id = auth.uid() and exists(select 1 from public.profiles where id = auth.uid() and role = 'master'));
drop policy if exists "projects update" on public.projects;
create policy "projects update" on public.projects for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "projects delete" on public.projects;
create policy "projects delete" on public.projects for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists "members read" on public.project_members;
create policy "members read" on public.project_members for select to authenticated
  using (user_id = auth.uid() or public.is_owner(project_id) or public.is_member(project_id));
drop policy if exists "members delete" on public.project_members;
create policy "members delete" on public.project_members for delete to authenticated
  using (user_id = auth.uid() or public.is_owner(project_id));

drop policy if exists "boards read" on public.boards;
create policy "boards read" on public.boards for select to authenticated
  using (public.is_owner(project_id) or (public.is_member(project_id)
         and exists(select 1 from public.projects p where p.id = project_id and p.board_access = 'view')));
drop policy if exists "boards insert" on public.boards;
create policy "boards insert" on public.boards for insert to authenticated
  with check (public.is_owner(project_id));
drop policy if exists "boards update" on public.boards;
create policy "boards update" on public.boards for update to authenticated
  using (public.is_owner(project_id)) with check (public.is_owner(project_id));

-- ---------- онлайн-обновления ----------
alter table public.boards replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.boards; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.projects; exception when duplicate_object then null; end;
end $$;

-- ---------- хранилище картинок ----------
insert into storage.buckets (id, name, public) values ('board-assets', 'board-assets', true)
  on conflict (id) do nothing;

drop policy if exists "assets upload own folder" on storage.objects;
create policy "assets upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'board-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "assets delete own" on storage.objects;
create policy "assets delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'board-assets' and (storage.foldername(name))[1] = auth.uid()::text);
