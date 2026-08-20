import {useCallback,useEffect,useRef,useState} from "react";
import {supabase} from "../supabase";

const MICROPHONE_SOURCE="microphone";
const LIVEKIT_EVENTS={
  participantConnected:"participantConnected",
  participantDisconnected:"participantDisconnected",
  trackSubscribed:"trackSubscribed",
  trackUnsubscribed:"trackUnsubscribed",
  trackMuted:"trackMuted",
  trackUnmuted:"trackUnmuted",
  reconnecting:"reconnecting",
  signalReconnecting:"signalReconnecting",
  reconnected:"reconnected",
  disconnected:"disconnected",
  audioPlaybackChanged:"audioPlaybackChanged",
  mediaDevicesError:"mediaDevicesError"
};

function connectionMessage(error){
  const message=String(error?.message||"");
  if(message.includes("LIVEKIT_NOT_CONFIGURED"))return "LIVE 음성 서버 설정이 아직 완료되지 않았어요.";
  if(message.includes("ROOM_ACCESS_DENIED"))return "이 읽기방의 참여자만 LIVE 음성을 사용할 수 있어요.";
  if(message.includes("INVALID_SESSION")||message.includes("AUTH_REQUIRED"))return "로그인 시간이 만료됐어요. 다시 로그인해주세요.";
  return "LIVE 음성 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.";
}

function microphoneMessage(error){
  if(error?.name==="NotAllowedError"||error?.name==="SecurityError")return "마이크 권한이 꺼져 있어요. 브라우저 설정에서 허용해주세요.";
  if(error?.name==="NotFoundError")return "사용할 수 있는 마이크를 찾지 못했어요.";
  return "마이크를 시작하지 못했어요. 브라우저의 마이크 설정을 확인해주세요.";
}

