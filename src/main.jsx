import React,{useEffect,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import{Home,Users,Mic,BookOpen,UserRound,Lock,ChevronRight,CalendarDays,LogOut,Mail,KeyRound,Camera,Pencil,Save,X}from"lucide-react";
import{supabase}from"./supabase";
import{LiveRoom}from"./components/LiveRoom";
import{CreateRoom,Rooms}from"./components/Rooms";
import{Library}from"./components/Library";
import{GuestJoin}from"./components/GuestJoin";
import{BrandWordmark}from"./components/BrandWordmark";
import{normalizeInviteCode}from"./services/readingRooms";
import"./style.css";
import"./calm.css";
import"./magazine.css";
const demoRooms=[{id:null,name:"은호네 독서모임",books:{title:"어린 왕자"},progress:43,range:"17~19쪽",is_private:true},{id:null,name:"가족 책방",books:{title:"데미안"},progress:28,range:"4~6쪽",is_private:true},{id:null,name:"성당 천사부",books:{title:"아낌없이 주는 나무"},progress:67,range:"10~12쪽",is_private:true}];

function inviteFromUrl(){
  return normalizeInviteCode(new URLSearchParams(window.location.search).get("invite"));
}

function clearInviteFromUrl(){
  const url=new URL(window.location.href);
  url.searchParams.delete("invite");
  window.history.replaceState({},"",`${url.pathname}${url.search}${url.hash}`);
}

function App(){
  const [inviteCode]=useState(inviteFromUrl);
  const [v,setV]=useState(inviteCode?"guest":"home");
  const [room,setRoom]=useState(null);
  const [session,setSession]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    let active=true;
    supabase.auth.getSession()
      .then(({data})=>{
        if(active)setSession(data.session);
      })
      .catch(error=>console.error("Session restore failed",error))
      .finally(()=>{
        if(active)setLoading(false);
      });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,nextSession)=>{
      if(active)setSession(nextSession);
    });
    return ()=>{
      active=false;
      subscription.unsubscribe();
    };
  },[]);

  const isGuest=Boolean(session?.user?.is_anonymous);
  const openAuth=()=>setV("auth");
  const openRooms=()=>setV(session?"rooms":"auth");
  const openLibrary=()=>setV(session&&!isGuest?"library":"auth");
  const cancelGuest=()=>{
    clearInviteFromUrl();
    setV("home");
  };
  const finishGuest=({session:guestSession,room:joinedRoom})=>{
    clearInviteFromUrl();
    setSession(guestSession);
    setRoom(joinedRoom);
    setV("room");
  };
  const openRoom=nextRoom=>{
    setRoom(nextRoom);
    setV("room");
  };
  const accountView=session?(isGuest?"rooms":"my"):"auth";

  return <div className={`app view-${v}`}>
    <div className="readingBanner"><span>JJOKGO — LIVE READING JOURNAL</span><b>ONE PAGE AT A TIME</b></div>
    <main>
      <header>
        <button className="brand" onClick={()=>setV("home")} aria-label="쪽GO 홈으로">
          <BrandWordmark/>
        </button>
        <div className="mastNav" aria-label="주요 메뉴">
          <button onClick={()=>setV("home")}>JOURNAL</button>
          <button onClick={openRooms}>LIVE ROOMS</button>
          <button onClick={openLibrary}>LIBRARY</button>
        </div>
        <button className="headAccount" onClick={()=>setV(accountView)}>
          <UserRound/>{isGuest?"게스트":session?"MY":"로그인"}
        </button>
      </header>
      {loading?<div className="loading">쪽GO 불러오는 중…</div>:<>
        {v==="guest"&&inviteCode&&<GuestJoin inviteCode={inviteCode} session={session} onJoined={finishGuest} onCancel={cancelGuest}/>}
        {v==="home"&&<HomeP setV={setV} session={session} openAuth={openAuth}/>}
        {v==="createRoom"&&!isGuest&&<CreateRoom setV={setV} session={session}/>}
        {v==="rooms"&&<Rooms setV={setV} open={openRoom} session={session} openAuth={openAuth}/>}
        {v==="room"&&<LiveRoom room={room} setView={setV} session={session}/>}
        {v==="library"&&session&&!isGuest&&<Library session={session} openRoom={openRoom}/>}
        {v==="my"&&(session&&!isGuest?<My session={session} setV={setV}/>:<Auth setV={setV}/>)}
        {v==="auth"&&<Auth setV={setV}/>}
      </>}
    </main>
    {v!=="auth"&&v!=="guest"&&<nav>
      <N i={<Home/>} t="홈" f={()=>setV("home")} active={v==="home"}/>
      <N i={<Users/>} t="쪽GO" f={openRooms} active={["rooms","createRoom","room"].includes(v)}/>
      <button className={`mic ${v==="room"?"active":""}`} aria-label="LIVE 독서방 열기" onClick={openRooms}><Mic/><small>LIVE</small></button>
      <N i={<BookOpen/>} t="내 서재" f={openLibrary} active={v==="library"}/>
      <N i={<UserRound/>} t="MY" f={()=>setV(accountView)} active={["my","auth"].includes(v)}/>
    </nav>}
  </div>;
}
const N=({i,t,f,active=false,disabled=false})=><button className={active?"active":""} onClick={f} disabled={disabled} aria-current={active?"page":undefined}>{i}<small>{t}</small></button>;
function Auth({setV}){const[mode,setMode]=useState("login"),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[nickname,setNickname]=useState(""),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
async function submit(e){e.preventDefault();setBusy(true);setMsg("");try{if(mode==="signup"){const cleanNickname=nickname.trim();const{data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{nickname:cleanNickname},emailRedirectTo:window.location.origin}});if(error)throw error;if(data.session){setMsg("가입 완료! 로그인되었습니다.");setTimeout(()=>setV("my"),600)}else setMsg("가입 완료! 이메일로 보낸 인증 링크를 눌러주세요.")}else{const{error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setV("my")}}catch(err){setMsg(translateAuthError(err.message))}finally{setBusy(false)}}
return <section className="auth"><button className="back" onClick={()=>setV("home")}>‹ 홈으로</button><h1>{mode==="login"?"다시 만나 반가워요":"쪽GO를 시작해요"}</h1><p>{mode==="login"?"로그인하고 함께 읽던 책을 이어가세요.":"한 쪽씩, 함께 읽는 계정을 만들어보세요."}</p><div className="authTabs"><button type="button" className={mode==="login"?"active":""} onClick={()=>{setMode("login");setMsg("")}}>로그인</button><button type="button" className={mode==="signup"?"active":""} onClick={()=>{setMode("signup");setMsg("")}}>회원가입</button></div><form onSubmit={submit}>{mode==="signup"&&<label>닉네임<input required maxLength="30" autoComplete="nickname" value={nickname} onChange={e=>setNickname(e.target.value)} placeholder="쪽GO에서 사용할 이름"/></label>}<label><Mail/> 이메일<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label><label><KeyRound/> 비밀번호<input required minLength="6" autoComplete={mode==="login"?"current-password":"new-password"} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="6자 이상"/></label><button className="wide" disabled={busy}>{busy?"처리 중…":mode==="login"?"로그인":"회원가입"}</button></form>{msg&&<div className="authMsg" role="status">{msg}</div>}<small className="authNote">회원가입 시 입력한 이메일로 인증 메일이 발송됩니다.</small></section>}
function translateAuthError(m=""){if(m.includes("Invalid login credentials"))return"이메일 또는 비밀번호를 확인해주세요.";if(m.includes("already registered"))return"이미 가입된 이메일이에요.";if(m.includes("Password should"))return"비밀번호는 6자 이상으로 입력해주세요.";if(m.toLowerCase().includes("email rate limit"))return"인증 메일 요청이 잠시 많아요. 초대 링크가 있다면 게스트로 바로 입장할 수 있어요.";return"로그인 처리 중 문제가 생겼어요. 잠시 후 다시 시도해주세요."}
function HomeP({setV,session,openAuth}){const openRooms=()=>session?setV("rooms"):openAuth();return <><section className="hero"><div><small className="heroEyebrow">READ TOGETHER</small><h1>한 쪽씩,<br/>함께 GO.</h1><p>같은 책을 펼치고 서로의 목소리를 들으며,<br/>오늘의 한 쪽을 함께 읽어요.</p></div><div className="heroArt" aria-hidden="true"><div className="editorialTile tileMain"><span>오늘의 LIVE</span><b>같은 책,<br/>서로의 목소리</b><Mic/></div><div className="editorialTile tilePage"><small>NOW READING</small><b>17쪽</b></div><div className="editorialTile tilePeople"><small>TOGETHER</small><b>3명 LIVE</b></div></div></section>{!session&&<button className="welcome" onClick={openAuth}><UserRound/><span><b>내 독서 기록을 이어가세요</b><small>로그인하면 읽기방과 기록을 안전하게 보관할 수 있어요.</small></span><ChevronRight/></button>}<section className="homeActions" aria-label="빠른 시작"><button className="primaryAction" onClick={openRooms}><span className="actionIcon"><Mic/></span><span><small>지금 바로 시작</small><b>LIVE 함께 읽기</b><em>실시간으로 목소리 나누기</em></span><ChevronRight/></button><button className="secondaryAction" onClick={openRooms}><Users/><span><b>함께 읽기방 만들기</b><small>책을 고르고 사람들을 초대해요</small></span><ChevronRight/></button><button className="codeAction" onClick={openRooms}><Lock/> 초대 코드로 입장</button></section><h3>지금 가장 많이 읽히는 책</h3><div className="books">{[["어린 왕자",73],["데미안",58],["아낌없이 주는 나무",67]].map((x,i)=><div key={i}><div className="cover"><small>JJOKGO READING LIST</small><span>{x[0]}</span><i>0{i+1}</i></div><b>{x[0]}</b><strong>{x[1]}%</strong><Progress p={x[1]}/></div>)}</div><h3>나의 읽기 현황</h3><Calendar/><h3>참여 중인 방</h3><Card r={demoRooms[0]} f={openRooms}/></>}
function Progress({p}){return <div className="bar"><i style={{width:p+"%"}}/></div>}
function Card({r,f}){return <button className="card" onClick={f}><div className="thumb">📖</div><span><b>{r.name} {r.is_private?"🔒":""}</b><small>{r.books?.title} · 7명 참여</small><Progress p={r.progress||0}/></span><strong>{r.progress||0}%</strong><ChevronRight/></button>}
function Calendar(){
  const today=new Date();
  const[visibleMonth,setVisibleMonth]=useState(()=>new Date(today.getFullYear(),today.getMonth(),1));
  const year=visibleMonth.getFullYear();
  const month=visibleMonth.getMonth();
  const firstDay=(new Date(year,month,1).getDay()+6)%7;
  const dayCount=new Date(year,month+1,0).getDate();
  const cells=[...Array(firstDay).fill(null),...Array.from({length:dayCount},(_,i)=>i+1)];
  while(cells.length%7)cells.push(null);
  const isCurrentMonth=year===today.getFullYear()&&month===today.getMonth();
  const completedDays=new Set([3,8,12,17]);
  const moveMonth=offset=>setVisibleMonth(new Date(year,month+offset,1));
  return <section className="calendar" aria-label={`${year}년 ${month+1}월 읽기 현황`}>
    <div className="calendarHead">
      <strong>{year}년 {month+1}월</strong>
      <div><button type="button" onClick={()=>moveMonth(-1)} aria-label="이전 달">‹</button><button type="button" onClick={()=>moveMonth(1)} aria-label="다음 달">›</button></div>
    </div>
    <div className="cal" role="grid">
      {["월","화","수","목","금","토","일"].map((label,index)=><b key={label} role="columnheader" className={index===5?"saturday":index===6?"sunday":""}>{label}</b>)}
      {cells.map((day,index)=>{
        const weekendClass=index%7===5?"saturday":index%7===6?"sunday":"";
        if(!day)return <span key={`empty-${index}`} className={`empty ${weekendClass}`.trim()} aria-hidden="true"/>;
        const statusClass=isCurrentMonth&&day===today.getDate()?"doing":isCurrentMonth&&completedDays.has(day)?"done":"";
        const hasReadingSchedule=[0,1,3].includes(index%7);
        return <span key={`${year}-${month}-${day}`} role="gridcell" className={`${weekendClass} ${statusClass} ${hasReadingSchedule?"scheduled":""}`.trim()} aria-label={`${month+1}월 ${day}일${hasReadingSchedule?", 오후 8시 30분 읽기 일정":""}`}>{day}{hasReadingSchedule&&<small className="scheduleTime">20:30</small>}</span>;
      })}
    </div>
    <div className="scheduleDiary">
      <div className="scheduleDiaryHead"><small>MY JJOKGO DIARY</small><strong>나의 쪽GO 일정</strong></div>
      <article className="scheduleEntry">
        <div className="scheduleWhen"><small>EVERY WEEK</small><b>20:30—21:30</b></div>
        <div className="scheduleDetail"><span className="scheduleType">정기 일정</span><strong>아이들과 함께 읽기</strong><div className="scheduleDays" aria-label="매주 월요일, 화요일, 목요일"><i>월</i><i>화</i><i>목</i></div></div>
      </article>
    </div>
  </section>
}

