import {useCallback,useEffect,useRef,useState} from "react";
import {Pencil} from "lucide-react";
import {supabase} from "../supabase";
import {RemoteAudio} from "./RemoteAudio";
import {useLiveKitRoom} from "../hooks/useLiveKitRoom";
import {useLiveRoom} from "../hooks/useLiveRoom";

function participantStatus(participant){
  if(participant.connectionState==="failed")return "연결 실패";
  if(participant.connectionState!=="connected")return "연결 중";
  if(participant.micState==="live")return "🎙 LIVE";
  if(participant.micState==="muted")return "🔇 음소거";
  if(participant.micState==="requesting")return "권한 확인 중";
  if(participant.micState==="error")return "마이크 오류";
  return "듣는 중";
}

export function LiveRoom({room,setView,session}){
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
    const safePage=Math.max(1,Math.min(maximumPage,Number(next)||1));
    pageRef.current=safePage;
    setPage(safePage);
    setPageInput(String(safePage));
    setPageMessage("");
    live.broadcastPage(safePage);
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

  if(!room?.id){
    return <>
      <button className="back" onClick={()=>setView("rooms")}>‹ 읽기방으로</button>
      <div className="liveMessage error">유효한 읽기방을 찾지 못했어요. 읽기방 목록에서 다시 선택해주세요.</div>
    </>;
  }

  const connectedCount=live.participants.filter(item=>item.connectionState==="connected").length;
  const isConnecting=live.channelState==="connecting";
  const micBusy=live.micState==="requesting";

  return <section className="liveRoomView">
    <button className="back" onClick={()=>setView("rooms")}>‹ 읽기방으로</button>

    <section className="room">
      <div className="thumb big">📖</div>
      <div>
        <h2>{room.name} {room.is_private?"🔒":""}</h2>
        <b>{room.books?.title||"책 정보"}</b>
        <p>🎙 LIVE 함께 읽기 · {connectedCount}명 연결</p>
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
        {micBusy?"마이크 권한 확인 중…":live.micState==="live"?"🔴 내 마이크 음소거":live.micState==="muted"?"🎙 음소거 해제":"🎙 LIVE 함께 읽기"}
      </button>
      <button className="secondary" onClick={()=>changePage(pageRef.current+1)} disabled={page>=maximumPage}>다음 쪽 →</button>
    </div>

    <div className={`liveHelp ${live.micState}`} aria-live="polite">
      {live.micState==="live"&&"🔴 내 목소리가 같은 방의 참여자에게 실시간으로 전달되고 있어요."}
      {live.micState==="muted"&&"🔇 내 마이크는 음소거 상태예요. 다른 참여자의 목소리는 계속 들을 수 있어요."}
      {live.micState==="requesting"&&"브라우저의 마이크 사용 요청을 확인해주세요."}
      {live.micState==="error"&&live.message}
      {live.micState==="idle"&&"🎧 LIVE 함께 읽기를 누르면 마이크가 켜지고 서로의 목소리를 들을 수 있어요."}
    </div>

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
