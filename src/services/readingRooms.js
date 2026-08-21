import {supabase} from "../supabase";

export const BOOK_FIELDS="id,title,author,publisher,published_date,isbn_10,isbn_13,cover_url,metadata_status";
export const ROOM_WITH_BOOK=`*, books(${BOOK_FIELDS})`;

export function normalizeInviteCode(value){
  return String(value||"").replace(/[^a-z0-9]/gi,"").toUpperCase().slice(0,16);
}

export function guestInviteUrl(inviteCode,origin=window.location.origin){
  const url=new URL(origin);
  url.searchParams.set("invite",normalizeInviteCode(inviteCode));
  return url.toString();
}

function firstRow(value){
  return Array.isArray(value)?value[0]:value;
}

export async function fetchReadingRoom(roomId){
  const {data,error}=await supabase
    .from("reading_rooms")
    .select(ROOM_WITH_BOOK)
    .eq("id",roomId)
    .single();
  if(error)throw error;
  return data;
}

export async function fetchJoinedReadingRooms(userId){
  if(!userId)return [];
  const {data,error}=await supabase
    .from("reading_room_members")
    .select(`role, joined_at, reading_rooms(*, books(${BOOK_FIELDS}))`)
    .eq("user_id",userId)
    .eq("role","member")
    .order("joined_at",{ascending:false});
  if(error)throw error;
  return (data||[]).map(item=>item.reading_rooms).filter(Boolean);
}

export async function joinReadingRoom(inviteCode){
  const normalized=normalizeInviteCode(inviteCode);
  if(normalized.length<6)throw new Error("INVALID_INVITE_CODE");

  const {data,error}=await supabase.rpc("join_reading_room_by_code",{
    p_invite_code:normalized
  });
  if(error)throw error;

  const joined=firstRow(data);
  if(!joined?.id)throw new Error("INVALID_INVITE_CODE");
  return fetchReadingRoom(joined.id);
}
