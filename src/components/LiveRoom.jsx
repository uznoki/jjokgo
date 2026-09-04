import {useCallback,useEffect,useRef,useState} from "react";
import {CheckCircle2,Headphones,Mic,Pencil} from "lucide-react";
import {supabase} from "../supabase";
import {RemoteAudio} from "./RemoteAudio";
import {RecordingStudio} from "./RecordingStudio";
import {useLiveKitRoom} from "../hooks/useLiveKitRoom";
import {useLiveRoom} from "../hooks/useLiveRoom";
import {recordReadingActivity} from "../services/readingProgress";

function participantStatus(participant){
  if(participant.connectionState==="failed")return "연결 실패";
  if(participant.connectionState!=="connected")return "연결 중";
  if(participant.micState==="live")return "🎙 LIVE";
  if(participant.micState==="muted")return "🔇 음소거";
  if(participant.micState==="requesting")return "권한 확인 중";
  if(participant.micState==="error")return "마이크 오류";
  return "듣는 중";
}

function RoomPrejoin({room,onBack,onEnter}){
  const [micCheck,setMicCheck]=useState("idle");
  const [message,setMessage]=useState("입장 전 마이크를 확인하거나, 듣기 모드로 조용히 들어갈 수 있어요.");

  async function enterWithMic(){
    if(!navigator.mediaDevices?.getUserMedia){
      setMicCheck("error");
      setMessage("이 브라우저에서는 마이크 확인을 지원하지 않아요. 듣기 모드로 입장한 뒤 다시 시도해주세요.");
      return;
    }
    setMicCheck("checking");
    setMessage("브라우저의 마이크 사용 요청을 확인해주세요.");
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      stream.getTracks().forEach(track=>track.stop());
      setMicCheck("ready");
      setMessage("마이크 확인 완료. LIVE 방에 입장합니다.");
      onEnter(true);
    }catch(error){
      setMicCheck("error");
      setMessage(error?.name==="NotAllowedError"?"마이크 권한이 꺼져 있어요. 브라우저 설정에서 허용하거나 듣기 모드로 입장해주세요.":"마이크를 확인하지 못했어요. 듣기 모드로 입장한 뒤 다시 시도해주세요.");
    }
  }

  return <section className="roomPrejoin" aria-labelledby="prejoin-title">
    <button className="back" onClick={onBack}>‹ 읽기방으로</button>
    <div className="prejoinCard">
      <small>BEFORE YOU JOIN</small>
      <h1 id="prejoin-title">목소리를 준비하고<br/>읽기방에 들어가요.</h1>
      <p>{room?.name||"쪽GO PAGE"}</p>
      <div className={`prejoinStatus ${micCheck}`} role="status" aria-live="polite">
        {micCheck==="ready"?<CheckCircle2/>:<Mic/>}<span><b>{micCheck==="checking"?"마이크 확인 중":micCheck==="ready"?"마이크 사용 가능":micCheck==="error"?"마이크 확인 필요":"입장 방식을 선택하세요"}</b><small>{message}</small></span>
      </div>
      <div className="prejoinActions">
        <button className="prejoinListen" onClick={()=>onEnter(false)}><Headphones/><span><b>듣기 모드로 입장</b><small>마이크를 켜지 않고 참여</small></span></button>
        <button className="prejoinMic" onClick={enterWithMic} disabled={micCheck==="checking"}><Mic/><span><b>{micCheck==="checking"?"확인 중…":"마이크 켜고 입장"}</b><small>권한과 입력 장치 먼저 확인</small></span></button>
      </div>
      <em>입장 후에도 언제든 마이크를 켜거나 끌 수 있어요.</em>
    </div>
  </section>;
}

export function LiveRoom(props){
  const [entryMode,setEntryMode]=useState(null);
  if(!props.room?.id)return <><button className="back" onClick={()=>props.setView("rooms")}>‹ 읽기방으로</button><div className="liveMessage error">유효한 읽기방을 찾지 못했어요. 읽기방 목록에서 다시 선택해주세요.</div></>;
  if(entryMode===null)return <RoomPrejoin room={props.room} onBack={()=>props.setView("rooms")} onEnter={setEntryMode}/>;
  return <ConnectedLiveRoom {...props} startWithMic={entryMode}/>;
}

