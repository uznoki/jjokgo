import{useEffect,useState}from"react";
import{BookOpen,ChevronRight}from"lucide-react";
import{supabase}from"../supabase";
import{BOOK_FIELDS}from"../services/readingRooms";

export function Library({session,openRoom}){
  const[items,setItems]=useState([]);
  const[loading,setLoading]=useState(true);
  const[message,setMessage]=useState("");

  useEffect(()=>{
    let active=true;
    async function load(){
      setLoading(true);setMessage("");
      const{data,error}=await supabase.from("reading_room_members")
        .select(`role,joined_at,reading_rooms(id,name,is_private,books(${BOOK_FIELDS}))`)
        .eq("user_id",session.user.id)
        .order("joined_at",{ascending:false});
      if(!active)return;
      if(error){console.error("Library load failed",error);setMessage("내 서재를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");setItems([])}
      else{
        const unique=new Map();
        for(const membership of data||[]){
          const room=membership.reading_rooms;
          if(!room?.books)continue;
          const key=room.books.id||`${room.books.title}-${room.books.author||""}`;
          if(!unique.has(key))unique.set(key,{book:room.books,room,role:membership.role});
        }
        setItems([...unique.values()]);
      }
      setLoading(false);
    }
    load();
    return()=>{active=false};
  },[session.user.id]);

  return <section className="libraryPage">
    <div className="libraryHeading"><small>MY LIBRARY</small><h1>내 서재</h1><p>읽기방에서 함께 읽고 있는 책을 한곳에 모았어요.</p></div>
    <div className="librarySummary"><b>{items.length}</b><span>나의 책</span></div>
    {message&&<div className="roomMessage" role="status">{message}</div>}
    {loading&&<div className="loading">내 서재 불러오는 중…</div>}
    {!loading&&!message&&items.length===0&&<div className="emptyLibrary"><BookOpen/><b>아직 서재에 책이 없어요</b><small>읽기방에 참여하거나 방을 만들면 책이 이곳에 모여요.</small></div>}
    {!loading&&items.length>0&&<div className="libraryGrid">{items.map(({book,room})=><button key={book.id||room.id} className="libraryBook" onClick={()=>openRoom(room)}>
      <div className="libraryCover">{book.cover_url?<img src={book.cover_url} alt=""/>:<BookOpen/>}</div>
      <span><small>읽는 중</small><b>{book.title}</b><em>{book.author||"저자 정보 없음"}</em><i>{room.name}</i></span><ChevronRight/>
    </button>)}</div>}
  </section>;
}
