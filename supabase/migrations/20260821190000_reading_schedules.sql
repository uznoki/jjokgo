-- 쪽GO 사용자별 정기 독서 일정 v1

create table if not exists public.reading_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  weekdays smallint[] not null,
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reading_schedules_title_check check (char_length(btrim(title)) between 1 and 80),
  constraint reading_schedules_weekdays_check check (
    cardinality(weekdays) between 1 and 7
    and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
  ),
  constraint reading_schedules_time_check check (end_time > start_time)
);

create index if not exists reading_schedules_user_id_idx
  on public.reading_schedules(user_id,start_time);

alter table public.reading_schedules enable row level security;

drop policy if exists "Users read own schedules" on public.reading_schedules;
create policy "Users read own schedules" on public.reading_schedules
  for select to authenticated using (user_id=auth.uid());

drop policy if exists "Users create own schedules" on public.reading_schedules;
create policy "Users create own schedules" on public.reading_schedules
  for insert to authenticated with check (user_id=auth.uid());

drop policy if exists "Users update own schedules" on public.reading_schedules;
create policy "Users update own schedules" on public.reading_schedules
  for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "Users delete own schedules" on public.reading_schedules;
create policy "Users delete own schedules" on public.reading_schedules
  for delete to authenticated using (user_id=auth.uid());

grant select,insert,update,delete on public.reading_schedules to authenticated;
revoke all on public.reading_schedules from anon;
