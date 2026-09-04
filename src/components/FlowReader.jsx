import {useCallback,useEffect,useRef,useState} from "react";
import {BookOpen,ChevronRight,Copy,Mic,Pause,Play,RotateCcw,ShieldCheck,UserRound,Users,Volume2} from "lucide-react";
import {supabase} from "../supabase";
import {useLiveKitRoom} from "../hooks/useLiveKitRoom";
import {RemoteAudio} from "./RemoteAudio";
import {RecordingStudio} from "./RecordingStudio";

const FLOW_LINES=[
  "새침하게 흐린 품이 눈이 올 듯하더니 눈은 아니 오고 얼다가 만 비가 추적추적 내리었다.",
  "이날이야말로 동소문 안에서 인력거꾼 노릇을 하는 김 첨지에게는 오래간만에도 닥친 운수 좋은 날이었다.",
  "문안에 들어간답시는 앞집 마나님을 전찻길까지 모셔다 드린 것을 비롯으로, 행여나 손님이 있을까 하고 정류장에서 어정어정하였다.",
  "내리는 사람 하나하나에게 거의 비는 듯한 눈결을 보내고 있다가 마침내 교원인 듯한 양복장이를 동광학교까지 태워다 주기로 되었다.",
  "첫번에 삼십 전, 둘째 번에 오십 전. 아침 댓바람에 그리 흔치 않은 일이었다.",
  "그야말로 재수가 옴붙어서 근 열흘 동안 돈 구경도 못한 김 첨지는 십 전짜리 백통화가 손바닥에 떨어질 제 거의 눈물을 흘릴 만큼 기뻤었다.",
  "더구나 이날 이때에 이 팔십 전이라는 돈이 그에게 얼마나 유용한지 몰랐다.",
  "컬컬한 목에 모주 한 잔도 적실 수 있거니와, 그보다도 앓는 아내에게 설렁탕 한 그릇도 사다 줄 수 있음이다.",
  "그의 아내가 기침으로 쿨럭거리기는 벌써 달포가 넘었다.",
  "조밥도 굶기를 먹다시피 하는 형편이니 물론 약 한 첩 써 본 일이 없다."
];

const SPEEDS={
  slow:{label:"천천히",charactersPerMinute:170,autoAdvance:true},
  normal:{label:"보통",charactersPerMinute:230,autoAdvance:true},
  fast:{label:"빠르게",charactersPerMinute:310,autoAdvance:true},
  manual:{label:"직접 넘김",charactersPerMinute:220,autoAdvance:false}
};
const SOURCE_URL="https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?menuNo=200019&wrtSn=9002094";
const FLOW_ROOM_ID="flow-g905-9002094";

function normalizeSpeech(value){return String(value||"").replace(/[^0-9a-zA-Z가-힣]/g,"")}

function speechProgress(transcript,line){
  const heard=normalizeSpeech(transcript);
  const target=normalizeSpeech(line);
  if(!heard||!target)return 0;
  let heardIndex=0;
  let matched=0;
  for(const character of target){
    const found=heard.indexOf(character,heardIndex);
    if(found<0)continue;
    heardIndex=found+1;
    matched+=1;
  }
  return Math.min(1,matched/target.length);
}

function flowGuestError(error){
  const message=String(error?.message||"").toLowerCase();
  if(message.includes("anonymous sign-ins are disabled"))return "게스트 입장이 아직 열리지 않았어요.";
  if(message.includes("rate limit"))return "접속 요청이 잠시 많아요. 잠시 후 다시 시도해주세요.";
  return "FLOW LIVE에 입장하지 못했어요. 잠시 후 다시 시도해주세요.";
}

