import React,{useEffect,useState}from"react";
import{createRoot}from"react-dom/client";
import{Home,Users,Mic,BookOpen,UserRound,Lock,ChevronRight,CalendarDays,LogOut,Mail,KeyRound}from"lucide-react";
import{supabase}from"./supabase";
import{LiveRoom}from"./components/LiveRoom";
import"./style.css";
const demoRooms=[{id:null,name:"은호네 독서모임",books:{title:"어린 왕자"},progress:43,range:"17~19쪽",is_private:true},{id:null,name:"가족 책방",books:{title:"데미안"},progress:28,range:"4~6쪽",is_private:true},{id:null,name:"성당 천사부",books:{title:"아낌없이 주는 나무"},progress:67,range:"10~12쪽",is_private:true}];
function App(){const[v,setV]=useState("home"),[room,setRoom]=useState(null),[session,setSession]=useState(null),[loading,setLoading]=useState(true);
useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const{data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>subscription.unsubscribe()},[]);
const openAuth=()=>setV("auth");const openRooms=()=>setV(session?"rooms":"auth");return <div className="app"><main><header><b onClick={()=>setV("home")}>쪽<span>GO</span></b><button className="headAccount" onClick={()=>setV(session?"my":"auth")}><UserRound/>{session?"MY":"로그인"}</button></header>{loading?<div className="loading">쪽GO 불러오는 중…</div>:<>{v=="home"&&<HomeP setV={setV} session={session} openAuth={openAuth}/>} {v=="createRoom"&&<CreateRoom setV={setV} session={session}/>} {v=="rooms"&&<Rooms setV={setV} open={r=>{setRoom(r);setV("room")}} session={session} openAuth={openAuth}/>} {v=="room"&&<LiveRoom room={room} setView={setV} session={session}/>} {v=="my"&&(session?<My session={session} setV={setV}/>:<Auth setV={setV}/>)} {v=="auth"&&<Auth setV={setV}/>}</>}</main>{v!=="auth"&&<nav><N i={<Home/>} t="홈" f={()=>setV("home")}/><N i={<Users/>} t="함께 읽기방" f={openRooms}/><button className="mic" aria-label="LIVE 독서방 열기" onClick={openRooms}><Mic/></button><N i={<BookOpen/>} t="내 서재"/><N i={<UserRound/>} t="MY 쪽GO" f={()=>setV(session?"my":"auth")}/></nav>}</div>}
const N=({i,t,f})=><button onClick={f}>{i}<small>{t}</small></button>;
function Auth({setV}){const[mode,setMode]=useState("login"),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[nickname,setNickname]=useState(""),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
async function submit(e){e.preventDefault();setBusy(true);setMsg("");try{if(mode==="signup"){const{data,error}=await supabase.auth.signUp({email,password,options:{data:{nickname},emailRedirectTo:window.location.origin}});if(error)throw error;if(data.session){setMsg("가입 완료! 로그인되었습니다.");setTimeout(()=>setV("my"),600)}else setMsg("가입 완료! 이메일로 보낸 인증 링크를 눌러주세요.")}else{const{error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;setV("my")}}catch(err){setMsg(translateAuthError(err.message))}finally{setBusy(false)}}
return <section className="auth"><button className="back" onClick={()=>setV("home")}>‹ 홈으로</button><div className="authBrand">쪽<span>GO</span></div><h1>{mode==="login"?"다시 만나 반가워요":"쪽GO를 시작해요"}</h1><p>{mode==="login"?"로그인하고 함께 읽던 책을 이어가세요.":"한 쪽씩, 함께 읽는 계정을 만들어보세요."}</p><div className="authTabs"><button className={mode==="login"?"active":""} onClick={()=>{setMode("login");setMsg("")}}>로그인</button><button className={mode==="signup"?"active":""} onClick={()=>{setMode("signup");setMsg("")}}>회원가입</button></div><form onSubmit={submit}>{mode==="signup"&&<label>닉네임<input required value={nickname} onChange={e=>setNickname(e.target.value)} placeholder="쪽GO에서 사용할 이름"/></label>}<label><Mail/> 이메일<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label><label><KeyRound/> 비밀번호<input required minLength="6" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="6자 이상"/></label><button className="wide" disabled={busy}>{busy?"처리 중…":mode==="login"?"로그인":"회원가입"}</button></form>{msg&&<div className="authMsg">{msg}</div>}<small className="authNote">회원가입 시 입력한 이메일로 인증 메일이 발송됩니다.</small></section>}
function translateAuthError(m=""){if(m.includes("Invalid login credentials"))return"이메일 또는 비밀번호를 확인해주세요.";if(m.includes("already registered"))return"이미 가입된 이메일이에요.";if(m.includes("Password should"))return"비밀번호는 6자 이상으로 입력해주세요.";return m}
function HomeP({setV,session,openAuth}){const openRooms=()=>session?setV("rooms"):openAuth();return <><section className="hero"><div><h1>한 쪽씩,<br/>함께 GO.</h1><p>오늘, 당신의 목소리로<br/>한 쪽을 이어주세요.</p></div><div>📖🌿</div></section>{!session&&<button className="welcome" onClick={openAuth}><UserRound/><span><b>쪽GO에 로그인해보세요</b><small>내 읽기 기록과 함께 읽기방을 이어갈 수 있어요.</small></span><ChevronRight/></button>}<div className="quick"><button className="green" onClick={openRooms}><Mic/><b>LIVE 함께 읽기</b><small>실시간으로 목소리 나누기</small></button><button onClick={openRooms}><Users/><b>함께 읽기방 만들기</b><small>우리만의 책 만들기</small></button></div><button className="join" onClick={openRooms}><Lock/> 초대 코드로 방 입장하기</button><h3>지금 가장 많이 읽히는 책</h3><div className="books">{[["어린 왕자",73],["데미안",58],["아낌없이 주는 나무",67]].map((x,i)=><div key={i}><div className="cover">📖</div><b>{x[0]}</b><strong>{x[1]}%</strong><Progress p={x[1]}/></div>)}</div><h3>나의 읽기 현황</h3><Calendar/><h3>참여 중인 방</h3><Card r={demoRooms[0]} f={openRooms}/></>}
function Progress({p}){return <div className="bar"><i style={{width:p+"%"}}/></div>}
function Card({r,f}){return <button className="card" onClick={f}><div className="thumb">📖</div><span><b>{r.name} {r.is_private?"🔒":""}</b><small>{r.books?.title} · 7명 참여</small><Progress p={r.progress||0}/></span><strong>{r.progress||0}%</strong><ChevronRight/></button>}
function Rooms({setV,open,session,openAuth}){
const[myRooms,setMyRooms]=useState([]);
const[busy,setBusy]=useState(true);

useEffect(()=>{
  async function loadRooms(){
    if(!session){setBusy(false);return;}
    const{data,error}=await supabase
      .from("reading_rooms")
      .select("*, books(title)")
      .eq("owner_id",session.user.id)
      .order("created_at",{ascending:false});

    if(!error)setMyRooms(data||[]);
    setBusy(false);
  }
  loadRooms();
},[session]);

return <>
  <h1>함께 읽기방</h1>
  <div className="tabs">참여 중인 방　　내가 만든 방</div>

  {busy&&<div className="loading">읽기방 불러오는 중…</div>}

  {!busy&&myRooms.length===0&&
    <div className="demoNotice">
      아직 만든 읽기방이 없어요.
    </div>
  }

  {myRooms.map(r=>
    <button className="card" key={r.id} onClick={()=>open(r)}>
      <div className="thumb">📖</div>
      <span>
        <b>{r.name} {r.is_private?"🔒":""}</b>
        <small>내가 만든 읽기방</small>
      </span>
      <ChevronRight/>
    </button>
  )}

  <button className="wide" onClick={()=>session?setV("createRoom"):openAuth()}>
    + 함께 읽기방 만들기
  </button>

  <button className="join" onClick={()=>session?alert("다음 단계에서 초대코드를 실제 DB와 연결해요."):openAuth()}>
    <Lock/> 초대 코드로 방 입장하기
  </button>
</>
}

function Calendar(){return <div className="cal">{["월","화","수","목","금","토","일"].map(x=><b key={x}>{x}</b>)}{[11,12,13,14,15,16,17].map((x,i)=><span key={x} className={i==1?"done":i==4?"doing":""}>{x}</span>)}</div>}function My({session,setV}){const nickname=session.user.user_metadata?.nickname||session.user.email?.split("@")[0]||"쪽GO 사용자";async function logout(){await supabase.auth.signOut();setV("home")}return <><section className="profileHero"><div className="avatar"><UserRound/></div><div><small>MY 쪽GO</small><h1>{nickname}님</h1><p>{session.user.email}</p></div></section><button className="logout" onClick={logout}><LogOut/> 로그아웃</button><h3>이번 달 나의 읽기</h3><div className="stats"><div>시작 전<b>2권</b></div><div>읽는 중<b>3권</b></div><div>읽기 완료<b>1권</b></div></div><h3>나의 읽기 달력</h3><Calendar/><div className="due"><CalendarDays/><span><b>9월 12일까지</b><br/>17~19쪽 읽어주세요.</span></div><h3>참여 중인 방</h3><Card r={demoRooms[0]} f={()=>setV("rooms")}/><div className="demoNotice">현재 읽기방/달력은 데모 데이터예요. 다음 버전에서 실제 계정별 데이터로 연결합니다.</div></>}
createRoot(document.getElementById("root")).render(<App/>);

function CreateRoom({setV,session}){
  const[name,setName]=useState("");
  const[book,setBook]=useState("");
  const[busy,setBusy]=useState(false);
  const[msg,setMsg]=useState("");

  async function createRoom(e){
    e.preventDefault();
    if(!session)return;
    setBusy(true);
    setMsg("");

    const{data:bookData,error:bookError}=await supabase
      .from("books")
      .select("id,title")
      .eq("title",book.trim())
      .maybeSingle();

    if(bookError || !bookData){
      setMsg("책 조회 오류: "+(bookError?.message || "책 데이터 없음"));
      setBusy(false);
      return;
    }

    const{data,error}=await supabase
      .from("reading_rooms")
      .insert({
        name:name,
        book_id:bookData.id,
        owner_id:session.user.id,
        is_private:true
      })
      .select()
      .single();

    if(error){
      setMsg("방을 만들지 못했어요: "+error.message);
      setBusy(false);
      return;
    }

    setMsg("방이 만들어졌어요!");
    setBusy(false);
    setTimeout(()=>setV("rooms"),700);
  }

  return <section className="auth">
    <button className="back" onClick={()=>setV("rooms")}>‹ 함께 읽기방</button>
    <div className="authBrand">쪽<span>GO</span></div>
    <h1>함께 읽기방 만들기</h1>
    <p>같이 읽을 사람들과 새로운 방을 만들어보세요.</p>

    <form onSubmit={createRoom}>
      <label>
        방 이름
        <input
          required
          value={name}
          onChange={e=>setName(e.target.value)}
          placeholder="예: 우리 가족 책방"
        />
      </label>

      <label>
        읽을 책
        <input
          value={book}
          onChange={e=>setBook(e.target.value)}
          placeholder="예: 어린 왕자"
        />
      </label>

      <button className="wide" disabled={busy}>
        {busy?"만드는 중…":"방 만들기"}
      </button>
 
   </form>

    {msg&&<div className="authMsg">{msg}</div>}
  </section>
}