async function resizeProfileImage(file){
  if(!file.type.startsWith("image/"))throw new Error("IMAGE_TYPE");
  if(file.size>8*1024*1024)throw new Error("IMAGE_SIZE");
  const objectUrl=URL.createObjectURL(file);
  const image=await new Promise((resolve,reject)=>{
    const element=new Image();
    element.onload=()=>resolve(element);
    element.onerror=()=>{URL.revokeObjectURL(objectUrl);reject(new Error("IMAGE_PROCESS"))};
    element.src=objectUrl;
  });
  const scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
  URL.revokeObjectURL(objectUrl);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("IMAGE_PROCESS")),"image/webp",.84));
}

function My({session,setV}){
  const fallbackNickname=session.user.email?.split("@")[0]||"쪽GO 사용자";
  const savedNickname=session.user.user_metadata?.nickname||fallbackNickname;
  const savedAvatar=session.user.user_metadata?.avatar_url||"";
  const fileRef=useRef(null);
  const[nickname,setNickname]=useState(savedNickname);
  const[avatarUrl,setAvatarUrl]=useState(savedAvatar);
  const[photo,setPhoto]=useState(null);
  const[preview,setPreview]=useState(savedAvatar);
  const[editing,setEditing]=useState(false);
  const[saving,setSaving]=useState(false);
  const[message,setMessage]=useState("");

  useEffect(()=>()=>{if(preview?.startsWith("blob:"))URL.revokeObjectURL(preview)},[preview]);

  function choosePhoto(event){
    const file=event.target.files?.[0];
    if(!file)return;
    if(!file.type.startsWith("image/")||file.size>8*1024*1024){setMessage("8MB 이하의 이미지 파일을 선택해주세요.");return;}
    if(preview?.startsWith("blob:"))URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setMessage("");
  }

  function cancelEdit(){
    if(preview?.startsWith("blob:"))URL.revokeObjectURL(preview);
    setNickname(savedNickname);setAvatarUrl(savedAvatar);setPreview(savedAvatar);setPhoto(null);setMessage("");setEditing(false);
    if(fileRef.current)fileRef.current.value="";
  }

  async function saveProfile(event){
    event.preventDefault();
    const cleanNickname=nickname.trim();
    if(cleanNickname.length<2){setMessage("닉네임은 2자 이상 입력해주세요.");return;}
    setSaving(true);setMessage("");
    try{
      let nextAvatar=avatarUrl;
      if(photo){
        const resized=await resizeProfileImage(photo);
        const path=`${session.user.id}/avatar.webp`;
        const{error:uploadError}=await supabase.storage.from("avatars").upload(path,resized,{contentType:"image/webp",upsert:true,cacheControl:"3600"});
        if(uploadError)throw uploadError;
        const{data}=supabase.storage.from("avatars").getPublicUrl(path);
        nextAvatar=`${data.publicUrl}?v=${Date.now()}`;
      }
      const{data,error}=await supabase.auth.updateUser({data:{nickname:cleanNickname,avatar_url:nextAvatar}});
      if(error)throw error;
      setNickname(data.user.user_metadata?.nickname||cleanNickname);
      setAvatarUrl(data.user.user_metadata?.avatar_url||nextAvatar);
      setPreview(data.user.user_metadata?.avatar_url||nextAvatar);
      setPhoto(null);setEditing(false);setMessage("프로필을 저장했어요.");
      if(fileRef.current)fileRef.current.value="";
    }catch(error){
      console.error("Profile update failed",error);
      const storageMissing=String(error?.message||"").toLowerCase().includes("bucket");
      setMessage(storageMissing?"프로필 사진 저장소 설정이 아직 적용되지 않았어요.":"프로필을 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    }finally{setSaving(false)}
  }

  async function logout(){await supabase.auth.signOut();setV("home")}
  return <>
    <section className="profileHero">
      <button type="button" className="avatar" onClick={()=>editing&&fileRef.current?.click()} aria-label={editing?"프로필 사진 선택":"프로필 사진"}>
        {preview?<img src={preview} alt="내 프로필"/>:<UserRound/>}{editing&&<span><Camera/></span>}
      </button>
      <div><small>MY 쪽GO</small><h1>{nickname}님</h1><p>{session.user.email}</p></div>
      {!editing&&<button type="button" className="editProfileButton" onClick={()=>{setEditing(true);setMessage("")}}><Pencil/> 프로필 수정</button>}
    </section>
    {editing&&<form className="profileEditor" onSubmit={saveProfile}>
      <input ref={fileRef} className="profileFileInput" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={choosePhoto}/>
      <button type="button" className="photoSelectButton" onClick={()=>fileRef.current?.click()}><Camera/> 사진 등록·변경</button>
      <label>닉네임<input required minLength="2" maxLength="30" value={nickname} onChange={event=>setNickname(event.target.value)} autoComplete="nickname"/></label>
      <div className="profileEditorActions"><button type="button" onClick={cancelEdit}><X/> 취소</button><button disabled={saving}><Save/> {saving?"저장 중…":"저장"}</button></div>
    </form>}
    {message&&<div className="profileMessage" role="status">{message}</div>}
    <button className="logout" onClick={logout}><LogOut/> 로그아웃</button>
    <h3>이번 달 나의 읽기</h3><div className="stats"><div>시작 전<b>2권</b></div><div>읽는 중<b>3권</b></div><div>읽기 완료<b>1권</b></div></div>
    <h3>나의 읽기 달력</h3><Calendar/><div className="due"><CalendarDays/><span><b>9월 12일까지</b><br/>17~19쪽 읽어주세요.</span></div>
    <h3>참여 중인 방</h3><Card r={demoRooms[0]} f={()=>setV("rooms")}/><div className="demoNotice">현재 읽기방/달력은 데모 데이터예요. 다음 버전에서 실제 계정별 데이터로 연결합니다.</div>
  </>;
}
createRoot(document.getElementById("root")).render(<App/>);
