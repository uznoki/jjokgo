import {useCallback,useEffect,useState} from "react";
import {BookOpen,ChevronRight,Copy,Lock,Pencil,Users} from "lucide-react";
import {supabase} from "../supabase";
import {BOOK_FIELDS,guestInviteUrl,joinReadingRoom,normalizeInviteCode} from "../services/readingRooms";
import BookPicker from "./BookPicker";

function roomError(error){
  const message=error?.message||"";
  const lowerMessage=message.toLowerCase();
  if((lowerMessage.includes("jwt")&&lowerMessage.includes("issued"))||lowerMessage.includes("not yet valid"))return "로그인 시간이 맞지 않아 연결을 새로 고쳐야 해요. 기기의 날짜·시간을 자동 설정한 뒤 다시 로그인해주세요.";
  if(lowerMessage.includes("jwt expired")||lowerMessage.includes("invalid jwt"))return "로그인 시간이 만료됐어요. 다시 로그인한 뒤 방을 만들어주세요.";
  if(message.includes("INVALID_INVITE_CODE"))return "초대 코드를 확인해주세요. 일치하는 읽기방이 없어요.";
  if(message.includes("REGISTERED_USER_REQUIRED"))return "방과 책 만들기는 정식 로그인 후 이용할 수 있어요.";
  if(message.includes("INVALID_ISBN"))return "ISBN 자리 수를 확인해주세요.";
  if(message.includes("INVALID_COVER_URL"))return "표지 주소는 https://로 시작해야 해요.";
  if(message.includes("BOOK_METADATA_TOO_LONG"))return "책 정보가 너무 길어요. 제목과 상세 정보를 줄여주세요.";
  if(message.includes("BOOK_UPDATE_DENIED"))return "이 책 정보를 수정할 권한이 없어요.";
  if(message.includes("total_pages")||message.includes("reading_start_page")||message.includes("reading_end_page")||message.includes("current_page"))return "읽기 페이지 데이터베이스 설정이 아직 적용되지 않았어요.";
  if(message.includes("join_reading_room_by_code")||message.includes("reading_room_members")){
    return "초대 기능의 데이터베이스 설정이 아직 적용되지 않았어요.";
  }
  if(message.includes("save_catalog_book")||message.includes("author")||message.includes("publisher")||message.includes("cover_url")||message.includes("isbn_")){
    return "도서 카탈로그 데이터베이스 설정이 아직 적용되지 않았어요.";
  }
  return message||"읽기방 정보를 불러오지 못했어요.";
}

function RoomCard({room,onOpen,showInvite=false,onEditBook}){
  const [copied,setCopied]=useState(false);
  async function copyCode(){
    if(!room.invite_code)return;
    await navigator.clipboard.writeText(guestInviteUrl(room.invite_code));
    setCopied(true);
    setTimeout(()=>setCopied(false),1200);
  }
  return <div className="roomListCard">
    <button className="roomCardOpen" onClick={()=>onOpen(room)}>
      <div className="thumb">{room.books?.cover_url?<img src={room.books.cover_url} alt=""/>:"📖"}</div>
      <span>
        <b>{room.name} {room.is_private?"🔒":""}</b>
        <small>{room.books?.title||"책 정보"}{room.books?.author?` · ${room.books.author}`:""}</small>
      </span>
      <ChevronRight/>
    </button>
    {showInvite&&<div className="roomOwnerActions">
      {room.invite_code&&<button className="inviteCode" onClick={copyCode} aria-label="게스트 초대 링크 복사"><Copy/> {copied?"링크 복사됨":room.invite_code}</button>}
      {room.books&&<button className="editBookButton" onClick={()=>onEditBook(room.books)}><Pencil/> 책 정보 보완</button>}
    </div>}
  </div>;
}

