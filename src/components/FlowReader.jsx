import {useEffect,useRef,useState} from "react";
import {BookOpen,ChevronRight,Pause,Play,RotateCcw,ShieldCheck} from "lucide-react";

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

const SPEEDS={slow:{label:"천천히",delay:7200},normal:{label:"보통",delay:5200},fast:{label:"빠르게",delay:3600}};
const SOURCE_URL="https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?menuNo=200019&wrtSn=9002094";

export function ReadingModes({onBack,onFlow,onPage}){
  return <section className="readingModesPage">
    <button className="back" onClick={onBack}>‹ 홈으로</button>
    <div className="modeIntro"><small>JJOKGO READING FORMAT</small><h1>어떻게 함께<br/>읽을까요?</h1><p>사람 수가 아니라, 오늘 책을 읽는 방식으로 선택해요.</p></div>
    <div className="modeGrid">
      <button className="modeCard flow" onClick={onFlow}>
        <span className="modeIndex">01</span><span className="modeLabel">쪽GO FLOW</span>
        <strong>문장을 따라,<br/>리듬을 함께.</strong>
        <p>공개가 허용된 원문이 화면에 흐릅니다. 속도에 맞춰 읽고, 여럿이 릴레이로 낭독할 수 있는 형식이에요.</p>
        <span className="modeMeta"><Play/> 화면 스크립트 · 속도 조절</span><ChevronRight/>
      </button>
      <button className="modeCard page" onClick={onPage}>
        <span className="modeIndex">02</span><span className="modeLabel">쪽GO PAGE</span>
        <strong>각자의 책으로,<br/>목소리는 함께.</strong>
        <p>참여자가 같은 책을 각자 준비합니다. 실시간 음성과 페이지를 나누는 지금의 LIVE 독서방이에요.</p>
        <span className="modeMeta"><BookOpen/> 실물책 · LIVE 음성</span><ChevronRight/>
      </button>
    </div>
    <div className="modePrinciple"><b>하나의 쪽GO, 두 가지 읽기 형식</b><span>FLOW와 PAGE 모두 같은 LIVE 경험 안에서 이어집니다.</span></div>
  </section>;
}

export function FlowReader({onBack}){
  const[index,setIndex]=useState(0);
  const[playing,setPlaying]=useState(false);
  const[speed,setSpeed]=useState("normal");
  const timerRef=useRef(null);

  useEffect(()=>{
    window.clearTimeout(timerRef.current);
    if(!playing)return undefined;
    timerRef.current=window.setTimeout(()=>{
      if(index>=FLOW_LINES.length-1){setPlaying(false);return;}
      setIndex(current=>current+1);
    },SPEEDS[speed].delay);
    return()=>window.clearTimeout(timerRef.current);
  },[index,playing,speed]);

  const move=offset=>{
    setIndex(current=>Math.max(0,Math.min(FLOW_LINES.length-1,current+offset)));
  };
  const restart=()=>{setIndex(0);setPlaying(false)};
  const progress=((index+1)/FLOW_LINES.length)*100;

  return <section className="flowReaderPage">
    <button className="back" onClick={onBack}>‹ 읽기 방식 선택</button>
    <header className="flowHeader">
      <div><small>쪽GO FLOW · PUBLIC DOMAIN 01</small><h1>운수 좋은 날</h1><p>현진건 · 1924</p></div>
      <div className="rightsBadge"><ShieldCheck/><span><b>이용 확인 완료</b><small>만료저작물 · 자유이용</small></span></div>
    </header>

    <div className="flowStage" aria-live="polite">
      <div className="flowStageMeta"><span>EXCERPT {String(index+1).padStart(2,"0")}</span><span>{Math.round(progress)}%</span></div>
      <div className="flowContext previous">{index>0?FLOW_LINES[index-1]:"—"}</div>
      <p className="flowActiveLine">{FLOW_LINES[index]}</p>
      <div className="flowContext next">{index<FLOW_LINES.length-1?FLOW_LINES[index+1]:"이 시범 구간을 모두 읽었습니다."}</div>
      <div className="flowProgress" aria-label={`읽기 진행률 ${Math.round(progress)}퍼센트`}><i style={{width:`${progress}%`}}/></div>
    </div>

    <div className="flowControls">
      <button onClick={()=>move(-1)} disabled={index===0}>← 이전 문장</button>
      <button className="flowPlay" onClick={()=>setPlaying(value=>!value)}>{playing?<Pause/>:<Play/>}{playing?"잠시 멈춤":"FLOW 시작"}</button>
      <button onClick={()=>move(1)} disabled={index===FLOW_LINES.length-1}>다음 문장 →</button>
    </div>
    <div className="flowSettings">
      <div><small>READING PACE</small>{Object.entries(SPEEDS).map(([key,item])=><button key={key} className={speed===key?"active":""} onClick={()=>setSpeed(key)}>{item.label}</button>)}</div>
      <button className="flowRestart" onClick={restart}><RotateCcw/> 처음부터</button>
    </div>

    <aside className="flowRights">
      <ShieldCheck/>
      <div><small>RIGHTS &amp; SOURCE</small><b>원문 이용 근거를 작품마다 먼저 확인합니다.</b><p>이 시범 콘텐츠는 한국저작권위원회 공유마당에서 만료저작물로 제공하는 원문을 기준으로 구성했습니다. 현대 출판사의 표지·편집·해설은 사용하지 않습니다.</p><a href={SOURCE_URL} target="_blank" rel="noreferrer">공식 원문과 이용정보 보기 ↗</a><em>출처: 한국저작권위원회 공유마당 · G905-9002094</em></div>
    </aside>
    <div className="flowBetaNote"><b>FLOW BETA</b><span>현재는 읽기 리듬을 확인하는 시범 구간입니다. 다음 단계에서 LIVE 참여자 간 낭독 순서와 음성을 연결합니다.</span></div>
  </section>;
}