function ConnectedLiveRoom({room,setView,session,startWithMic=false}){
  const initialPage=Math.max(1,Number(room?.current_page||room?.reading_start_page)||1);
  const [page,setPage]=useState(initialPage);
  const pageRef=useRef(initialPage);
  const [pageInput,setPageInput]=useState(String(initialPage));
  const [plan,setPlan]=useState({
    totalPages:Number(room?.total_pages)||null,
    startPage:Math.max(1,Number(room?.reading_start_page)||1),
    endPage:Number(room?.reading_end_page)||null
  });
  const [planDraft,setPlanDraft]=useState({totalPages:room?.total_pages||"",startPage:room?.reading_start_page||1,endPage:room?.reading_end_page||""});
  const [editingPlan,setEditingPlan]=useState(false);
  const [pageMessage,setPageMessage]=useState("");
  const [savingPlan,setSavingPlan]=useState(false);
  const pageSaveChainRef=useRef(Promise.resolve());
  const audioElementsRef=useRef(new Map());
  const [blockedAudioIds,setBlockedAudioIds]=useState([]);
  const initialMicStartedRef=useRef(false);
  const sharedSessionRecordedRef=useRef(false);

  const maximumPage=plan.totalPages||20000;
  const isOwner=room?.owner_id===session?.user?.id&&!session?.user?.is_anonymous;

  const onRemotePage=useCallback(next=>{
    const safePage=Math.max(1,Math.min(maximumPage,Number(next)||1));
    pageRef.current=safePage;
    setPage(safePage);
    setPageInput(String(safePage));
  },[maximumPage]);

  const displayName=session?.user?.user_metadata?.nickname||session?.user?.email?.split("@")[0]||"쪽GO 참여자";
  const liveKitEnabled=import.meta.env.VITE_LIVEKIT_ENABLED==="true";
  const peerLive=useLiveRoom({roomId:room?.id,displayName,initialPage,onRemotePage,enabled:!liveKitEnabled});
  const liveKitLive=useLiveKitRoom({roomId:room?.id,session,initialPage,onRemotePage,enabled:liveKitEnabled});
  const live=liveKitEnabled?liveKitLive:peerLive;

  useEffect(()=>{
    if(!startWithMic||initialMicStartedRef.current||live.channelState!=="connected")return;
    initialMicStartedRef.current=true;
    live.toggleMic();
  },[startWithMic,live.channelState,live.toggleMic]);

  const onAudioElement=useCallback((id,element)=>{
    if(element)audioElementsRef.current.set(id,element);
    else audioElementsRef.current.delete(id);
  },[]);
  const onAudioBlocked=useCallback(id=>{
    setBlockedAudioIds(prev=>prev.includes(id)?prev:[...prev,id]);
  },[]);
  const onAudioPlaying=useCallback(id=>{
    setBlockedAudioIds(prev=>prev.filter(item=>item!==id));
  },[]);

  const enableRemoteAudio=useCallback(async()=>{
    await live.startAudio?.();
    const results=await Promise.allSettled(
      [...audioElementsRef.current.entries()].map(async([id,audio])=>{
        await audio.play();
        onAudioPlaying(id);
      })
    );
    if(results.some(result=>result.status==="rejected")){
      setBlockedAudioIds(prev=>prev.length?prev:["unknown"]);
    }
  },[live.startAudio,onAudioPlaying]);

  useEffect(()=>{
    const resumeAudio=()=>{
      if(document.visibilityState==="visible")enableRemoteAudio();
    };
    document.addEventListener("visibilitychange",resumeAudio);
    window.addEventListener("pageshow",resumeAudio);
    window.addEventListener("online",resumeAudio);
    return ()=>{
      document.removeEventListener("visibilitychange",resumeAudio);
      window.removeEventListener("pageshow",resumeAudio);
      window.removeEventListener("online",resumeAudio);
    };
  },[enableRemoteAudio]);

  function changePage(next){
    const previousPage=pageRef.current;
    const safePage=Math.max(1,Math.min(maximumPage,Number(next)||1));
    pageRef.current=safePage;
    setPage(safePage);
    setPageInput(String(safePage));
    setPageMessage("");
    live.broadcastPage(safePage);
    if(live.micState==="live"&&safePage>previousPage){
      recordReadingActivity(session,{pagesNarrated:Math.min(20,safePage-previousPage)},`page:${room.id}:${safePage}:${new Date().toISOString().slice(0,10)}`);
      if(plan.totalPages&&safePage>=plan.totalPages&&previousPage<plan.totalPages)recordReadingActivity(session,{completedBooks:1},`book-complete:${room.books?.id||room.id}`);
    }
    pageSaveChainRef.current=pageSaveChainRef.current
      .catch(()=>{})
      .then(async()=>{
        const{error}=await supabase.rpc("set_reading_room_page",{p_room_id:String(room.id),p_page:safePage});
        if(error)throw error;
      })
      .catch(error=>{
        console.error("Page persistence failed",error);
        setPageMessage("현재 쪽 저장이 잠시 지연되고 있어요. 음성과 실시간 페이지 공유는 계속 사용할 수 있어요.");
      });
  }

  function jumpToPage(event){event.preventDefault();changePage(pageInput)}

  async function savePlan(event){
    event.preventDefault();
    const total=planDraft.totalPages===""?null:Number(planDraft.totalPages);
    const start=Number(planDraft.startPage);
    const end=Number(planDraft.endPage);
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start){setPageMessage("오늘 읽을 시작 쪽과 마지막 쪽을 확인해주세요.");return;}
    if(total!==null&&(!Number.isInteger(total)||total<end||total>20000)){setPageMessage("책 전체 쪽수는 오늘 읽을 마지막 쪽보다 크거나 같아야 해요.");return;}
    setSavingPlan(true);setPageMessage("");
    const{data,error}=await supabase.rpc("update_reading_room_plan",{p_room_id:String(room.id),p_total_pages:total,p_start_page:start,p_end_page:end});
    if(error){console.error("Reading plan update failed",error);setPageMessage("읽기 범위를 저장하지 못했어요. 잠시 후 다시 시도해주세요.");setSavingPlan(false);return;}
    const updated=Array.isArray(data)?data[0]:data;
    const nextPage=Math.max(1,Number(updated?.current_page)||pageRef.current);
    setPlan({totalPages:total,startPage:start,endPage:end});
    setPage(nextPage);pageRef.current=nextPage;setPageInput(String(nextPage));live.broadcastPage(nextPage);
    setEditingPlan(false);setSavingPlan(false);setPageMessage("읽기 범위를 저장했어요.");
  }

  const connectedCount=live.participants.filter(item=>item.connectionState==="connected").length;
  const isConnecting=live.channelState==="connecting";
  const micBusy=live.micState==="requesting";

  useEffect(()=>{
    if(connectedCount<2||sharedSessionRecordedRef.current)return;
    sharedSessionRecordedRef.current=true;
    recordReadingActivity(session,{sharedSessions:1},`together:${room.id}:${new Date().toISOString().slice(0,10)}`);
  },[connectedCount,room.id,session]);

  return <section className="liveRoomView">
    <button className="back" onClick={()=>setView("rooms")}>‹ 읽기방으로</button>

    <section className="room">
      <div className="thumb big">📖</div>
      <div>
        <h2>{room.name} {room.is_private?"🔒":""}</h2>
        <b>{room.books?.title||"책 정보"}</b>
        <p>쪽GO PAGE · 🎙 LIVE · {connectedCount}명 연결</p>
      </div>
    </section>

    <div className={`liveConnection ${live.channelState}`} role="status" aria-live="polite">
      <span className="liveConnectionDot"/>
      <div>
        <b>{live.channelState==="connected"?"LIVE 독서방 연결됨":isConnecting?"LIVE 독서방 연결 중":"LIVE 연결 확인 필요"}</b>
        <small>{live.message||"같은 방의 참여자와 페이지와 목소리를 실시간으로 나눌 수 있어요."}</small>
      </div>
    </div>

    {blockedAudioIds.length>0&&
      <button className="audioUnlock" onClick={enableRemoteAudio}>
        🔊 다른 참여자의 소리 재생하기
        <small>모바일 브라우저에서는 한 번 눌러야 소리가 시작될 수 있어요.</small>
      </button>
    }

    <section className="readingPlanSummary">
      <div><small>TODAY'S READING</small><b>오늘 {plan.startPage}–{plan.endPage||"미정"}쪽</b><span>현재 {page}쪽 · 전체 {plan.totalPages?`${plan.totalPages}쪽`:"쪽수 미설정"}</span>{plan.endPage&&page>=plan.endPage&&<em>✓ 오늘 목표 완료</em>}</div>
      {isOwner&&<button type="button" onClick={()=>setEditingPlan(value=>!value)}><Pencil/> 읽기 범위 설정</button>}
      <div className="todayProgress" aria-label="오늘 읽기 진행률"><i style={{width:`${plan.endPage?Math.max(0,Math.min(100,((page-plan.startPage+1)/Math.max(1,plan.endPage-plan.startPage+1))*100)):0}%`}}/></div>
    </section>

    {editingPlan&&<form className="readingPlanEditor" onSubmit={savePlan}>
      <label>책 전체 쪽수 <small>선택</small><input type="number" min="1" max="20000" value={planDraft.totalPages} onChange={event=>setPlanDraft({...planDraft,totalPages:event.target.value})}/></label>
      <label>오늘 시작 쪽<input required type="number" min="1" max="20000" value={planDraft.startPage} onChange={event=>setPlanDraft({...planDraft,startPage:event.target.value})}/></label>
      <label>오늘 마지막 쪽<input required type="number" min={planDraft.startPage||1} max={planDraft.totalPages||20000} value={planDraft.endPage} onChange={event=>setPlanDraft({...planDraft,endPage:event.target.value})}/></label>
      <button disabled={savingPlan}>{savingPlan?"저장 중…":"범위 저장"}</button>
    </form>}
    {pageMessage&&<div className="pageSyncMessage" role="status">{pageMessage}</div>}

    <section className="readingPage">
      <div className="readingBookTitle">{room.books?.title||"함께 읽는 책"}</div>
      <div className="pageNumber">{page}</div>
      <div className="readingText">
        <p>이곳에서 모두가 같은 책을 보며 함께 읽어요.</p>
        <small>실제 책 콘텐츠는 적법하게 제공되는 방식으로 연결합니다.</small>
      </div>
      <form className="pageJump" onSubmit={jumpToPage}><label>현재 쪽<input type="number" inputMode="numeric" min="1" max={maximumPage} value={pageInput} onChange={event=>setPageInput(event.target.value)}/></label><button>이동</button></form>
      <div className="pageCounter">{page} / {plan.totalPages||"—"}쪽</div>
    </section>

    <h3>지금 함께 읽는 사람</h3>
    <div className="readers">
      {live.participants.map(participant=>
        <div className={`reader ${participant.connectionState} ${participant.micState}`} key={participant.id}>
          <span className="readerDot">●</span>
          <span className="readerInfo">
            <b>{participant.name}</b>
            <small>{participantStatus(participant)}</small>
          </span>
        </div>
      )}
      {live.participants.length===0&&<div className="emptyReaders">참여자 정보를 불러오는 중이에요…</div>}
    </div>

    <div className="readingActions">
      <button className="secondary" onClick={()=>changePage(pageRef.current-1)} disabled={page<=1}>← 이전 쪽</button>
      <button className={`wide liveButton ${live.micState}`} onClick={live.toggleMic} disabled={isConnecting||micBusy} aria-pressed={live.micState==="live"}>
        {micBusy?"마이크 권한 확인 중…":live.micState==="live"?"🔴 내 마이크 음소거":live.micState==="muted"?"🎙 음소거 해제":"🎙 PAGE LIVE 시작"}
      </button>
      <button className="secondary" onClick={()=>changePage(pageRef.current+1)} disabled={page>=maximumPage}>다음 쪽 →</button>
    </div>

    <div className={`liveHelp ${live.micState}`} aria-live="polite">
      {live.micState==="live"&&"🔴 내 목소리가 같은 방의 참여자에게 실시간으로 전달되고 있어요."}
      {live.micState==="muted"&&"🔇 내 마이크는 음소거 상태예요. 다른 참여자의 목소리는 계속 들을 수 있어요."}
      {live.micState==="requesting"&&"브라우저의 마이크 사용 요청을 확인해주세요."}
      {live.micState==="error"&&live.message}
      {live.micState==="idle"&&"🎧 PAGE LIVE 시작을 누르면 마이크가 켜지고 서로의 목소리를 들을 수 있어요."}
    </div>

    <RecordingStudio roomName={room.name} bookTitle={room.books?.title||"함께 읽는 책"} variant="page" session={session}/>

    {live.remoteStreams.map(item=><RemoteAudio
      key={item.id}
      id={item.id}
      stream={item.stream}
      onBlocked={onAudioBlocked}
      onPlaying={onAudioPlaying}
      onElement={onAudioElement}
    />)}
  </section>;
}