function BookMetadataEditor({book,onClose,onSaved}){
  const [fields,setFields]=useState({
    title:book.title||"",author:book.author||"",publisher:book.publisher||"",
    published_date:book.published_date||"",isbn_10:book.isbn_10||"",isbn_13:book.isbn_13||"",cover_url:book.cover_url||""
  });
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const update=(key,value)=>setFields(current=>({...current,[key]:value}));

  async function save(event){
    event.preventDefault();
    if(!fields.title.trim()||!fields.author.trim()){setMessage("책 제목과 저자를 입력해주세요.");return;}
    setSaving(true);
    setMessage("");
    const {error}=await supabase.rpc("update_book_metadata",{
      p_book_id:book.id,
      p_title:fields.title,
      p_author:fields.author,
      p_publisher:fields.publisher||null,
      p_published_date:fields.published_date||null,
      p_isbn_10:fields.isbn_10||null,
      p_isbn_13:fields.isbn_13||null,
      p_cover_url:fields.cover_url||null
    });
    if(error){setMessage(roomError(error));setSaving(false);return;}
    await onSaved();
    setSaving(false);
    onClose();
  }

  return <section className="bookEditor">
    <div className="bookEditorHeading"><div><BookOpen/><span><b>책 정보 보완</b><small>임시 등록한 책도 언제든 완성할 수 있어요.</small></span></div><button onClick={onClose}>닫기</button></div>
    <form onSubmit={save}>
      <label>책 제목<input required maxLength="300" value={fields.title} onChange={event=>update("title",event.target.value)}/></label>
      <label>저자<input required maxLength="300" value={fields.author} onChange={event=>update("author",event.target.value)}/></label>
      <label>출판사<input maxLength="300" value={fields.publisher} onChange={event=>update("publisher",event.target.value)}/></label>
      <label>출간일<input maxLength="32" value={fields.published_date} onChange={event=>update("published_date",event.target.value)} placeholder="예: 2026-08-20"/></label>
      <label>ISBN-13<input inputMode="numeric" maxLength="17" value={fields.isbn_13} onChange={event=>update("isbn_13",event.target.value)}/></label>
      <label>ISBN-10<input maxLength="13" value={fields.isbn_10} onChange={event=>update("isbn_10",event.target.value)}/></label>
      <label className="bookCoverUrl">표지 이미지 주소<input type="url" maxLength="2048" pattern="https://.*" value={fields.cover_url} onChange={event=>update("cover_url",event.target.value)} placeholder="https://"/></label>
      <button className="wide" disabled={saving}>{saving?"저장 중…":"책 정보 저장"}</button>
    </form>
    {message&&<div className="roomMessage">{message}</div>}
  </section>;
}

