import {useEffect,useRef} from "react";

export function RemoteAudio({id,stream,onBlocked,onPlaying,onElement}){
  const audioRef=useRef(null);

  useEffect(()=>{
    const audio=audioRef.current;
    if(!audio)return;
    audio.srcObject=stream;
    onElement(id,audio);
    const result=audio.play();
    if(result?.catch){
      result.then(()=>onPlaying(id)).catch(()=>onBlocked(id));
    }
    return ()=>{
      onElement(id,null);
      audio.pause();
      audio.srcObject=null;
    };
  },[id,stream,onBlocked,onPlaying,onElement]);

  return <audio ref={audioRef} className="remoteAudio" autoPlay playsInline/>;
}
