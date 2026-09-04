import {useEffect,useMemo,useState} from "react";
import {readReadingProgress} from "../services/readingProgress";

const STAMPS=[
  {id:"first-voice",mark:"VOICE",title:"첫 목소리",description:"첫 낭독 녹음",field:"recordings",target:1,color:"orange"},
  {id:"ten-pages",mark:"10P",title:"열 쪽의 시작",description:"누적 10쪽 낭독",field:"pagesNarrated",target:10,color:"lime"},
  {id:"hundred-pages",mark:"100P",title:"백 쪽의 목소리",description:"누적 100쪽 낭독",field:"pagesNarrated",target:100,color:"blue"},
  {id:"first-book",mark:"01",title:"첫 번째 완독",description:"책 1권 낭독 완료",field:"completedBooks",target:1,color:"orange"},
  {id:"five-books",mark:"05",title:"다섯 권의 여행",description:"책 5권 낭독 완료",field:"completedBooks",target:5,color:"lime"},
  {id:"together",mark:"WITH",title:"함께 읽는 사람",description:"함께 낭독 5회",field:"sharedSessions",target:5,color:"blue"},
  {id:"flow",mark:"FLOW",title:"목소리의 릴레이",description:"FLOW 참여 10회",field:"flowSessions",target:10,color:"orange"},
  {id:"podcast",mark:"CAST",title:"첫 번째 에피소드",description:"팟캐스트 초안 완성",field:"podcastDrafts",target:1,color:"lime"}
];

export function StampBook({session}){
  const[progress,setProgress]=useState(()=>readReadingProgress(session));
  useEffect(()=>{
    setProgress(readReadingProgress(session));
    const update=event=>setProgress(event.detail||readReadingProgress(session));
    window.addEventListener("jjokgo:progress",update);
    return()=>window.removeEventListener("jjokgo:progress",update);
  },[session?.user?.id]);
  const completed=useMemo(()=>STAMPS.filter(stamp=>progress[stamp.field]>=stamp.target).length,[progress]);

  return <section className="stampBook" aria-labelledby="stamp-book-title">
    <header className="stampBookHeader">
      <div><small>JJOKGO STAMP BOOK · VOL. 01</small><h3 id="stamp-book-title">목소리로 채우는 독서 여권</h3><p>낭독을 마칠 때마다 스탬프가 자동으로 채워져요. 연속 출석이 끊겨도 이미 모은 기록은 사라지지 않습니다.</p></div>
      <div className="stampBookCount"><b>{completed}</b><span>/ {STAMPS.length}</span><small>COLLECTED</small></div>
    </header>
    <div className="stampGrid">
      {STAMPS.map(stamp=>{
        const value=progress[stamp.field]||0;
        const ratio=Math.min(1,value/stamp.target);
        const earned=ratio>=1;
        return <article key={stamp.id} className={`stampCard ${stamp.color} ${earned?"earned":""}`}>
          <div className="stampSeal" style={{"--stamp-progress":`${ratio*360}deg`}}><span>{stamp.mark}</span></div>
          <div className="stampCopy"><small>{earned?"STAMPED":"IN PROGRESS"}</small><b>{stamp.title}</b><span>{stamp.description}</span></div>
          <div className="stampProgress" role="progressbar" aria-label={`${stamp.title} 진행률`} aria-valuemin="0" aria-valuemax={stamp.target} aria-valuenow={Math.min(value,stamp.target)}><i style={{width:`${ratio*100}%`}}/></div>
          <em>{Math.min(value,stamp.target)} / {stamp.target}</em>
        </article>;
      })}
    </div>
    <footer><b>한 쪽씩 쌓아, 나만의 독서 지도를 완성해요.</b><span>음성 내용은 사용하지 않고 달성에 필요한 횟수와 쪽수만 기록합니다.</span></footer>
  </section>;
}
