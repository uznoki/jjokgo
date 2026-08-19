import {useCallback,useEffect,useState} from "react";
import {ChevronRight,Copy,Lock,Users} from "lucide-react";
import {supabase} from "../supabase";

function roomError(error){
  const message=error?.message||"";
  if(message.includes("INVALID_INVITE_CODE"))return "초대 코드를 확인해주세요. 일치하는 읽기방이 없어요.";
  if(message.includes("join_reading_room_by_code")||message.includes("reading_room_members")){
    return "초대 기능의 데이터베이스 설정이 아직 적용되지 않았어요.";
  }
  return message||"읽기방 정보를 불러오지 못했어요.";
}

function RoomCard({room,onOpen,showInvite=false}){
  const [copied,setCopied]=useState(false);
  async function copyCode(){
    if(!room.invite_code)return;
    await navigator.clipboard.writeText(room.invite_code);
    setCopied(true);
    setTimeout(()=>setCopied(false),1200);
  }
  return <div className="roomListCard">
    <button className="roomCardOpen" onClick={()=>onOpen(room)}>
      <div className="thumb">📖</div>
      <span>
        <b>{room.name} {room.is_private?"🔒":""}</b>
        <small>{room.books?.title||"책 정보"}</small>
      </span>
      <ChevronRight/>
    </button>
    {showInvite&&room.invite_code&&
      <button className="inviteCode" onClick={copyCode} aria-label="초대 코드 복사">
        <Copy/> {copied?"복사됨":room.invite_code}
      </button>
    }
  </div>;
}

export function Rooms({setV,open,session,openAuth}){
  const [ownedRooms,setOwnedRooms]=useState([]);
  const [joinedRooms,setJoinedRooms]=useState([]);
  const [activeTab,setActiveTab]=useState("joined");
  const [inviteCode,setInviteCode]=useState("");
  const [busy,setBusy]=useState(true);
  const [joining,setJoining]=useState(false);
  const [message,setMessage]=useState("");

  const loadRooms=useCallback(async()=>{
    if(!session){setBusy(false);return;}
    setBusy(true);
    setMessage("");
    const [ownedResult,membershipResult]=await Promise.all([
      supabase.from("reading_rooms").select("*, books(title)").eq("owner_id",session.user.id).order("created_at",{ascending:false}),
      supabase.from("reading_room_members").select("role, joined_at, reading_rooms(*, books(title))").eq("user_id",session.user.id).eq("role","member").order("joined_at",{ascending:false})
    ]);
    if(ownedResult.error)setMessage(roomError(ownedResult.error));
    else setOwnedRooms(ownedResult.data||[]);
    if(membershipResult.error)setMessage(roomError(membershipResult.error));
    else setJoinedRooms((membershipResult.data||[]).map(item=>item.reading_rooms).filter(Boolean));
    setBusy(false);
  },[session]);

  useEffect(()=>{loadRooms()},[loadRooms]);

  async function joinRoom(event){
    event.preventDefault();
    if(!session)return openAuth();
    setJoining(true);
    setMessage("");
    const {data,error}=await supabase.rpc("join_reading_room_by_code",{p_invite_code:inviteCode.trim().toUpperCase()});
    if(error){
      setMessage(roomError(error));
      setJoining(false);
      return;
    }
    setInviteCode("");
    setMessage("읽기방에 입장했어요!");
    setActiveTab("joined");
    await loadRooms();
    setJoining(false);
    const joined=Array.isArray(data)?data[0]:data;
    if(joined?.id){
      const {data:room}=await supabase.from("reading_rooms").select("*, books(title)").eq("id",joined.id).single();
      if(room)open(room);
    }
  }

  const visibleRooms=activeTab==="joined"?joinedRooms:ownedRooms;
  return <>
    <h1>함께 읽기방</h1>
    <form className="joinRoomForm" onSubmit={joinRoom}>
      <Lock/>
      <input
        required
        minLength="6"
        maxLength="12"
        value={inviteCode}
        onChange={event=>setInviteCode(event.target.value.replace(/[^a-z0-9]/gi,"").toUpperCase())}
        placeholder="초대 코드 입력"
        aria-label="읽기방 초대 코드"
      />
      <button disabled={joining}>{joining?"입장 중…":"방 입장"}</button>
    </form>
    {message&&<div className="roomMessage" role="status">{message}</div>}

    <div className="roomTabs" role="tablist">
      <button className={activeTab==="joined"?"active":""} onClick={()=>setActiveTab("joined")}>
        참여 중인 방 <small>{joinedRooms.length}</small>
      </button>
      <button className={activeTab==="owned"?"active":""} onClick={()=>setActiveTab("owned")}>
        내가 만든 방 <small>{ownedRooms.length}</small>
      </button>
    </div>

    {busy&&<div className="loading">읽기방 불러오는 중…</div>}
    {!busy&&visibleRooms.length===0&&
      <div className="emptyRooms"><Users/><b>{activeTab==="joined"?"아직 참여 중인 방이 없어요":"아직 만든 읽기방이 없어요"}</b><small>{activeTab==="joined"?"초대 코드를 입력해 함께 읽어보세요.":"새 읽기방을 만들고 사람들을 초대해보세요."}</small></div>
    }
    {!busy&&visibleRooms.map(room=><RoomCard key={room.id} room={room} onOpen={open} showInvite={activeTab==="owned"}/>)}

    <button className="wide" onClick={()=>session?setV("createRoom"):openAuth()}>+ 함께 읽기방 만들기</button>
  </>;
}

