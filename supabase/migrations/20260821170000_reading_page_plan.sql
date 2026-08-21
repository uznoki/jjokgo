-- 쪽GO 읽기방 페이지 계획·현재 위치 v1
-- 원문은 저장하지 않고, 실제 소장 도서의 페이지 위치만 동기화합니다.

alter table public.reading_rooms
  add column if not exists total_pages integer,
  add column if not exists reading_start_page integer not null default 1,
  add column if not exists reading_end_page integer,
  add column if not exists current_page integer not null default 1,
  add column if not exists page_updated_at timestamptz not null default now(),
  add column if not exists page_updated_by uuid references auth.users(id) on delete set null;

-- 기존 데모 방의 위치는 유지하되, total_pages를 비워 27쪽 제한은 제거합니다.
update public.reading_rooms
set reading_start_page=17,
    reading_end_page=27,
    current_page=17,
    page_updated_at=now()
where total_pages is null
  and reading_start_page=1
  and reading_end_page is null
  and current_page=1
  and page_updated_by is null;

alter table public.reading_rooms
  drop constraint if exists reading_rooms_page_plan_check;

alter table public.reading_rooms
  add constraint reading_rooms_page_plan_check check (
    (total_pages is null or total_pages between 1 and 20000)
    and reading_start_page between 1 and 20000
    and (reading_end_page is null or reading_end_page between reading_start_page and 20000)
    and current_page between 1 and 20000
    and (total_pages is null or reading_start_page <= total_pages)
    and (total_pages is null or reading_end_page is null or reading_end_page <= total_pages)
    and (total_pages is null or current_page <= total_pages)
  );

create or replace function public.set_reading_room_page(p_room_id text,p_page integer)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  saved_page integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='P0001';
  end if;
  if p_room_id is null or char_length(p_room_id)>128 then
    raise exception 'INVALID_ROOM_ID' using errcode='P0001';
  end if;
  if p_page is null or p_page < 1 or p_page > 20000 then
    raise exception 'INVALID_PAGE' using errcode='P0001';
  end if;

  update public.reading_rooms room
  set current_page=p_page,page_updated_at=now(),page_updated_by=auth.uid()
  where room.id::text=p_room_id
    and (room.total_pages is null or p_page <= room.total_pages)
    and exists (
      select 1 from public.reading_room_members member
      where member.room_id=room.id and member.user_id=auth.uid()
    )
  returning room.current_page into saved_page;

  if saved_page is null then
    raise exception 'PAGE_UPDATE_DENIED' using errcode='P0001';
  end if;
  return saved_page;
end;
$$;

create or replace function public.update_reading_room_plan(
  p_room_id text,p_total_pages integer,p_start_page integer,p_end_page integer
)
returns setof public.reading_rooms
language plpgsql
security definer
set search_path=public
as $$
declare
  updated_room public.reading_rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='P0001';
  end if;
  if p_room_id is null or char_length(p_room_id)>128 then
    raise exception 'INVALID_ROOM_ID' using errcode='P0001';
  end if;
  if p_start_page is null or p_start_page < 1 or p_start_page > 20000
    or p_end_page is null or p_end_page < p_start_page or p_end_page > 20000
    or (p_total_pages is not null and (p_total_pages < p_end_page or p_total_pages > 20000)) then
    raise exception 'INVALID_PAGE_PLAN' using errcode='P0001';
  end if;

  update public.reading_rooms room
  set total_pages=p_total_pages,
      reading_start_page=p_start_page,
      reading_end_page=p_end_page,
      current_page=least(coalesce(p_total_pages,20000),greatest(room.current_page,p_start_page)),
      page_updated_at=now(),
      page_updated_by=auth.uid()
  where room.id::text=p_room_id and room.owner_id=auth.uid()
  returning room.* into updated_room;

  if updated_room.id is null then
    raise exception 'ROOM_OWNER_REQUIRED' using errcode='P0001';
  end if;
  return next updated_room;
end;
$$;

revoke all on function public.set_reading_room_page(text,integer) from public;
grant execute on function public.set_reading_room_page(text,integer) to authenticated;
revoke all on function public.update_reading_room_plan(text,integer,integer,integer) from public;
grant execute on function public.update_reading_room_plan(text,integer,integer,integer) to authenticated;
