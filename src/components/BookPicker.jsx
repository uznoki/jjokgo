import {useRef,useState} from "react";
import {BookOpen,Check,Search} from "lucide-react";
import {searchBookCatalog} from "../services/bookCatalog";
import {supabase} from "../supabase";

const emptyManual={title:"",author:"",publisher:"",publishedDate:"",isbn10:"",isbn13:"",coverUrl:""};
const LOCAL_BOOK_FIELDS="id,title,author,publisher,published_date,isbn_10,isbn_13,cover_url,source,external_id";

function localBook(book){
  return {
    id:book.id,source:book.source||"manual",externalId:book.external_id||"",
    title:book.title,author:book.author||"",publisher:book.publisher||"",
    publishedDate:book.published_date||"",isbn10:book.isbn_10||"",isbn13:book.isbn_13||"",coverUrl:book.cover_url||""
  };
}

function mergeBooks(...groups){
  const unique=new Map();
  groups.flat().filter(Boolean).forEach(book=>{
    const key=book.isbn13||book.isbn10||`${book.title}|${book.author}`.toLocaleLowerCase();
    if(!unique.has(key))unique.set(key,book);
  });
  return [...unique.values()].slice(0,30);
}

function BookCover({book}){
  return <div className="bookResultCover">
    {book.coverUrl?<img src={book.coverUrl} alt=""/>:<BookOpen aria-hidden="true"/>}
  </div>;
}

export default function BookPicker({selected,onSelect}){
  const [query,setQuery]=useState("");
  const [results,setResults]=useState([]);
  const [searching,setSearching]=useState(false);
  const [searched,setSearched]=useState(false);
  const [message,setMessage]=useState("");
  const [manualOpen,setManualOpen]=useState(false);
  const [detailsOpen,setDetailsOpen]=useState(false);
  const [manual,setManual]=useState(emptyManual);
  const abortRef=useRef(null);

  async function search(event){
    event.preventDefault();
    const keyword=query.trim();
    if(keyword.length<2){setMessage("두 글자 이상 입력해주세요.");return;}
    abortRef.current?.abort();
    const controller=new AbortController();
    abortRef.current=controller;
    setSearching(true);
    setSearched(false);
    setMessage("");
    try{
      const pattern=`%${keyword}%`;
      const [catalogResult,titleResult,authorResult]=await Promise.all([
        searchBookCatalog(keyword,{signal:controller.signal}).catch(()=>[]),
        supabase.from("books").select(LOCAL_BOOK_FIELDS).ilike("title",pattern).limit(12),
        supabase.from("books").select(LOCAL_BOOK_FIELDS).ilike("author",pattern).limit(12)
      ]);
      const localResults=[...(titleResult.data||[]),...(authorResult.data||[])].map(localBook);
      const nextResults=mergeBooks(localResults,catalogResult);
      setResults(nextResults);
      setSearched(true);
      if(titleResult.error&&authorResult.error&&!catalogResult.length){
        setMessage("도서 검색 설정을 확인해주세요. 찾는 책은 직접 등록할 수 있어요.");
      }
    }catch(error){
      if(error.name!=="AbortError")setMessage("도서 검색 서비스에 연결하지 못했어요. 직접 책을 등록할 수 있어요.");
    }finally{
      if(abortRef.current===controller)setSearching(false);
    }
  }

  function choose(book){
    onSelect(book);
    setManualOpen(false);
    setMessage("");
  }

  function chooseManual(){
    if(!manual.title.trim()||!manual.author.trim()){
      setMessage("임시 등록에는 책 제목과 저자가 필요해요.");
      return;
    }
    choose({...manual,source:"manual",externalId:"",title:manual.title.trim(),author:manual.author.trim()});
  }

  return <section className="bookPicker" aria-labelledby="book-picker-title">
    <div className="bookPickerHeading">
      <div><b id="book-picker-title">읽을 책</b><small>제목·저자·ISBN으로 도서관처럼 검색해보세요.</small></div>
      {selected&&<button type="button" className="bookChange" onClick={()=>onSelect(null)}>다시 선택</button>}
    </div>

    {selected?<div className="selectedBook"><BookCover book={selected}/><div><small>선택한 책</small><b>{selected.title}</b><span>{selected.author||"저자 정보 없음"}</span>{selected.publisher&&<span>{selected.publisher}</span>}</div><Check/></div>:<>
      <form className="bookSearch" onSubmit={search}>
        <Search aria-hidden="true"/>
        <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="예: 어린 왕자, 생텍쥐페리, ISBN" aria-label="도서 검색어"/>
        <button disabled={searching}>{searching?"검색 중…":"검색"}</button>
      </form>

      {results.length>0&&<div className="bookResults" role="listbox" aria-label="도서 검색 결과">
        {results.map(book=><button type="button" key={`${book.source}-${book.externalId||book.title}`} onClick={()=>choose(book)}>
          <BookCover book={book}/><span><b>{book.title}</b><small>{book.author||"저자 정보 없음"}</small><small>{[book.publisher,book.publishedDate,book.isbn13].filter(Boolean).join(" · ")}</small></span>
        </button>)}
      </div>}

      {searched&&results.length===0&&<div className="bookEmpty">검색 결과가 없어요. 아래에서 직접 등록해주세요.</div>}
      {message&&<div className="bookPickerMessage" role="status">{message}</div>}

      <button type="button" className="manualBookToggle" onClick={()=>setManualOpen(value=>!value)}>
        {manualOpen?"직접 등록 닫기":"찾는 책이 없나요? 직접 책 추가"}
      </button>
      {manualOpen&&<div className="manualBookForm">
        <label>책 제목<input maxLength="300" value={manual.title} onChange={event=>setManual({...manual,title:event.target.value})} placeholder="필수"/></label>
        <label>저자<input maxLength="300" value={manual.author} onChange={event=>setManual({...manual,author:event.target.value})} placeholder="필수"/></label>
        <button type="button" className="bookDetailsToggle" onClick={()=>setDetailsOpen(value=>!value)}>{detailsOpen?"상세 정보 접기":"표지·출판사·ISBN도 입력하기 (선택)"}</button>
        {detailsOpen&&<div className="manualBookDetails">
          <label>출판사<input maxLength="300" value={manual.publisher} onChange={event=>setManual({...manual,publisher:event.target.value})}/></label>
          <label>출간일<input maxLength="32" value={manual.publishedDate} onChange={event=>setManual({...manual,publishedDate:event.target.value})} placeholder="예: 2026-08-20"/></label>
          <label>ISBN-13<input inputMode="numeric" maxLength="17" value={manual.isbn13} onChange={event=>setManual({...manual,isbn13:event.target.value})}/></label>
          <label>ISBN-10<input maxLength="13" value={manual.isbn10} onChange={event=>setManual({...manual,isbn10:event.target.value})}/></label>
          <label>표지 이미지 주소<input type="url" maxLength="2048" pattern="https://.*" value={manual.coverUrl} onChange={event=>setManual({...manual,coverUrl:event.target.value})} placeholder="https://"/></label>
        </div>}
        <button type="button" className="manualBookSelect" onClick={chooseManual}>이 정보로 책 선택</button>
      </div>}
    </>}
    <small className="catalogCredit">기본 검색 데이터: Open Library · Google Books 키 설정 시 통합 검색</small>
  </section>;
}
