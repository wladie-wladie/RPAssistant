-- RPAssistant: личные заметки участника в кампании (видит только автор)
-- Выполнить в Supabase → SQL Editor. Можно запускать повторно.

create table if not exists public.player_notes (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 100000),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.player_notes enable row level security;

drop policy if exists "notes own" on public.player_notes;
create policy "notes own" on public.player_notes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (public.is_member(project_id) or public.is_editor(project_id)));

notify pgrst, 'reload schema';
