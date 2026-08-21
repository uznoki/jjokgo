import {useState} from "react";
import {LogIn,UserRound} from "lucide-react";
import {supabase} from "../supabase";
import {joinReadingRoom} from "../services/readingRooms";

function guestError(error){
  const message=String(error?.message||"");
  if(message.includes("Anonymous sign-ins are disabled"))return "게스트 입장이 아직 열리지 않았어요. 방장에게 알려주세요.";
  if(message.includes("INVALID_INVITE_CODE"))return "초대 링크가 올바르지 않거나 방을 찾을 수 없어요.";
  if(message.includes("rate limit"))return "접속 요청이 잠시 많아요. 잠시 후 다시 시도해주세요.";
  return "게스트로 입장하지 못했어요. 잠시 후 다시 시도해주세요.";
}

export function GuestJoin({inviteCode,session,onJoined,onCancel}){
  const savedName=session?.user?.user_metadata?.nickname||"";
  const [nickname,setNickname]=useState(savedName);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function join(event){
    event.preventDefault();
    const name=nickname.trim();
    if(!name){setMessage("함께 읽을 때 사용할 이름을 입력해주세요.");return;}
    setBusy(true);
    setMessage("");
    let createdAnonymousSession=false;
    try{
      let activeSession=session;
      if(!activeSession){
        const {data,error}=await supabase.auth.signInAnonymously({options:{data:{nickname:name}}});
        if(error)throw error;
        activeSession=data.session;
        createdAnonymousSession=true;
      }else if(activeSession.user?.is_anonymous&&savedName!==name){
        const {data,error}=await supabase.auth.updateUser({data:{nickname:name}});
        if(error)throw error;
        activeSession=data.user?{...activeSession,user:data.user}:activeSession;
      }
      if(!activeSession)throw new Error("GUEST_SESSION_REQUIRED");

      const room=await joinReadingRoom(inviteCode);
      onJoined({session:activeSession,room});
    }catch(error){
      if(createdAnonymousSession)await supabase.auth.signOut().catch(()=>{});
      setMessage(guestError(error));
      setBusy(false);
    }
  }

  return <section className="auth guestJoin">
    <button className="back" onClick={onCancel}>‹ 홈으로</button>
    <div className="guestBadge">초대받은 LIVE 독서방</div>
    <h1>이름만 적고<br/>바로 함께 읽어요.</h1>
    <p>회원가입과 인증 메일 없이 오늘의 독서방에 게스트로 참여합니다.</p>
    <form onSubmit={join}>
      <label><UserRound/> 참여 이름
        <input
          required
          maxLength="30"
          autoComplete="nickname"
          value={nickname}
          onChange={event=>setNickname(event.target.value)}
          placeholder="예: 영희, 오두막"
          autoFocus
        />
      </label>
      <button className="wide" disabled={busy}>
        <LogIn/> {busy?"독서방 입장 중…":"게스트로 바로 입장"}
      </button>
    </form>
    {message&&<div className="authMsg" role="status">{message}</div>}
    <small className="authNote">게스트 계정은 이 기기에서만 유지되며 정식 회원 기록과 연결되지 않아요.</small>
  </section>;
}
