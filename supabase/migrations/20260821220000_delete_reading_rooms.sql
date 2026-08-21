-- 읽기방 삭제 v1
-- 방장 본인만 방을 삭제할 수 있으며, 참여자 연결은 FK cascade로 정리됩니다.

create or replace function public.delete_reading_room(p_room_id text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  deleted_room_id text;
begin
  if auth.uid() is null or (auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception 'REGISTERED_USER_REQUIRED' using errcode='P0001';
  end if;
  if p_room_id is null or char_length(p_room_id)>128 then
    raise exception 'INVALID_ROOM_ID' using errcode='P0001';
  end if;

  delete from public.reading_rooms room
  where room.id::text=p_room_id and room.owner_id=auth.uid()
  returning room.id::text into deleted_room_id;

  if deleted_room_id is null then
    raise exception 'ROOM_OWNER_REQUIRED' using errcode='P0001';
  end if;
  return true;
end;
$$;

revoke all on function public.delete_reading_room(text) from public;
grant execute on function public.delete_reading_room(text) to authenticated;