export function Rooms({setV,open,session,openAuth}){
  const isGuest=Boolean(session?.user?.is_anonymous);
  const [ownedRooms,setOwnedRooms]=useState([]);
  const [joinedRooms,setJoinedRooms]=useState([]);
  const [activeTab,setActiveTab]=useState("joined");
  const [inviteCode,setInviteCode]=useState("");
  const [busy,setBusy]=useState(true);
  const [joining,setJoining]=useState(false);
  const [message,setMessage]=useState("");
  const [editingBook,setEditingBook]=useState(null);

  const loadRooms=useCallback(async()=>{
    if(!session){setBusy(false);return;}
    setBusy(true);
    setMessage("");
    const ownedRequest=isGuest
      ?Promise.resolve({data:[],error:null})
      :supabase.from("reading_rooms").select(`*, books(${BOOK_FIELDS})`).eq("owner_id",session.user.id).order("created_at",{ascending:false});
    const [ownedResult,membershipResult]=await Promise.all([
      ownedRequest,
      supabase.from("reading_room_members").select(`role, joined_at, reading_rooms(*, books(${BOOK_FIELDS}))`).eq("user_id",session.user.id).eq("role","member").order("joined_at",{ascending:false})
    ]);
    if(ownedResult.error)setMessage(roomError(ownedResult.error));
    else setOwnedRooms(ownedResult.data||[]);
    if(membershipResult.error)setMessage(roomError(membershipResult.error));
    else setJoinedRooms((membershipResult.data||[]).map(item=>item.reading_rooms).filter(Boolean));
    setBusy(false);
  },[isGuest,session]);

  useEffect(()=>{loadRooms()},[loadRooms]);

  async function joinRoom(event){
    event.preventDefault();
    if(!session)return openAuth();
    setJoining(true);
    setMessage("");
    try{
      const room=await joinReadingRoom(inviteCode);
      setInviteCode("");
      setMessage("읽기방에 입장했어요!");
      setActiveTab("joined");
      await loadRooms();
      open(room);
    }catch(error){
      setMessage(roomError(error));
    }finally{
      setJoining(false);
    }
  }

  const visibleRooms=activeTab==="joined"?joinedRooms:ownedRooms;
  return <>
    <div className="roomFormatLabel">쪽GO PAGE · LIVE ROOMS</div>
    <h1>PAGE 읽기방</h1>
    <form className="joinRoomForm" onSubmit={joinRoom}>
      <Lock/>
      <input
        required
        minLength="6"
        maxLength="12"
        value={inviteCode}
        onChange={event=>setInviteCode(normalizeInviteCode(event.target.value))}
        placeholder="초대 코드 입력"
        aria-label="읽기방 초대 코드"
      />
      <button disabled={joining}>{joining?"입장 중…":"방 입장"}</button>
    </form>
    {message&&<div className="roomMessage" role="status">{message}</div>}
    {editingBook&&<BookMetadataEditor book={editingBook} onClose={()=>setEditingBook(null)} onSaved={loadRooms}/>}

    <div className="roomTabs" role="tablist">
      <button className={activeTab==="joined"?"active":""} onClick={()=>setActiveTab("joined")}>
        참여 중인 방 <small>{joinedRooms.length}</small>
      </button>
      {!isGuest&&<button className={activeTab==="owned"?"active":""} onClick={()=>setActiveTab("owned")}>
        내가 만든 방 <small>{ownedRooms.length}</small>
      </button>}
    </div>

    {busy&&<div className="loading">읽기방 불러오는 중…</div>}
    {!busy&&visibleRooms.length===0&&
      <div className="emptyRooms"><Users/><b>{activeTab==="joined"?"아직 참여 중인 방이 없어요":"아직 만든 읽기방이 없어요"}</b><small>{activeTab==="joined"?"초대 코드를 입력해 함께 읽어보세요.":"새 읽기방을 만들고 사람들을 초대해보세요."}</small></div>
    }
    {!busy&&visibleRooms.map(room=><RoomCard key={room.id} room={room} onOpen={open} showInvite={activeTab==="owned"} onEditBook={setEditingBook}/>)}

    {!isGuest&&<button className="wide" onClick={()=>session?setV("createRoom"):openAuth()}>+ PAGE 읽기방 만들기</button>}
  </>;
}

