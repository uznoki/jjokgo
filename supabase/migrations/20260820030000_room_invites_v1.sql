-- 쪽GO 읽기방 멤버십·초대 코드 v1
-- Supabase SQL Editor 또는 Supabase CLI migration으로 한 번 적용하세요.

create or replace function public.generate_room_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1 from public.reading_rooms where invite_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

alter table public.reading_rooms
  add column if not exists invite_code text;

update public.reading_rooms
set invite_code = public.generate_room_invite_code()
where invite_code is null;

alter table public.reading_rooms
  alter column invite_code set default public.generate_room_invite_code(),
  alter column invite_code set not null;

create unique index if not exists reading_rooms_invite_code_key
  on public.reading_rooms (invite_code);

do $$
declare
  room_id_type text;
begin
  select format_type(attribute.atttypid, attribute.atttypmod)
  into room_id_type
  from pg_attribute attribute
  where attribute.attrelid = 'public.reading_rooms'::regclass
    and attribute.attname = 'id'
    and not attribute.attisdropped;

  if room_id_type is null then
    raise exception 'reading_rooms.id column is required';
  end if;

  execute format(
    'create table if not exists public.reading_room_members (
      room_id %s not null references public.reading_rooms(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      role text not null default ''member'' check (role in (''owner'', ''member'')),
      joined_at timestamptz not null default now(),
      primary key (room_id, user_id)
    )',
    room_id_type
  );
end;
$$;

create index if not exists reading_room_members_user_id_idx
  on public.reading_room_members (user_id);

insert into public.reading_room_members (room_id, user_id, role)
select id, owner_id, 'owner'
from public.reading_rooms
on conflict (room_id, user_id) do update set role = 'owner';

create or replace function public.add_reading_room_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reading_room_members (room_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (room_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists reading_room_owner_membership on public.reading_rooms;
create trigger reading_room_owner_membership
after insert on public.reading_rooms
for each row execute function public.add_reading_room_owner_membership();

alter table public.reading_room_members enable row level security;
alter table public.reading_rooms enable row level security;

drop policy if exists "Members can view their membership" on public.reading_room_members;
create policy "Members can view their membership"
on public.reading_room_members
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Room owners can view memberships" on public.reading_room_members;

drop policy if exists "Members can view joined rooms" on public.reading_rooms;
create policy "Members can view joined rooms"
on public.reading_rooms
for select
to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.reading_room_members member
    where member.room_id = id and member.user_id = auth.uid()
  )
);

create or replace function public.join_reading_room_by_code(p_invite_code text)
returns setof public.reading_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.reading_rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into target_room
  from public.reading_rooms
  where invite_code = upper(trim(p_invite_code))
  limit 1;

  if target_room.id is null then
    raise exception 'INVALID_INVITE_CODE' using errcode = 'P0001';
  end if;

  insert into public.reading_room_members (room_id, user_id, role)
  values (target_room.id, auth.uid(), case when target_room.owner_id = auth.uid() then 'owner' else 'member' end)
  on conflict (room_id, user_id) do nothing;

  return next target_room;
end;
$$;

revoke all on function public.join_reading_room_by_code(text) from public;
grant execute on function public.join_reading_room_by_code(text) to authenticated;

grant select on public.reading_room_members to authenticated;