export function ReadingModes({onBack,onFlow,onPage}){
  return <section className="readingModesPage">
    <button className="back" onClick={onBack}>‹ 홈으로</button>
    <div className="modeIntro"><small>JJOKGO READING FORMAT</small><h1>어떻게 함께<br/>읽을까요?</h1><p>오늘 책을 읽는 방식으로 선택해요.</p></div>
    <div className="modeGrid">
      <button className="modeCard flow" onClick={onFlow}>
        <span className="modeIndex">01</span><span className="modeLabel">쪽GO FLOW</span>
        <strong>화면에 흐르는<br/>문장을 따라.</strong>
        <p>공개가 허용된 원문이 화면에 흐릅니다. 속도에 맞춰 읽고, 여럿이 릴레이로 낭독할 수 있는 형식이에요.</p>
        <span className="modeMeta"><Play/> 화면 스크립트 · LIVE 음성</span><ChevronRight/>
      </button>
      <button className="modeCard page" onClick={onPage}>
        <span className="modeIndex">02</span><span className="modeLabel">쪽GO PAGE</span>
        <strong>각자의 책으로,<br/>따로 또 같이.</strong>
        <p>참여자가 같은 책을 각자 준비합니다. 실시간 음성과 페이지를 나누는 지금의 LIVE 독서방이에요.</p>
        <span className="modeMeta"><BookOpen/> 실물책 · LIVE 음성</span><ChevronRight/>
      </button>
    </div>
    <div className="modePrinciple"><b>하나의 쪽GO, 두 가지 읽기 형식</b><span>FLOW와 PAGE 모두 같은 LIVE 경험 안에서 이어집니다.</span></div>
  </section>;
}

