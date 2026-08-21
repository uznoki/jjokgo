-- 읽기방 이름 수정 v1
-- 등록 사용자이면서 해당 방의 소유자인 경우에만 이름을 변경할 수 있습니다.

create or replace function public.update_reading_room_name(p_room_id text,p_name text)
returns setof public.reading_rooms
language plpgsql
security definer
set search_path=public
as $$
declare
  clean_name text := trim(coalesce(p_name,''));
  updated_room public.reading_rooms%rowtype;
begin
  if auth.uid() is null or (auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception 'REGISTERED_USER_REQUIRED' using errcode='P0001';
  end if;
  if p_room_id is null or char_length(p_room_id)>128 then
    raise exception 'INVALID_ROOM_ID' using errcode='P0001';
  end if;
  if char_length(clean_name) < 1 or char_length(clean_name) > 100 then
    raise exception 'INVALID_ROOM_NAME' using errcode='P0001';
  end if;

  update public.reading_rooms room
  set name=clean_name
  where room.id::text=p_room_id and room.owner_id=auth.uid()
  returning room.* into updated_room;

  if updated_room.id is null then
    raise exception 'ROOM_OWNER_REQUIRED' using errcode='P0001';
  end if;
  return next updated_room;
end;
$$;

revoke all on function public.update_reading_room_name(text,text) from public;
grant execute on function public.update_reading_room_name(text,text) to authenticated;
