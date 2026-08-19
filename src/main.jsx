import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BookOpen,Home,Library,Mic,Pause,Play,RotateCcw,Square,UserRound,ChevronLeft,Heart,Share2} from 'lucide-react';
import './style.css';

const books=[
 {id:1,title:'어린 왕자',author:'앙투안 드 생텍쥐페리',progress:78,readers:382,emoji:'🌟',tone:'night'},
 {id:2,title:'홍길동전',author:'허균',progress:53,readers:128,emoji:'📜',tone:'forest'},
 {id:3,title:'데미안',author:'헤르만 헤세',progress:41,readers:96,emoji:'◐',tone:'black'},
 {id:4,title:'소나기',author:'황순원',progress:57,readers:142,emoji:'☔',tone:'cloud'}
];
const pages=[
 {n:1,title:'어느 날의 시작',reader:'낭독 완료',duration:'01:24'},
 {n:2,title:'코끼리를 삼킨 보아뱀 그림',reader:'낭독 완료',duration:'01:37'},
 {n:3,title:'어른들의 세계',reader:'낭독 완료',duration:'02:08'},
 {n:4,title:'작은 왕자의 별',reader:'아직 읽은 사람이 없어요',duration:null},
 {n:5,title:'장미',reader:'낭독 완료',duration:'01:55'}
];