export function CreateRoom({setV,session}){
  const [name,setName]=useState("");
  const [book,setBook]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [createdRoom,setCreatedRoom]=useState(null);
  const [copied,setCopied]=useState(false);

  async function createRoom(event){
    event.preventDefault();
    if(!session)return;
    setBusy(true);
    setMessage("");
    const {data:bookData,error:bookError}=await supabase.from("books").select("id,title").eq("title",book.trim()).maybeSingle();
    if(bookError||!bookData){
      setMessage("책 조회 오류: "+(bookError?.message||"일치하는 책이 없어요."));
      setBusy(false);
      return;
    }
    const {data,error}=await supabase.from("reading_rooms").insert({name:name.trim(),book_id:bookData.id,owner_id:session.user.id,is_private:true}).select("id,name,invite_code").single();
    if(error){
      setMessage("방을 만들지 못했어요: "+roomError(error));
      setBusy(false);
      return;
    }
    setCreatedRoom(data);
    setBusy(false);
  }

  async function copyInvite(){
    await navigator.clipboard.writeText(createdRoom.invite_code);
    setCopied(true);
  }

  if(createdRoom){
    return <section className="auth createdRoom">
      <div className="authBrand">쪽<span>GO</span></div>
      <h1>읽기방이 만들어졌어요!</h1>
      <p>함께 읽을 사람에게 아래 코드를 보내주세요.</p>
      <button className="createdInviteCode" onClick={copyInvite}><Copy/><b>{createdRoom.invite_code}</b><small>{copied?"복사됐어요":"눌러서 복사"}</small></button>
      <button className="wide" onClick={()=>setV("rooms")}>읽기방 목록으로</button>
    </section>;
  }

  return <section className="auth">
    <button className="back" onClick={()=>setV("rooms")}>‹ 함께 읽기방</button>
    <div className="authBrand">쪽<span>GO</span></div>
    <h1>함께 읽기방 만들기</h1>
    <p>같이 읽을 사람들과 새로운 LIVE 독서방을 만들어보세요.</p>
    <form onSubmit={createRoom}>
      <label>방 이름<input required value={name} onChange={event=>setName(event.target.value)} placeholder="예: 우리 가족 책방"/></label>
      <label>읽을 책<input required value={book} onChange={event=>setBook(event.target.value)} placeholder="예: 어린 왕자"/></label>
      <button className="wide" disabled={busy}>{busy?"만드는 중…":"방 만들기"}</button>
    </form>
    {message&&<div className="authMsg">{message}</div>}
  </section>;
}
