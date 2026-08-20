import {useCallback,useEffect,useRef,useState} from "react";
import {RemoteAudio} from "./RemoteAudio";
import {useLiveKitRoom} from "../hooks/useLiveKitRoom";
import {useLiveRoom} from "../hooks/useLiveRoom";

const TOTAL_PAGES=27;

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
  const [page,setPage]=useState(17);
  const pageRef=useRef(17);
  const audioElementsRef=useRef(new Map());
  const [blockedAudioIds,setBlockedAudioIds]=useState([]);

  const onRemotePage=useCallback(next=>{
    pageRef.current=next;
    setPage(next);
  },[]);

  const displayName=session?.user?.user_metadata?.nickname||session?.user?.email?.split("@")[0]||"쪽GO 참여자";
  const liveKitEnabled=import.meta.env.VITE_LIVEKIT_ENABLED==="true";
  const peerLive=useLiveRoom({roomId:room?.id,displayName,initialPage:17,onRemotePage,enabled:!liveKitEnabled});
  const liveKitLive=useLiveKitRoom({roomId:room?.id,displayName,session,initialPage:17,onRemotePage,enabled:liveKitEnabled});
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
    const safePage=Math.max(1,Math.min(TOTAL_PAGES,next));
    pageRef.current=safePage;
    setPage(safePage);
    live.broadcastPage(safePage);
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

  return <>
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

    <div className="demoNotice">📖 지금 함께 읽는 페이지 · {page}쪽</div>

    <section className="readingPage">
      <div className="readingBookTitle">{room.books?.title||"함께 읽는 책"}</div>
      <div className="pageNumber">{page}</div>
      <div className="readingText">
        <p>이곳에서 모두가 같은 책을 보며 함께 읽어요.</p>
        <small>실제 책 콘텐츠는 적법하게 제공되는 방식으로 연결합니다.</small>
      </div>
      <div className="pageCounter">{page} / {TOTAL_PAGES}쪽</div>
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
      <button className={`wide liveButton ${live.micState}`} onClick={live.toggleMic} disabled={isConnecting||micBusy}>
        {micBusy?"마이크 권한 확인 중…":live.micState==="live"?"🔴 내 마이크 음소거":live.micState==="muted"?"🎙 음소거 해제":"🎙 LIVE 함께 읽기"}
      </button>
      <button className="secondary" onClick={()=>changePage(pageRef.current+1)} disabled={page>=TOTAL_PAGES}>다음 쪽 →</button>
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
  </>;
}
