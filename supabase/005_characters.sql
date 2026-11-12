-- RPAssistant: персонажи (общий лист для мастера и игрока) и броски кубов
-- Безопасно выполнять повторно.

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,   -- игрок, которому принадлежит персонаж
  created_by uuid references public.profiles(id) on delete set null,
  name text not null default 'Новый персонаж',
  system text not null default 'vtm5',
  data jsonb not null default '{}'::jsonb,                            -- весь лист персонажа
  npc boolean not null default false,                                 -- персонаж мастера (виден только мастерам)
  client text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists characters_project_idx on public.characters(project_id);

create table if not exists public.dice_rolls (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  character_id uuid references public.characters(id) on delete set null,
  map_id uuid,
  secret boolean not null default false,                               -- видно только мастерам и бросившему
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists dice_rolls_project_idx on public.dice_rolls(project_id, created_at desc);

alter table public.map_tokens add column if not exists character_id uuid references public.characters(id) on delete set null;

alter table public.characters enable row level security;
alter table public.dice_rolls enable row level security;

drop policy if exists "chars read" on public.characters;
create policy "chars read" on public.characters for select to authenticated
  using (public.is_editor(project_id) or (owner_id = auth.uid() and public.is_member(project_id)));
drop policy if exists "chars insert" on public.characters;
create policy "chars insert" on public.characters for insert to authenticated
  with check (public.is_editor(project_id)
              or (public.is_member(project_id) and owner_id = auth.uid() and not npc));
drop policy if exists "chars update" on public.characters;
create policy "chars update" on public.characters for update to authenticated
  using (public.is_editor(project_id) or (owner_id = auth.uid() and public.is_member(project_id)))
  with check (public.is_editor(project_id) or (owner_id = auth.uid() and not npc));
drop policy if exists "chars delete" on public.characters;
create policy "chars delete" on public.characters for delete to authenticated
  using (public.is_editor(project_id) or (owner_id = auth.uid() and created_by = auth.uid()));

drop policy if exists "rolls read" on public.dice_rolls;
create policy "rolls read" on public.dice_rolls for select to authenticated
  using (public.is_editor(project_id) or (public.is_member(project_id) and (not secret or user_id = auth.uid())));
drop policy if exists "rolls insert" on public.dice_rolls;
create policy "rolls insert" on public.dice_rolls for insert to authenticated
  with check (user_id = auth.uid() and (public.is_editor(project_id) or public.is_member(project_id)));
drop policy if exists "rolls delete" on public.dice_rolls;
create policy "rolls delete" on public.dice_rolls for delete to authenticated
  using (public.is_editor(project_id));

-- точечная правка поля листа: мастер и игрок могут править одновременно, не затирая чужие изменения
create or replace function public.char_patch(c uuid, sets jsonb, cl text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ch characters; d jsonb; k text; v jsonb; nm text;
begin
  select * into ch from characters where id = c for update;
  if not found then raise exception 'not found'; end if;
  if not (public.is_editor(ch.project_id) or (ch.owner_id = auth.uid() and public.is_member(ch.project_id))) then
    raise exception 'forbidden';
  end if;
  d := coalesce(ch.data, '{}'::jsonb);
  for k, v in select * from jsonb_each(coalesce(sets, '{}'::jsonb)) loop
    -- ключ вида "attr.str" -> путь {attr,str}; null удаляет
    if v = 'null'::jsonb then d := d #- string_to_array(k, '.');
    else
      if array_length(string_to_array(k, '.'), 1) > 1
         and jsonb_typeof(d #> (string_to_array(k, '.'))[1:array_length(string_to_array(k, '.'), 1) - 1]) is distinct from 'object' then
        d := jsonb_set(d, (string_to_array(k, '.'))[1:array_length(string_to_array(k, '.'), 1) - 1], '{}'::jsonb, true);
      end if;
      d := jsonb_set(d, string_to_array(k, '.'), v, true);
    end if;
  end loop;
  nm := coalesce(nullif(d->>'name', ''), ch.name);
  update characters set data = d, name = nm, client = cl, updated_by = auth.uid(), updated_at = now() where id = c;
  return d;
end $$;
grant execute on function public.char_patch(uuid, jsonb, text) to authenticated;

-- игрок может привязать своего персонажа к своей фишке
create or replace function public.link_token_character(t uuid, c uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tk map_tokens; ch characters;
begin
  select * into tk from map_tokens where id = t;
  if not found then raise exception 'not found'; end if;
  if c is not null then select * into ch from characters where id = c; end if;
  if not (public.is_editor(tk.project_id)
          or (tk.owner_id = auth.uid() and (c is null or ch.owner_id = auth.uid()))) then
    raise exception 'forbidden';
  end if;
  update map_tokens set character_id = c, updated_at = now() where id = t;
end $$;
grant execute on function public.link_token_character(uuid, uuid) to authenticated;


-- ---------- рулбуки: извлечённый из PDF текст, закрыто для участников игры ----------
create table if not exists public.rulebooks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  path text not null,             -- rulebooks/<project_id>/<id>.json
  pages int not null default 0,
  sections int not null default 0,
  sort int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.rulebooks enable row level security;
drop policy if exists "rulebooks read" on public.rulebooks;
create policy "rulebooks read" on public.rulebooks for select to authenticated
  using (public.is_editor(project_id) or public.is_member(project_id));
drop policy if exists "rulebooks write" on public.rulebooks;
create policy "rulebooks write" on public.rulebooks for all to authenticated
  using (public.is_editor(project_id)) with check (public.is_editor(project_id));

insert into storage.buckets (id, name, public, file_size_limit)
values ('rulebooks', 'rulebooks', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "rulebooks files read" on storage.objects;
create policy "rulebooks files read" on storage.objects for select to authenticated
  using (bucket_id = 'rulebooks' and (public.is_editor(((storage.foldername(name))[1])::uuid)
                                      or public.is_member(((storage.foldername(name))[1])::uuid)));
drop policy if exists "rulebooks files write" on storage.objects;
create policy "rulebooks files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'rulebooks' and public.is_editor(((storage.foldername(name))[1])::uuid));
drop policy if exists "rulebooks files update" on storage.objects;
create policy "rulebooks files update" on storage.objects for update to authenticated
  using (bucket_id = 'rulebooks' and public.is_editor(((storage.foldername(name))[1])::uuid));
drop policy if exists "rulebooks files delete" on storage.objects;
create policy "rulebooks files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'rulebooks' and public.is_editor(((storage.foldername(name))[1])::uuid));

alter table public.characters replica identity full;
alter table public.dice_rolls replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.characters; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.dice_rolls; exception when duplicate_object then null; end;
end $$;