export function FlowReader({session,onBack}){
  const[index,setIndex]=useState(0);
  const[playing,setPlaying]=useState(false);
  const[speed,setSpeed]=useState("normal");
  const[highlightedCount,setHighlightedCount]=useState(0);
  const[nickname,setNickname]=useState("");
  const[joining,setJoining]=useState(false);
  const[joinMessage,setJoinMessage]=useState("");
  const[copied,setCopied]=useState(false);
  const[blockedAudioIds,setBlockedAudioIds]=useState([]);
  const timerRef=useRef(null);
  const recognitionRef=useRef(null);
  const audioElementsRef=useRef(new Map());
  const lineRef=useRef(FLOW_LINES[0]);
  const indexRef=useRef(0);
  const liveKitEnabled=import.meta.env.VITE_LIVEKIT_ENABLED==="true";
  const SpeechRecognition=typeof window!=="undefined"&&(window.SpeechRecognition||window.webkitSpeechRecognition);

  const onRemoteLine=useCallback(next=>{
    const nextIndex=Math.max(0,Math.min(FLOW_LINES.length-1,(Number(next)||1)-1));
    indexRef.current=nextIndex;
    lineRef.current=FLOW_LINES[nextIndex];
    setIndex(nextIndex);
    setHighlightedCount(0);
    setPlaying(false);
  },[]);
  const live=useLiveKitRoom({roomId:FLOW_ROOM_ID,session,initialPage:1,onRemotePage:onRemoteLine,enabled:liveKitEnabled&&Boolean(session)});

  const updateLine=useCallback(nextIndex=>{
    const safeIndex=Math.max(0,Math.min(FLOW_LINES.length-1,nextIndex));
    indexRef.current=safeIndex;
    lineRef.current=FLOW_LINES[safeIndex];
    setIndex(safeIndex);
    setHighlightedCount(0);
    live.broadcastPage(safeIndex+1);
  },[live.broadcastPage]);

  useEffect(()=>{
    window.clearTimeout(timerRef.current);
    if(!playing)return undefined;
    const characters=Array.from(FLOW_LINES[index]);
    const pace=SPEEDS[speed];
    if(highlightedCount<characters.length){
      const character=characters[highlightedCount];
      const punctuationPause=/[.!?。！？]/.test(character)?1.9:/[,，:;·]/.test(character)?1.4:/\s/.test(character)?.55:1;
      const characterDelay=Math.round((60000/pace.charactersPerMinute)*punctuationPause);
      timerRef.current=window.setTimeout(()=>setHighlightedCount(current=>Math.min(characters.length,current+1)),characterDelay);
      return()=>window.clearTimeout(timerRef.current);
    }
    if(!pace.autoAdvance)return undefined;
    timerRef.current=window.setTimeout(()=>{
      if(index>=FLOW_LINES.length-1){
        setPlaying(false);
        if(live.micState==="live")live.toggleMic();
        return;
      }
      updateLine(index+1);
    },700);
    return()=>window.clearTimeout(timerRef.current);
  },[highlightedCount,index,playing,speed,updateLine]);

  useEffect(()=>{
    recognitionRef.current?.stop?.();
    recognitionRef.current=null;
    if(!playing||!SpeechRecognition||live.micState!=="live")return undefined;
    const recognition=new SpeechRecognition();
    recognition.lang="ko-KR";
    recognition.continuous=true;
    recognition.interimResults=true;
    recognition.onresult=event=>{
      const transcript=Array.from(event.results).map(result=>result[0]?.transcript||"").join(" ");
      const ratio=speechProgress(transcript,lineRef.current);
      setHighlightedCount(current=>Math.max(current,Math.round(Array.from(lineRef.current).length*ratio)));
    };
    recognition.onerror=event=>{
      if(!["aborted","no-speech"].includes(event.error))console.warn("FLOW speech following unavailable",event.error);
    };
    try{recognition.start();recognitionRef.current=recognition}catch(error){console.warn("FLOW speech following could not start",error)}
    return()=>{recognition.onresult=null;recognition.onerror=null;try{recognition.stop()}catch{}recognitionRef.current=null};
  },[index,live.micState,playing,SpeechRecognition]);

  const move=offset=>{if(!(playing&&speed==="manual"))setPlaying(false);updateLine(indexRef.current+offset)};
  const restart=()=>{setPlaying(false);updateLine(0)};
  const progress=((index+1)/FLOW_LINES.length)*100;

  async function joinFlow(event){
    event.preventDefault();
    const name=nickname.trim();
    if(!name){setJoinMessage("함께 읽을 때 사용할 이름을 입력해주세요.");return;}
    setJoining(true);setJoinMessage("");
    try{
      const{error}=await supabase.auth.signInAnonymously({options:{data:{nickname:name}}});
      if(error)throw error;
    }catch(error){setJoinMessage(flowGuestError(error));setJoining(false)}
  }

  async function toggleFlow(){
    if(live.channelState!=="connected")return;
    if(playing){
      setPlaying(false);
      if(live.micState==="live")await live.toggleMic();
      return;
    }
    if(live.micState!=="live")await live.toggleMic();
    setPlaying(true);
  }

  async function copyFlowLink(){
    const url=new URL(window.location.origin);
    url.searchParams.set("flow","G9059002094");
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);setTimeout(()=>setCopied(false),1400);
  }

  const onAudioElement=useCallback((id,element)=>{if(element)audioElementsRef.current.set(id,element);else audioElementsRef.current.delete(id)},[]);
  const onAudioBlocked=useCallback(id=>setBlockedAudioIds(previous=>previous.includes(id)?previous:[...previous,id]),[]);
  const onAudioPlaying=useCallback(id=>setBlockedAudioIds(previous=>previous.filter(item=>item!==id)),[]);
  const enableRemoteAudio=useCallback(async()=>{
    await live.startAudio?.();
    await Promise.allSettled([...audioElementsRef.current.entries()].map(async([id,audio])=>{await audio.play();onAudioPlaying(id)}));
  },[live.startAudio,onAudioPlaying]);

  const connectedCount=live.participants.filter(item=>item.connectionState==="connected").length;
  const activeCharacters=Array.from(FLOW_LINES[index]);

  return <section className="flowReaderPage">
    <button className="back" onClick={onBack}>‹ 읽기 방식 선택</button>
    <header className="flowHeader">
      <div><small>쪽GO FLOW · PUBLIC DOMAIN 01</small><h1>운수 좋은 날</h1><p>현진건 · 1924</p></div>
      <div className="flowHeaderBadges"><div className="rightsBadge"><ShieldCheck/><span><b>이용 확인 완료</b><small>만료저작물 · 자유이용</small></span></div><button className="flowShare" onClick={copyFlowLink}><Copy/>{copied?"링크 복사됨":"FLOW 초대 링크"}</button></div>
    </header>

    {!session&&<form className="flowGuestEntry" onSubmit={joinFlow}><UserRound/><div><b>이름만 적고 FLOW LIVE 입장</b><small>회원가입 없이 같은 글과 목소리를 함께 나눠요.</small></div><input required maxLength="30" value={nickname} onChange={event=>setNickname(event.target.value)} placeholder="참여 이름"/><button disabled={joining}>{joining?"입장 중…":"게스트 입장"}</button>{joinMessage&&<p role="status">{joinMessage}</p>}</form>}
    {session&&<div className={`flowLiveStatus ${live.channelState}`}><span/><div><b>{live.channelState==="connected"?`FLOW LIVE · ${connectedCount}명 연결`:live.channelState==="connecting"?"FLOW LIVE 연결 중":"FLOW LIVE 연결 확인 필요"}</b><small>{live.message||"같은 문장과 목소리가 참여자에게 실시간으로 전달됩니다."}</small></div><Users/></div>}
    {blockedAudioIds.length>0&&<button className="flowAudioUnlock" onClick={enableRemoteAudio}><Volume2/> 다른 참여자의 소리 재생하기</button>}

    <div className="flowStage" aria-live="polite">
      <div className="flowStageMeta"><span>EXCERPT {String(index+1).padStart(2,"0")}</span><span>{Math.round(progress)}%</span></div>
      <div className="flowContext previous">{index>0?FLOW_LINES[index-1]:"—"}</div>
      <p className="flowActiveLine" aria-label={FLOW_LINES[index]}>{activeCharacters.map((character,characterIndex)=><span key={`${index}-${characterIndex}`} className={characterIndex<highlightedCount?"spoken":""}>{character}</span>)}</p>
      <div className="flowContext next">{index<FLOW_LINES.length-1?FLOW_LINES[index+1]:"이 시범 구간을 모두 읽었습니다."}</div>
      <div className="flowProgress" aria-label={`읽기 진행률 ${Math.round(progress)}퍼센트`}><i style={{width:`${progress}%`}}/></div>
    </div>

    <div className="flowControls">
      <button onClick={()=>move(-1)} disabled={index===0}>← 이전 문장</button>
      <button className={`flowPlay ${live.micState}`} onClick={toggleFlow} disabled={!session||live.channelState!=="connected"}>{playing?<Pause/>:<Mic/>}{playing?"낭독 잠시 멈춤":live.channelState==="connecting"?"LIVE 연결 중…":"마이크 켜고 FLOW 시작"}</button>
      <button onClick={()=>move(1)} disabled={index===FLOW_LINES.length-1}>다음 문장 →</button>
    </div>
    <div className="flowSettings">
      <div><small>READING PACE</small>{Object.entries(SPEEDS).map(([key,item])=><button key={key} className={speed===key?"active":""} onClick={()=>setSpeed(key)}>{item.label}</button>)}</div>
      <button className="flowRestart" onClick={restart}><RotateCcw/> 처음부터</button>
    </div>

    {session&&<section className="flowParticipants"><div><small>NOW IN FLOW</small><b>함께 읽는 사람</b></div><div>{live.participants.map(participant=><span key={participant.id} className={participant.micState}><i/>{participant.name}<small>{participant.micState==="live"?"읽는 중":participant.micState==="muted"?"음소거":"듣는 중"}</small></span>)}</div><p>{SpeechRecognition?"말한 길이를 감지해 글자 색을 따라가며, 선택한 속도가 자연스럽게 보조합니다.":"이 브라우저에서는 선택한 읽기 속도에 맞춰 글자 색이 진행됩니다."}</p></section>}

    {session&&<RecordingStudio roomName="쪽GO FLOW" bookTitle="운수 좋은 날" variant="flow"/>}

    <aside className="flowRights">
      <ShieldCheck/>
      <div><small>RIGHTS &amp; SOURCE</small><b>원문 이용 근거를 작품마다 먼저 확인합니다.</b><p>이 시범 콘텐츠는 한국저작권위원회 공유마당에서 만료저작물로 제공하는 원문을 기준으로 구성했습니다. 현대 출판사의 표지·편집·해설은 사용하지 않습니다.</p><a href={SOURCE_URL} target="_blank" rel="noreferrer">공식 원문과 이용정보 보기 ↗</a><em>출처: 한국저작권위원회 공유마당 · G905-9002094</em></div>
    </aside>
    <div className="flowBetaNote"><b>FLOW BETA</b><span>LIVE 음성과 문장 위치가 연결되었습니다. 음성 인식은 브라우저에 따라 차이가 있어 선택한 읽기 속도가 함께 보조합니다.</span></div>
    {live.remoteStreams.map(item=><RemoteAudio key={item.id} id={item.id} stream={item.stream} onBlocked={onAudioBlocked} onPlaying={onAudioPlaying} onElement={onAudioElement}/>)}
  </section>;
}