function makePagePeerId(){
  return globalThis.crypto?.randomUUID?.()||`${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function useLiveKitRoom({roomId,displayName,session,initialPage=17,onRemotePage,enabled=false}){
  const roomRef=useRef(null);
  const channelRef=useRef(null);
  const pagePeerIdRef=useRef(makePagePeerId());
  const pageRef=useRef(initialPage);
  const pageSyncedRef=useRef(false);
  const activeRef=useRef(false);
  const onRemotePageRef=useRef(onRemotePage);
  const micStateRef=useRef("idle");
  const [participants,setParticipants]=useState([]);
  const [remoteStreams,setRemoteStreams]=useState([]);
  const [channelState,setChannelState]=useState(enabled?"connecting":"idle");
  const [micState,setMicState]=useState("idle");
  const [message,setMessage]=useState("");

  useEffect(()=>{onRemotePageRef.current=onRemotePage},[onRemotePage]);

  const refreshParticipants=useCallback(()=>{
    const room=roomRef.current;
    if(!room){setParticipants([]);return;}
    const local=room.localParticipant;
    const participantState=(participant,isSelf=false)=>{
      const publication=participant.getTrackPublication(MICROPHONE_SOURCE);
      return {
        id:participant.identity,
        name:isSelf?"나":participant.name||"참여자",
        isSelf,
        micState:isSelf?micStateRef.current:(publication?(publication.isMuted?"muted":"live"):"idle"),
        connectionState:"connected"
      };
    };
    setParticipants([
      participantState(local,true),
      ...[...room.remoteParticipants.values()].map(participant=>participantState(participant,false))
    ]);
  },[]);

  useEffect(()=>{
    if(!enabled||!roomId||!session?.access_token){
      setChannelState(enabled?"error":"idle");
      if(enabled&&!session?.access_token)setMessage("LIVE 독서방을 사용하려면 다시 로그인해주세요.");
      return;
    }
    activeRef.current=true;
    pageRef.current=initialPage;
    pageSyncedRef.current=false;
    setChannelState("connecting");
    micStateRef.current="idle";
    setMicState("idle");
    setMessage("LIVE 음성 서버에 연결하고 있어요…");

    let livekitRoom=null;
    let cancelled=false;
    const updateParticipants=()=>refreshParticipants();
    const addTrack=(track,_publication,participant)=>{
      if(track.kind!=="audio")return;
      const stream=new MediaStream([track.mediaStreamTrack]);
      setRemoteStreams(previous=>{
        const item={id:participant.identity,stream};
        return previous.some(entry=>entry.id===participant.identity)
          ?previous.map(entry=>entry.id===participant.identity?item:entry)
          :[...previous,item];
      });
      refreshParticipants();
    };
    const removeTrack=(_track,_publication,participant)=>{
      setRemoteStreams(previous=>previous.filter(entry=>entry.id!==participant.identity));
      refreshParticipants();
    };
    const removeParticipant=participant=>{
      setRemoteStreams(previous=>previous.filter(entry=>entry.id!==participant.identity));
      refreshParticipants();
    };
    const reconnecting=()=>{
      setChannelState("connecting");
      setMessage("네트워크가 바뀌어 LIVE 음성을 다시 연결하고 있어요…");
    };
    const reconnected=()=>{
      setChannelState("connected");
      setMessage("");
      refreshParticipants();
    };
    const disconnected=()=>{
      if(!activeRef.current)return;
      setChannelState("error");
      setMessage("LIVE 음성 연결이 종료됐어요. 방을 다시 열어주세요.");
    };
    const audioPlaybackChanged=()=>{
      if(!livekitRoom.canPlaybackAudio)setMessage("🔊 소리를 재생하려면 화면의 소리 재생 버튼을 눌러주세요.");
    };
    const mediaError=error=>{
      micStateRef.current="error";
      setMicState("error");
      setMessage(microphoneMessage(error));
    };

    const pageChannel=supabase.channel(`livekit-page-${roomId}`,{
      config:{broadcast:{self:false},presence:{key:pagePeerIdRef.current}}
    });
    channelRef.current=pageChannel;
    const sendPage=(event,payload)=>pageChannel.send({
      type:"broadcast",event,payload:{...payload,from:pagePeerIdRef.current}
    });
    pageChannel
      .on("broadcast",{event:"page-request"},({payload})=>{
        if(payload.from===pagePeerIdRef.current)return;
        const ids=Object.values(pageChannel.presenceState()).flat().map(item=>item.peerId).concat(pagePeerIdRef.current).sort();
        if(ids[0]===pagePeerIdRef.current)sendPage("page-state",{to:payload.from,page:pageRef.current}).catch(console.error);
      })
      .on("broadcast",{event:"page-state"},({payload})=>{
        if(payload.from===pagePeerIdRef.current||(payload.to&&payload.to!==pagePeerIdRef.current))return;
        const next=Number(payload.page);
        if(payload.to&&pageSyncedRef.current)return;
        if(Number.isFinite(next)){
          pageSyncedRef.current=true;
          pageRef.current=next;
          onRemotePageRef.current?.(next);
        }
      })
      .subscribe(async status=>{
        if(status==="SUBSCRIBED"){
          await pageChannel.track({peerId:pagePeerIdRef.current});
          await sendPage("page-request",{}).catch(console.error);
        }
      });

    (async()=>{
      try{
        const {Room}=await import("livekit-client");
        if(cancelled)return;
        livekitRoom=new Room({adaptiveStream:true,dynacast:true,disconnectOnPageLeave:true});
        roomRef.current=livekitRoom;
        livekitRoom
          .on(LIVEKIT_EVENTS.participantConnected,updateParticipants)
          .on(LIVEKIT_EVENTS.participantDisconnected,removeParticipant)
          .on(LIVEKIT_EVENTS.trackSubscribed,addTrack)
          .on(LIVEKIT_EVENTS.trackUnsubscribed,removeTrack)
          .on(LIVEKIT_EVENTS.trackMuted,updateParticipants)
          .on(LIVEKIT_EVENTS.trackUnmuted,updateParticipants)
          .on(LIVEKIT_EVENTS.reconnecting,reconnecting)
          .on(LIVEKIT_EVENTS.signalReconnecting,reconnecting)
          .on(LIVEKIT_EVENTS.reconnected,reconnected)
          .on(LIVEKIT_EVENTS.disconnected,disconnected)
          .on(LIVEKIT_EVENTS.audioPlaybackChanged,audioPlaybackChanged)
          .on(LIVEKIT_EVENTS.mediaDevicesError,mediaError);
        const endpoint=import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT||"/api/livekit-token";
        const response=await fetch(endpoint,{
          method:"POST",
          headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
          body:JSON.stringify({roomId:String(roomId),displayName,connectionId:pagePeerIdRef.current})
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||`LIVEKIT_TOKEN_${response.status}`);
        await livekitRoom.connect(data.serverUrl,data.token,{autoSubscribe:true});
        if(cancelled)return;
        setChannelState("connected");
        setMessage("");
        refreshParticipants();
      }catch(error){
        console.error("LiveKit connection failed",error);
        if(cancelled)return;
        setChannelState("error");
        setMessage(connectionMessage(error));
      }
    })();

    return ()=>{
      cancelled=true;
      activeRef.current=false;
      pageChannel.untrack().catch(()=>{});
      supabase.removeChannel(pageChannel);
      channelRef.current=null;
      livekitRoom?.removeAllListeners();
      livekitRoom?.disconnect();
      roomRef.current=null;
      setRemoteStreams([]);
      setParticipants([]);
    };
  },[enabled,roomId,session?.access_token,displayName,initialPage,refreshParticipants]);

  const toggleMic=useCallback(async()=>{
    const room=roomRef.current;
    if(!room||channelState!=="connected")return;
    const enable=micState!=="live";
    setMessage("");
    if(enable){
      micStateRef.current="requesting";
      setMicState("requesting");
      refreshParticipants();
    }
    try{
      await room.localParticipant.setMicrophoneEnabled(enable,{
        echoCancellation:true,
        noiseSuppression:true,
        autoGainControl:true
      });
      micStateRef.current=enable?"live":"muted";
      setMicState(micStateRef.current);
      setMessage("");
      refreshParticipants();
    }catch(error){
      console.error("LiveKit microphone failed",error);
      micStateRef.current="error";
      setMicState("error");
      setMessage(microphoneMessage(error));
    }
  },[channelState,micState,refreshParticipants]);

  const broadcastPage=useCallback(page=>{
    pageRef.current=page;
    pageSyncedRef.current=true;
    const channel=channelRef.current;
    if(!channel)return;
    channel.send({type:"broadcast",event:"page-state",payload:{from:pagePeerIdRef.current,page}}).catch(error=>{
      console.error("Page sync failed",error);
      setMessage("페이지 동기화가 잠시 지연되고 있어요.");
    });
  },[]);

  const startAudio=useCallback(async()=>{
    const room=roomRef.current;
    if(!room)return false;
    try{
      await room.startAudio();
      return true;
    }catch(error){
      console.error("LiveKit audio playback failed",error);
      return false;
    }
  },[]);

  return {participants,remoteStreams,channelState,micState,message,toggleMic,broadcastPage,startAudio,provider:"livekit"};
}
