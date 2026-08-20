const OPEN_LIBRARY_URL="https://openlibrary.org/search.json";
const GOOGLE_BOOKS_URL="https://www.googleapis.com/books/v1/volumes";

function cleanIsbn(value){
  return String(value||"").replace(/[^0-9X]/gi,"").toUpperCase();
}

function isbnValues(values=[]){
  const cleaned=values.map(cleanIsbn).filter(Boolean);
  return {
    isbn10:cleaned.find(value=>value.length===10)||"",
    isbn13:cleaned.find(value=>value.length===13)||""
  };
}

function openLibraryBook(document){
  const isbns=isbnValues(document.isbn);
  return {
    source:"open_library",
    externalId:String(document.key||"").replace(/^\//,""),
    title:document.title||"제목 없음",
    author:(document.author_name||[]).join(", "),
    publisher:(document.publisher||[])[0]||"",
    publishedDate:document.first_publish_year?String(document.first_publish_year):"",
    isbn10:isbns.isbn10,
    isbn13:isbns.isbn13,
    coverUrl:document.cover_i?`https://covers.openlibrary.org/b/id/${document.cover_i}-M.jpg`:""
  };
}

function googleBook(item){
  const info=item.volumeInfo||{};
  const isbns=isbnValues((info.industryIdentifiers||[]).map(identifier=>identifier.identifier));
  return {
    source:"google_books",
    externalId:item.id||"",
    title:info.title||"제목 없음",
    author:(info.authors||[]).join(", "),
    publisher:info.publisher||"",
    publishedDate:info.publishedDate||"",
    isbn10:isbns.isbn10,
    isbn13:isbns.isbn13,
    coverUrl:String(info.imageLinks?.thumbnail||info.imageLinks?.smallThumbnail||"").replace(/^http:/,"https:")
  };
}

function resultKey(book){
  return book.isbn13||book.isbn10||`${book.title}|${book.author}`.toLocaleLowerCase();
}

export async function searchBookCatalog(query,{signal}={}){
  const keyword=query.trim();
  if(keyword.length<2)return [];

  const openLibraryParams=new URLSearchParams({
    q:keyword,
    lang:"ko",
    limit:"18",
    fields:"key,title,author_name,publisher,first_publish_year,isbn,cover_i"
  });
  const requests=[
    fetch(`${OPEN_LIBRARY_URL}?${openLibraryParams}`,{signal})
      .then(response=>response.ok?response.json():Promise.reject(new Error("OPEN_LIBRARY_FAILED")))
      .then(data=>(data.docs||[]).map(openLibraryBook))
  ];

  const googleKey=import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;
  if(googleKey){
    const googleParams=new URLSearchParams({
      q:keyword,
      maxResults:"18",
      printType:"books",
      orderBy:"relevance",
      key:googleKey
    });
    requests.push(
      fetch(`${GOOGLE_BOOKS_URL}?${googleParams}`,{signal})
        .then(response=>response.ok?response.json():Promise.reject(new Error("GOOGLE_BOOKS_FAILED")))
        .then(data=>(data.items||[]).map(googleBook))
    );
  }

  const settled=await Promise.allSettled(requests);
  const books=settled.flatMap(result=>result.status==="fulfilled"?result.value:[]);
  if(!books.length&&settled.every(result=>result.status==="rejected"))throw new Error("CATALOG_UNAVAILABLE");

  const unique=new Map();
  books.forEach(book=>{
    const key=resultKey(book);
    if(!unique.has(key))unique.set(key,book);
  });
  return [...unique.values()].slice(0,24);
}
