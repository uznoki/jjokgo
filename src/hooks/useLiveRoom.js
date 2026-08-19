import {useCallback,useEffect,useRef,useState} from "react";
import {supabase} from "../supabase";

const ICE_SERVERS=[{urls:"stun:stun.l.google.com:19302"}];
const FAILED_STATES=new Set(["failed","closed"]);

function makePeerId(){
  return globalThis.crypto?.randomUUID?.()||`${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function microphoneError(error){
  if(error?.name==="NotAllowedError"||error?.name==="SecurityError"){
    return "마이크 권한이 꺼져 있어요. 브라우저 설정에서 마이크를 허용한 뒤 다시 눌러주세요.";
  }
  if(error?.name==="NotFoundError")return "사용할 수 있는 마이크를 찾지 못했어요.";
  if(error?.name==="NotReadableError")return "다른 앱이 마이크를 사용 중이에요. 다른 앱을 닫고 다시 시도해주세요.";
  return "마이크를 시작하지 못했어요. 네트워크와 브라우저 설정을 확인해주세요.";
}

function flattenPresence(state){
  const latest=new Map();
  Object.values(state||{}).flat().forEach(presence=>{
    if(presence?.peerId)latest.set(presence.peerId,presence);
  });
  return [...latest.values()];
}

export function useLiveRoom({roomId,displayName,initialPage=17,onRemotePage}){
  const selfIdRef=useRef(makePeerId());
  const channelRef=useRef(null);
  const peersRef=useRef(new Map());
  const localStreamRef=useRef(null);
  const micStateRef=useRef("idle");
  const pageRef=useRef(initialPage);
  const pageSyncedRef=useRef(false);
  const activeRef=useRef(false);
  const onRemotePageRef=useRef(onRemotePage);
  const disconnectTimersRef=useRef(new Map());
  const [participants,setParticipants]=useState([]);
  const [remoteStreams,setRemoteStreams]=useState([]);
  const [connectionStates,setConnectionStates]=useState({});
  const [channelState,setChannelState]=useState(roomId?"connecting":"idle");
  const [micState,setMicState]=useState("idle");
  const [message,setMessage]=useState("");

  useEffect(()=>{onRemotePageRef.current=onRemotePage},[onRemotePage]);

  const updateConnection=useCallback((remoteId,state)=>{
    setConnectionStates(prev=>prev[remoteId]===state?prev:{...prev,[remoteId]:state});
  },[]);

  const send=useCallback(async(event,payload)=>{
    const channel=channelRef.current;
    if(!channel||!activeRef.current)return;
    const result=await channel.send({type:"broadcast",event,payload:{...payload,from:selfIdRef.current}});
    if(result!=="ok")throw new Error(`Realtime ${event} 전송 실패`);
  },[]);

  const publishPresence=useCallback(async(nextMicState=micStateRef.current)=>{
    const channel=channelRef.current;
    if(!channel||!activeRef.current)return;
    try{
      await channel.track({
        peerId:selfIdRef.current,
        displayName:displayName||"쪽GO 참여자",
        micState:nextMicState,
        onlineAt:new Date().toISOString()
      });
    }catch(error){
      console.error("Presence update failed",error);
    }
  },[displayName]);

  const closePeer=useCallback(remoteId=>{
    const timer=disconnectTimersRef.current.get(remoteId);
    if(timer)clearTimeout(timer);
    disconnectTimersRef.current.delete(remoteId);
    const peer=peersRef.current.get(remoteId);
    if(peer){
      peer.pc.ontrack=null;
      peer.pc.onicecandidate=null;
      peer.pc.onnegotiationneeded=null;
      peer.pc.onconnectionstatechange=null;
      peer.pc.close();
      peersRef.current.delete(remoteId);
    }
    setRemoteStreams(prev=>prev.filter(item=>item.id!==remoteId));
    setConnectionStates(prev=>{
      if(!(remoteId in prev))return prev;
      const next={...prev};
      delete next[remoteId];
      return next;
    });
  },[]);

  const signalDescription=useCallback(async(remoteId,peer)=>{
    if(!activeRef.current||peer.makingOffer||peer.pc.signalingState==="closed")return;
    try{
      peer.makingOffer=true;
      await peer.pc.setLocalDescription();
      await send("description",{to:remoteId,description:peer.pc.localDescription});
    }catch(error){
      console.error("WebRTC negotiation failed",error);
      updateConnection(remoteId,"failed");
      setMessage("일부 참여자와 음성 연결을 다시 시도하고 있어요.");
    }finally{
      peer.makingOffer=false;
    }
  },[send,updateConnection]);

  const ensurePeer=useCallback(remoteId=>{
    if(!remoteId||remoteId===selfIdRef.current)return null;
    const existing=peersRef.current.get(remoteId);
    if(existing)return existing;

    const pc=new RTCPeerConnection({iceServers:ICE_SERVERS});
    const localTrack=localStreamRef.current?.getAudioTracks?.()[0];
    const transceiver=localTrack
      ?pc.addTransceiver(localTrack,{direction:"sendrecv",streams:[localStreamRef.current]})
      :pc.addTransceiver("audio",{direction:"recvonly"});
    const peer={
      pc,
      transceiver,
      polite:selfIdRef.current>remoteId,
      makingOffer:false,
      ignoreOffer:false,
      settingRemoteAnswer:false,
      pendingCandidates:[]
    };
    peersRef.current.set(remoteId,peer);
    updateConnection(remoteId,"connecting");

    pc.onnegotiationneeded=()=>signalDescription(remoteId,peer);
    pc.onicecandidate=event=>{
      if(!event.candidate)return;
      send("ice",{to:remoteId,candidate:event.candidate}).catch(error=>console.error("ICE send failed",error));
    };
    pc.ontrack=event=>{
      const stream=event.streams?.[0]||new MediaStream([event.track]);
      setRemoteStreams(prev=>{
        const item={id:remoteId,stream};
        return prev.some(x=>x.id===remoteId)?prev.map(x=>x.id===remoteId?item:x):[...prev,item];
      });
    };
    pc.onconnectionstatechange=()=>{
      const state=pc.connectionState;
      updateConnection(remoteId,state);
      if(state==="connected"){
        setMessage("");
        const timer=disconnectTimersRef.current.get(remoteId);
        if(timer)clearTimeout(timer);
        disconnectTimersRef.current.delete(remoteId);
      }
      if(state==="disconnected"&&!disconnectTimersRef.current.has(remoteId)){
        const timer=setTimeout(()=>{
          disconnectTimersRef.current.delete(remoteId);
          if(pc.connectionState==="disconnected"){
            try{pc.restartIce()}catch(error){console.error("ICE restart failed",error)}
            if(selfIdRef.current<remoteId)signalDescription(remoteId,peer);
          }
        },5000);
        disconnectTimersRef.current.set(remoteId,timer);
      }
      if(FAILED_STATES.has(state)){
        setMessage("일부 참여자와 음성 연결이 끊겼어요. 방을 나갔다 다시 들어오면 재연결할 수 있어요.");
        if(state==="failed"){
          try{pc.restartIce()}catch(error){console.error("ICE restart failed",error)}
          if(selfIdRef.current<remoteId)signalDescription(remoteId,peer);
        }
      }
    };
    return peer;
  },[send,signalDescription,updateConnection]);

  const handleDescription=useCallback(async payload=>{
    if(payload.to!==selfIdRef.current||!payload.description)return;
    const peer=ensurePeer(payload.from);
    if(!peer)return;
    const {pc}=peer;
    const description=payload.description;
    const readyForOffer=!peer.makingOffer&&(pc.signalingState==="stable"||peer.settingRemoteAnswer);
    const offerCollision=description.type==="offer"&&!readyForOffer;
    peer.ignoreOffer=!peer.polite&&offerCollision;
    if(peer.ignoreOffer)return;
    try{
      peer.settingRemoteAnswer=description.type==="answer";
      if(offerCollision&&pc.signalingState!=="stable"){
        await Promise.all([pc.setLocalDescription({type:"rollback"}),pc.setRemoteDescription(description)]);
      }else{
        await pc.setRemoteDescription(description);
      }
      peer.settingRemoteAnswer=false;
      while(peer.pendingCandidates.length){
        await pc.addIceCandidate(peer.pendingCandidates.shift());
      }
      if(description.type==="offer"){
        await pc.setLocalDescription();
        await send("description",{to:payload.from,description:pc.localDescription});
      }
    }catch(error){
      peer.settingRemoteAnswer=false;
      console.error("WebRTC description failed",error);
      updateConnection(payload.from,"failed");
      setMessage("음성 연결 협상에 실패했어요. 네트워크 상태를 확인해주세요.");
    }
  },[ensurePeer,send,updateConnection]);

  const handleIce=useCallback(async payload=>{
    if(payload.to!==selfIdRef.current||!payload.candidate)return;
    const peer=ensurePeer(payload.from);
    if(!peer||peer.ignoreOffer)return;
    try{
      if(peer.pc.remoteDescription)await peer.pc.addIceCandidate(payload.candidate);
      else peer.pendingCandidates.push(payload.candidate);
    }catch(error){
      if(!peer.ignoreOffer)console.error("ICE candidate failed",error);
    }
  },[ensurePeer]);

  useEffect(()=>{
    if(!roomId){
      setChannelState("idle");
      return;
    }
    activeRef.current=true;
    pageRef.current=initialPage;
    pageSyncedRef.current=false;
    micStateRef.current="idle";
    setMicState("idle");
    setChannelState("connecting");
    setMessage("LIVE 독서방에 연결하고 있어요…");
    const channel=supabase.channel(`live-room-${roomId}`,{
      config:{broadcast:{self:false},presence:{key:selfIdRef.current}}
    });
    channelRef.current=channel;

    const syncPresence=()=>{
      const presences=flattenPresence(channel.presenceState());
      const ids=new Set(presences.map(item=>item.peerId));
      ids.add(selfIdRef.current);
      presences.forEach(item=>ensurePeer(item.peerId));
      [...peersRef.current.keys()].forEach(id=>{if(!ids.has(id))closePeer(id)});
      const selfPresence={peerId:selfIdRef.current,displayName:displayName||"나",micState:micStateRef.current};
      const withSelf=presences.some(item=>item.peerId===selfIdRef.current)?presences:[selfPresence,...presences];
      setParticipants(withSelf.map(item=>({
        id:item.peerId,
        name:item.peerId===selfIdRef.current?"나":item.displayName||"참여자",
        isSelf:item.peerId===selfIdRef.current,
        micState:item.peerId===selfIdRef.current?micStateRef.current:item.micState||"idle"
      })));
    };

    channel
      .on("presence",{event:"sync"},syncPresence)
      .on("presence",{event:"leave"},({leftPresences})=>{
        leftPresences?.forEach(item=>closePeer(item.peerId));
      })
      .on("broadcast",{event:"description"},({payload})=>handleDescription(payload))
      .on("broadcast",{event:"ice"},({payload})=>handleIce(payload))
      .on("broadcast",{event:"leave"},({payload})=>closePeer(payload.from))
      .on("broadcast",{event:"page-request"},({payload})=>{
        if(payload.from===selfIdRef.current)return;
        const ids=flattenPresence(channel.presenceState()).map(item=>item.peerId).concat(selfIdRef.current).sort();
        if(ids[0]===selfIdRef.current){
          send("page-state",{to:payload.from,page:pageRef.current}).catch(console.error);
        }
      })
      .on("broadcast",{event:"page-state"},({payload})=>{
        if(payload.from===selfIdRef.current||(payload.to&&payload.to!==selfIdRef.current))return;
        const next=Number(payload.page);
        if(payload.to&&pageSyncedRef.current)return;
        if(Number.isFinite(next)){
          pageSyncedRef.current=true;
          pageRef.current=next;
          onRemotePageRef.current?.(next);
        }
      })
      .subscribe(async status=>{
        if(!activeRef.current)return;
        if(status==="SUBSCRIBED"){
          setChannelState("connected");
          setMessage("");
          await publishPresence();
          await send("page-request",{}).catch(console.error);
        }else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
          setChannelState("error");
          setMessage("LIVE 독서방 서버에 연결하지 못했어요. 네트워크를 확인해주세요.");
        }else if(status==="CLOSED"){
          setChannelState("closed");
        }
      });

    return ()=>{
      activeRef.current=false;
      channel.send({type:"broadcast",event:"leave",payload:{from:selfIdRef.current}}).catch(()=>{});
      channel.untrack().catch(()=>{});
      [...peersRef.current.keys()].forEach(closePeer);
      disconnectTimersRef.current.forEach(clearTimeout);
      disconnectTimersRef.current.clear();
      const stream=localStreamRef.current;
      if(stream){
        stream.getTracks().forEach(track=>track.stop());
        localStreamRef.current=null;
      }
      micStateRef.current="idle";
      supabase.removeChannel(channel);
      channelRef.current=null;
      setRemoteStreams([]);
      setParticipants([]);
    };
  },[roomId,displayName,initialPage,closePeer,ensurePeer,handleDescription,handleIce,publishPresence,send]);

  const toggleMic=useCallback(async()=>{
    setMessage("");
    if(localStreamRef.current){
      const next=micStateRef.current==="live"?"muted":"live";
      localStreamRef.current.getAudioTracks().forEach(track=>{track.enabled=next==="live"});
      micStateRef.current=next;
      setMicState(next);
      await publishPresence(next);
      return;
    }
    if(!navigator.mediaDevices?.getUserMedia){
      const text="이 브라우저에서는 마이크를 사용할 수 없어요. 최신 Safari 또는 Chrome으로 열어주세요.";
      setMicState("error");
      micStateRef.current="error";
      setMessage(text);
      return;
    }
    micStateRef.current="requesting";
    setMicState("requesting");
    setMessage("마이크 권한을 확인하고 있어요…");
    await publishPresence("requesting");
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(!activeRef.current){
        stream.getTracks().forEach(track=>track.stop());
        return;
      }
      localStreamRef.current=stream;
      const track=stream.getAudioTracks()[0];
      track.onended=()=>{
        localStreamRef.current=null;
        peersRef.current.forEach(peer=>{
          peer.transceiver.sender.replaceTrack(null).catch(()=>{});
          peer.transceiver.direction="recvonly";
        });
        micStateRef.current="error";
        setMicState("error");
        setMessage("마이크 연결이 종료됐어요. LIVE 버튼을 눌러 다시 연결해주세요.");
        publishPresence("error");
      };
      await Promise.all([...peersRef.current.values()].map(async peer=>{
        await peer.transceiver.sender.replaceTrack(track);
        peer.transceiver.direction="sendrecv";
      }));
      micStateRef.current="live";
      setMicState("live");
      setMessage("");
      await publishPresence("live");
    }catch(error){
      console.error("Microphone start failed",error);
      micStateRef.current="error";
      setMicState("error");
      setMessage(microphoneError(error));
      await publishPresence("error");
    }
  },[publishPresence]);

  const broadcastPage=useCallback(page=>{
    pageRef.current=page;
    pageSyncedRef.current=true;
    send("page-state",{page}).catch(error=>{
      console.error("Page sync failed",error);
      setMessage("페이지 동기화가 잠시 지연되고 있어요.");
    });
  },[send]);

  const participantsWithConnection=participants.map(item=>({
    ...item,
    connectionState:item.isSelf?(channelState==="connected"?"connected":channelState):(connectionStates[item.id]||"connecting")
  }));

  return {
    selfId:selfIdRef.current,
    participants:participantsWithConnection,
    remoteStreams,
    channelState,
    micState,
    message,
    toggleMic,
    broadcastPage
  };
}