function App(){
 const [view,setView]=useState('home'); const [book,setBook]=useState(books[0]); const [page,setPage]=useState(pages[3]);
 const [recording,setRecording]=useState(false); const [audio,setAudio]=useState(null); const [saved,setSaved]=useState([]);
 const recorder=useRef(null), chunks=useRef([]);
 const openBook=b=>{setBook(b);setView('book')};
 async function start(){
   try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    chunks.current=[]; recorder.current=new MediaRecorder(stream);
    recorder.current.ondataavailable=e=>chunks.current.push(e.data);
    recorder.current.onstop=()=>{const blob=new Blob(chunks.current,{type:'audio/webm'});setAudio(URL.createObjectURL(blob));stream.getTracks().forEach(t=>t.stop())};
    recorder.current.start(); setRecording(true);
   }catch(e){alert('마이크 사용 권한이 필요해요. 브라우저 설정에서 마이크를 허용해 주세요.')}
 }
 function stop(){recorder.current?.stop();setRecording(false)}
 function save(){if(!audio)return;setSaved(s=>[{book:book.title,page:page.n,title:page.title,audio,date:new Date().toLocaleDateString('ko-KR')},...s]);setView('done')}
 return <div className="app">
   <header><button className="logo" onClick={()=>setView('home')}>쪽고</button><nav><button onClick={()=>setView('home')}>홈</button><button onClick={()=>setView('discover')}>둘러보기</button><button onClick={()=>setView('my')}>내 활동</button></nav><div className="avatar">J</div></header>
   <main>
    {view==='home'&&<><section className="hero"><div><span className="eyebrow">TOGETHER, ONE PAGE AT A TIME</span><h1>한 쪽의 글,<br/>한 사람의 목소리.<br/><b>우리가 함께 한 권을 읽습니다.</b></h1><p>좋아하는 책의 한 쪽을 골라 당신의 목소리로 이어주세요.</p><button className="primary" onClick={()=>openBook(books[0])}><Mic size={18}/> 오늘 한 쪽 읽기</button></div><div className="heroArt"><div className="bookIcon">📖</div><div className="wave">▂▅▃▇▆▃▅▂▆▇▃▅</div></div></section>
    <Section title="함께 읽고 있어요">{books.map(b=><BookCard key={b.id} b={b} open={()=>openBook(b)}/>)}</Section></>}
    {view==='discover'&&<><div className="pageHead"><span className="eyebrow">DISCOVER</span><h2>어떤 책을 함께 읽어볼까요?</h2><p>목소리들이 모여 한 권의 이야기가 됩니다.</p></div><div className="grid">{books.map(b=><BookCard key={b.id} b={b} open={()=>openBook(b)}/>)}</div></>}
    {view==='book'&&<><Back go={()=>setView('home')}/><div className="bookHero"><Cover b={book}/><div><span className="eyebrow">함께 읽는 책</span><h2>{book.title}</h2><p>{book.author}</p><strong>{book.readers}명이 함께 읽는 중</strong><Progress n={book.progress}/></div></div><div className="timeline"><h3>낭독 타임라인</h3>{pages.map(p=><div className={'pageRow '+(!p.duration?'empty':'')} key={p.n}><div className="num">{p.n}</div><div className="grow"><b>{p.title}</b><small>{p.reader}</small></div>{p.duration?<button className="round"><Play size={16}/></button>:<button className="readBtn" onClick={()=>{setPage(p);setAudio(null);setView('record')}}><Mic size={15}/> 이 쪽 읽기</button>}</div>)}</div></>}
    {view==='record'&&<><Back go={()=>setView('book')}/><div className="record"><span className="eyebrow">{book.title} · {page.n}쪽</span><h2>{page.title}</h2><div className="script">이곳에는 출판사와의 계약 또는 저작권이 만료된 작품의 본문이 표시됩니다.<br/><br/>문장을 천천히 바라보고, 당신만의 속도로 읽어주세요.</div><div className={'visual '+(recording?'live':'')}>▂▅▃▇▆▃▅▂▆▇▃▅▇▂▅▃▆</div><p className="hint">{recording?'낭독 중이에요…':'준비되면 아래 버튼을 눌러주세요.'}</p>{!recording&&!audio&&<button className="recordButton" onClick={start}><Mic/></button>}{recording&&<button className="recordButton stop" onClick={stop}><Square/></button>}{audio&&<div className="audioBox"><audio controls src={audio}/><div className="actions"><button onClick={()=>setAudio(null)}><RotateCcw size={17}/> 다시 녹음</button><button className="primary" onClick={save}>낭독 등록</button></div></div>}</div></>}
    {view==='done'&&<div className="success"><div className="confetti">🎉</div><h2>낭독이 등록되었어요!</h2><p>함께 만들어가는 한 권의 책에<br/>당신의 목소리가 추가되었습니다.</p><button className="primary" onClick={()=>setView('my')}>내 낭독 페이지 보기</button><button className="ghost" onClick={()=>setView('home')}>홈으로</button></div>}
    {view==='my'&&<><div className="profile"><div className="bigAvatar">J</div><div><span className="eyebrow">MY JJOKGO</span><h2>나의 목소리 서재</h2><p>내가 읽은 쪽 {saved.length}</p></div></div><div className="timeline"><h3>내가 읽은 쪽</h3>{saved.length===0?<div className="emptyState">아직 남긴 낭독이 없어요.<button className="primary" onClick={()=>openBook(books[0])}>첫 한 쪽 읽기</button></div>:saved.map((s,i)=><div className="saved" key={i}><div><b>{s.book}</b><p>{s.page}쪽 · {s.title}</p><small>{s.date}</small></div><audio controls src={s.audio}/></div>)}</div></>}
   </main>
   <footer><b>쪽고 JJOKGO</b><span>One page. One voice. Together.</span></footer>
   <div className="mobileNav"><button onClick={()=>setView('home')}><Home/><small>홈</small></button><button onClick={()=>setView('discover')}><Library/><small>둘러보기</small></button><button onClick={()=>setView('my')}><UserRound/><small>내 활동</small></button></div>
 </div>
}
function Back({go}){return <button className="back" onClick={go}><ChevronLeft/> 돌아가기</button>}
function Progress({n}){return <div className="progressWrap"><div className="progress"><i style={{width:n+'%'}}/></div><span>{n}%</span></div>}
function Cover({b}){return <div className={'cover '+b.tone}><span>{b.emoji}</span><b>{b.title}</b><small>{b.author}</small></div>}
function BookCard({b,open}){return <button className="card" onClick={open}><Cover b={b}/><div className="cardText"><b>{b.title}</b><small>{b.author}</small><span>{b.readers}명이 함께 읽는 중</span><Progress n={b.progress}/></div></button>}
function Section({title,children}){return <section className="section"><div className="sectionTitle"><h2>{title}</h2><span>한 목소리씩, 책이 완성되고 있어요.</span></div><div className="grid">{children}</div></section>}
createRoot(document.getElementById('root')).render(<App/>);