export function CreateRoom({setV,session}){
  const [name,setName]=useState("");
  const [selectedBook,setSelectedBook]=useState(null);
  const [totalPages,setTotalPages]=useState("");
  const [startPage,setStartPage]=useState("1");
  const [endPage,setEndPage]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [createdRoom,setCreatedRoom]=useState(null);
  const [copied,setCopied]=useState(false);

  async function createRoom(){
    if(!session)return;
    if(!name.trim()){setMessage("방 이름을 입력해주세요.");return;}
    if(!selectedBook){setMessage("함께 읽을 책을 검색하거나 직접 등록해주세요.");return;}
    const parsedTotal=totalPages===""?null:Number(totalPages);
    const parsedStart=Number(startPage);
    const parsedEnd=Number(endPage);
    if(!Number.isInteger(parsedStart)||!Number.isInteger(parsedEnd)||parsedStart<1||parsedEnd<parsedStart){setMessage("오늘 읽을 시작 쪽과 마지막 쪽을 확인해주세요.");return;}
    if(parsedTotal!==null&&(!Number.isInteger(parsedTotal)||parsedTotal<parsedEnd||parsedTotal>20000)){setMessage("책 전체 쪽수는 오늘 읽을 마지막 쪽보다 크거나 같아야 해요.");return;}
    setBusy(true);
    setMessage("");
    const{data:refreshData,error:refreshError}=await supabase.auth.refreshSession();
    const activeSession=refreshData?.session;
    if(refreshError||!activeSession){
      setMessage("로그인 연결을 새로 고치지 못했어요. 다시 로그인한 뒤 시도해주세요.");
      setBusy(false);
      return;
    }
    const {data:bookResult,error:bookError}=await supabase.rpc("save_catalog_book",{
      p_title:selectedBook.title,
      p_author:selectedBook.author||null,
      p_publisher:selectedBook.publisher||null,
      p_published_date:selectedBook.publishedDate||null,
      p_isbn_10:selectedBook.isbn10||null,
      p_isbn_13:selectedBook.isbn13||null,
      p_cover_url:selectedBook.coverUrl||null,
      p_source:selectedBook.source||"manual",
      p_external_id:selectedBook.externalId||null
    });
    const bookData=Array.isArray(bookResult)?bookResult[0]:bookResult;
    if(bookError||!bookData){
      setMessage("책을 등록하지 못했어요: "+roomError(bookError));
      setBusy(false);
      return;
    }
    const {data,error}=await supabase.from("reading_rooms").insert({
      name:name.trim(),book_id:bookData.id,owner_id:activeSession.user.id,is_private:true,
      total_pages:parsedTotal,reading_start_page:parsedStart,reading_end_page:parsedEnd,current_page:parsedStart,page_updated_by:activeSession.user.id
    }).select("id,name,invite_code,total_pages,reading_start_page,reading_end_page,current_page").single();
    if(error){
      setMessage("방을 만들지 못했어요: "+roomError(error));
      setBusy(false);
      return;
    }
    setCreatedRoom(data);
    setBusy(false);
  }

  async function copyInvite(){
    await navigator.clipboard.writeText(guestInviteUrl(createdRoom.invite_code));
    setCopied(true);
  }

  if(createdRoom){
    return <section className="auth createdRoom">
      <h1>PAGE 읽기방이 만들어졌어요!</h1>
      <p>함께 읽을 사람에게 게스트 초대 링크를 보내주세요.</p>
      <button className="createdInviteCode" onClick={copyInvite}><Copy/><b>{createdRoom.invite_code}</b><small>{copied?"초대 링크가 복사됐어요":"눌러서 게스트 링크 복사"}</small></button>
      <button className="wide" onClick={()=>setV("rooms")}>읽기방 목록으로</button>
    </section>;
  }

  return <section className="auth">
    <button className="back" onClick={()=>setV("rooms")}>‹ PAGE 읽기방</button>
    <div className="roomFormatLabel">쪽GO PAGE · EACH BOOK, ONE VOICE</div>
    <h1>PAGE 읽기방 만들기</h1>
    <p>같은 책을 각자 준비하고, 서로의 목소리를 들으며 읽는 LIVE 독서방이에요.</p>
    <div className="createRoomForm">
      <label>방 이름<input required maxLength="100" value={name} onChange={event=>setName(event.target.value)} placeholder="예: 우리 가족 책방"/></label>
      <BookPicker selected={selectedBook} onSelect={setSelectedBook}/>
      <section className="pagePlanFields" aria-labelledby="page-plan-title">
        <div className="pagePlanHeading"><b id="page-plan-title">오늘 읽을 페이지</b><small>실제 가지고 있는 책의 페이지를 기준으로 입력해주세요.</small></div>
        <label>책 전체 쪽수 <small>선택</small><input type="number" inputMode="numeric" min="1" max="20000" value={totalPages} onChange={event=>setTotalPages(event.target.value)} placeholder="예: 312"/></label>
        <label>시작 쪽<input required type="number" inputMode="numeric" min="1" max="20000" value={startPage} onChange={event=>setStartPage(event.target.value)}/></label>
        <label>마지막 쪽<input required type="number" inputMode="numeric" min={startPage||1} max={totalPages||20000} value={endPage} onChange={event=>setEndPage(event.target.value)} placeholder="예: 20"/></label>
        <p>전체 쪽수를 모르면 비워두어도 괜찮아요. 방을 만든 뒤 방장이 다시 설정할 수 있어요.</p>
      </section>
      <button type="button" className="wide" disabled={busy} onClick={createRoom}>{busy?"만드는 중…":"방 만들기"}</button>
    </div>
    {message&&<div className="authMsg">{message}</div>}
  </section>;
}
