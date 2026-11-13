-- RPAssistant: чат проекта (общий и личные сообщения)
-- Выполнить один раз в Supabase → SQL Editor.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  author_name text not null default '',
  to_id uuid references public.profiles(id) on delete cascade,   -- личное сообщение одному участнику
  to_gm boolean not null default false,                           -- личное сообщение мастерам
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_project_idx on public.chat_messages(project_id, created_at desc);

alter table public.chat_messages enable row level security;

-- мастера видят всё; игрок — общие сообщения, свои и адресованные ему
drop policy if exists "chat read" on public.chat_messages;
create policy "chat read" on public.chat_messages for select to authenticated
  using (
    public.is_editor(project_id)
    or (public.is_member(project_id) and (
      (to_id is null and not to_gm) or author_id = auth.uid() or to_id = auth.uid()
    ))
  );

drop policy if exists "chat insert" on public.chat_messages;
create policy "chat insert" on public.chat_messages for insert to authenticated
  with check (author_id = auth.uid() and (public.is_editor(project_id) or public.is_member(project_id)));

drop policy if exists "chat delete" on public.chat_messages;
create policy "chat delete" on public.chat_messages for delete to authenticated
  using (author_id = auth.uid() or public.is_editor(project_id));

do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null; end $$;
