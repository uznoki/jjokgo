import {useEffect,useRef,useState} from "react";
import {Download,Mic,Podcast,Square,Trash2} from "lucide-react";

function supportedMimeType(){
  if(typeof MediaRecorder==="undefined")return "";
  return ["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(type=>MediaRecorder.isTypeSupported?.(type))||"";
}

function formatDuration(totalSeconds){
  const minutes=Math.floor(totalSeconds/60);
  const seconds=String(totalSeconds%60).padStart(2,"0");
  return `${minutes}:${seconds}`;
}

function extensionFor(type){
  return type.includes("mp4")?"m4a":"webm";
}

export function RecordingStudio({roomName="쪽GO 낭독",bookTitle="함께 읽는 책",variant="page"}){
  const recorderRef=useRef(null);
  const streamRef=useRef(null);
  const timerRef=useRef(null);
  const chunksRef=useRef([]);
  const [status,setStatus]=useState("idle");
  const [seconds,setSeconds]=useState(0);
  const [recording,setRecording]=useState(null);
  const [message,setMessage]=useState("");
  const [showPodcast,setShowPodcast]=useState(false);
  const [podcastTitle,setPodcastTitle]=useState(`${roomName} · ${bookTitle}`);
  const [podcastDescription,setPodcastDescription]=useState("오늘 함께 읽은 한 쪽과 그 뒤에 이어진 이야기를 기록합니다.");
  const [audience,setAudience]=useState("private");
  const [voiceConsent,setVoiceConsent]=useState(false);
  const [rightsConfirmed,setRightsConfirmed]=useState(false);
  const [draftReady,setDraftReady]=useState(false);

  useEffect(()=>()=>{
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(track=>track.stop());
    if(recording?.url)URL.revokeObjectURL(recording.url);
  },[recording?.url]);

  async function startRecording(){
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){
      setMessage("이 브라우저에서는 녹음을 지원하지 않아요. 최신 Safari 또는 Chrome에서 다시 시도해주세요.");
      return;
    }
    setMessage("");
    setDraftReady(false);
    setShowPodcast(false);
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      const mimeType=supportedMimeType();
      const recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);
      chunksRef.current=[];
      streamRef.current=stream;
      recorderRef.current=recorder;
      recorder.ondataavailable=event=>{if(event.data?.size)chunksRef.current.push(event.data)};
      recorder.onerror=()=>setMessage("녹음 중 문제가 생겼어요. 현재 녹음을 종료하고 다시 시도해주세요.");
      recorder.onstop=()=>{
        const type=recorder.mimeType||mimeType||"audio/webm";
        const blob=new Blob(chunksRef.current,{type});
        setRecording(previous=>{
          if(previous?.url)URL.revokeObjectURL(previous.url);
          return {blob,url:URL.createObjectURL(blob),type,duration:seconds||1,createdAt:new Date()};
        });
        stream.getTracks().forEach(track=>track.stop());
        streamRef.current=null;
        recorderRef.current=null;
        setStatus("ready");
        setMessage("내 낭독 기록이 이 기기에 임시로 준비됐어요. 다시 듣거나 파일로 내려받을 수 있어요.");
      };
      setSeconds(0);
      setStatus("recording");
      recorder.start(1000);
      const startedAt=Date.now();
      window.clearInterval(timerRef.current);
      timerRef.current=window.setInterval(()=>setSeconds(Math.floor((Date.now()-startedAt)/1000)),500);
    }catch(error){
      setStatus("idle");
      setMessage(error?.name==="NotAllowedError"?"마이크 권한이 꺼져 있어요. 브라우저 설정에서 허용해주세요.":"녹음을 시작하지 못했어요. 마이크 연결을 확인해주세요.");
    }
  }

  function stopRecording(){
    if(recorderRef.current?.state!=="inactive")recorderRef.current?.stop();
    window.clearInterval(timerRef.current);
  }

  function discardRecording(){
    if(recording?.url)URL.revokeObjectURL(recording.url);
    setRecording(null);
    setSeconds(0);
    setStatus("idle");
    setShowPodcast(false);
    setDraftReady(false);
    setVoiceConsent(false);
    setRightsConfirmed(false);
    setMessage("");
  }

  function downloadRecording(){
    if(!recording)return;
    const anchor=document.createElement("a");
    anchor.href=recording.url;
    anchor.download=`jjokgo-${new Date().toISOString().slice(0,10)}.${extensionFor(recording.type)}`;
    anchor.click();
  }

  function preparePodcast(event){
    event.preventDefault();
    if(!voiceConsent||!rightsConfirmed){
      setMessage("음성 공개 동의와 저작물 이용 권리를 모두 확인해주세요.");
      return;
    }
    setDraftReady(true);
    setMessage("팟캐스트 초안이 준비됐어요. 지금은 오디오를 내려받아 검토한 뒤 발행하는 안전한 단계입니다.");
  }

  return <section className={`recordingStudio ${variant}`} aria-labelledby={`recording-title-${variant}`}>
    <header className="recordingStudioHeader">
      <div><small>JJOKGO VOICE ARCHIVE</small><h3 id={`recording-title-${variant}`}>오늘의 낭독을 기록해요.</h3><p>현재 버전은 다른 참여자의 목소리를 담지 않고, 이 기기의 내 마이크만 녹음합니다.</p></div>
      <span className={`recordingState ${status}`}>{status==="recording"?`REC ${formatDuration(seconds)}`:status==="ready"?"기록 준비됨":"녹음 꺼짐"}</span>
    </header>

    {status!=="recording"&&!recording&&<button className="recordingStart" onClick={startRecording}><Mic/><span><b>내 낭독 녹음하기</b><small>누른 뒤부터 내 목소리만 기록</small></span></button>}
    {status==="recording"&&<div className="recordingActive"><div><i/><span><b>내 목소리를 녹음하고 있어요.</b><small>녹음 중에는 이 표시가 계속 보입니다.</small></span></div><button onClick={stopRecording}><Square/> 녹음 종료</button></div>}

    {recording&&<div className="recordingResult">
      <div className="recordingPlayback"><span><b>방금 녹음한 낭독</b><small>{formatDuration(seconds)} · 이 브라우저에 임시 보관</small></span><audio controls preload="metadata" src={recording.url}/></div>
      <div className="recordingResultActions"><button onClick={downloadRecording}><Download/> 오디오 내려받기</button><button onClick={()=>{setShowPodcast(value=>!value);setDraftReady(false)}}><Podcast/> 팟캐스트로 만들기</button><button className="recordingDelete" onClick={discardRecording}><Trash2/> 삭제</button></div>
    </div>}

    {showPodcast&&recording&&<form className="podcastDraft" onSubmit={preparePodcast}>
      <div className="podcastDraftIntro"><small>EPISODE DRAFT</small><h4>공개하기 전에 한 번 더 확인해요.</h4><p>자동 게시되지 않습니다. 제목과 공개 범위, 음성 및 책의 권리를 확인한 뒤 초안을 준비합니다.</p></div>
      <label>에피소드 제목<input required maxLength="100" value={podcastTitle} onChange={event=>setPodcastTitle(event.target.value)}/></label>
      <label>소개<textarea required maxLength="500" rows="3" value={podcastDescription} onChange={event=>setPodcastDescription(event.target.value)}/></label>
      <fieldset><legend>공개 범위</legend><label><input type="radio" name={`audience-${variant}`} checked={audience==="private"} onChange={()=>setAudience("private")}/><span><b>모임끼리 듣기</b><small>비공개 에피소드로 준비</small></span></label><label><input type="radio" name={`audience-${variant}`} checked={audience==="public"} onChange={()=>setAudience("public")}/><span><b>공개 팟캐스트</b><small>별도의 플랫폼 발행 심사 필요</small></span></label></fieldset>
      <label className="podcastCheck"><input type="checkbox" checked={voiceConsent} onChange={event=>setVoiceConsent(event.target.checked)}/><span>이 파일에는 내 목소리만 있으며 공개·보관에 동의합니다.</span></label>
      <label className="podcastCheck"><input type="checkbox" checked={rightsConfirmed} onChange={event=>setRightsConfirmed(event.target.checked)}/><span>낭독한 글을 녹음하고 {audience==="public"?"공개할":"공유할"} 권리가 있음을 확인했습니다.</span></label>
      <button className="podcastPrepare" disabled={!voiceConsent||!rightsConfirmed}><Podcast/> 팟캐스트 초안 준비</button>
      {draftReady&&<div className="podcastReady" role="status"><b>초안 준비 완료</b><span>{podcastTitle}</span><small>{audience==="private"?"모임 전용 비공개 발행":"공개 팟캐스트 발행"} · 오디오 검토 후 다음 단계에서 RSS와 연결합니다.</small><button type="button" onClick={downloadRecording}><Download/> 발행용 오디오 내려받기</button></div>}
    </form>}
    {message&&<p className="recordingMessage" role="status" aria-live="polite">{message}</p>}
  </section>;
}
