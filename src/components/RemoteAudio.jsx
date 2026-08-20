import {useEffect,useRef} from "react";

export function RemoteAudio({id,stream,onBlocked,onPlaying,onElement}){
  const audioRef=useRef(null);

  useEffect(()=>{
    const audio=audioRef.current;
    if(!audio)return;
    audio.srcObject=stream;
    onElement(id,audio);
    const play=()=>{
      const result=audio.play();
      if(result?.catch)result.then(()=>onPlaying(id)).catch(()=>onBlocked(id));
    };
    const playing=()=>onPlaying(id);
    const interrupted=()=>onBlocked(id);
    const track=stream.getAudioTracks()[0];
    audio.addEventListener("playing",playing);
    audio.addEventListener("pause",interrupted);
    audio.addEventListener("stalled",interrupted);
    track?.addEventListener("unmute",play);
    play();
    return ()=>{
      audio.removeEventListener("playing",playing);
      audio.removeEventListener("pause",interrupted);
      audio.removeEventListener("stalled",interrupted);
      track?.removeEventListener("unmute",play);
      onElement(id,null);
      audio.pause();
      audio.srcObject=null;
    };
  },[id,stream,onBlocked,onPlaying,onElement]);

  return <audio ref={audioRef} className="remoteAudio" autoPlay playsInline/>;
}
