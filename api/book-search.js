const NATIONAL_LIBRARY_URL="https://www.nl.go.kr/seoji/SearchApi.do";
const MAX_QUERY_LENGTH=100;
const MAX_RESULTS=30;

function text(value){
  return String(value||"").replace(/<[^>]*>/g,"").trim();
}

function cleanIsbn(value){
  return String(value||"").replace(/[^0-9X]/gi,"").toUpperCase();
}

function coverUrl(value){
  const url=text(value);
  if(!url)return "";
  if(url.startsWith("https://"))return url;
  if(url.startsWith("http://"))return `https://${url.slice(7)}`;
  return "";
}

function catalogBook(document){
  const isbn=cleanIsbn(document.EA_ISBN||document.ISBN);
  return {
    source:"national_library",
    externalId:text(document.CONTROL_NO)||isbn,
    title:text(document.TITLE)||"제목 없음",
    author:text(document.AUTHOR),
    publisher:text(document.PUBLISHER),
    publishedDate:text(document.PUBLISH_PREDATE),
    isbn10:isbn.length===10?isbn:"",
    isbn13:isbn.length===13?isbn:"",
    coverUrl:coverUrl(document.TITLE_URL)
  };
}

function documents(payload){
  if(Array.isArray(payload))return payload;
  for(const key of ["docs","items","data","result"]){
    if(Array.isArray(payload?.[key]))return payload[key];
  }
  return [];
}

async function requestCatalog(apiKey,query,field,limit,signal){
  const params=new URLSearchParams({
    cert_key:apiKey,
    result_style:"json",
    page_no:"1",
    page_size:String(limit),
    [field]:query
  });
  const response=await fetch(`${NATIONAL_LIBRARY_URL}?${params}`,{signal});
  if(!response.ok)throw new Error("NATIONAL_LIBRARY_REQUEST_FAILED");
  const payload=await response.json();
  return documents(payload).map(catalogBook).filter(book=>book.title!=="제목 없음");
}

function resultKey(book){
  return book.isbn13||book.isbn10||`${book.title}|${book.author}`.toLocaleLowerCase();
}

export default async function handler(request,response){
  if(request.method!=="GET"){
    response.setHeader("Allow","GET");
    return response.status(405).json({error:"METHOD_NOT_ALLOWED"});
  }

  const apiKey=process.env.NL_BOOK_API_KEY;
  if(!apiKey)return response.status(503).json({error:"NATIONAL_LIBRARY_NOT_CONFIGURED"});

  const query=text(Array.isArray(request.query?.q)?request.query.q[0]:request.query?.q);
  const limit=Math.min(Math.max(Number(request.query?.limit)||20,1),MAX_RESULTS);
  if(query.length<2||query.length>MAX_QUERY_LENGTH){
    return response.status(400).json({error:"INVALID_QUERY"});
  }

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const isbn=cleanIsbn(query);
    const fields=isbn.length===10||isbn.length===13?["isbn"]:["title","author"];
    const settled=await Promise.allSettled(
      fields.map(field=>requestCatalog(apiKey,field==="isbn"?isbn:query,field,limit,controller.signal))
    );
    const unique=new Map();
    settled.flatMap(result=>result.status==="fulfilled"?result.value:[]).forEach(book=>{
      const key=resultKey(book);
      if(!unique.has(key))unique.set(key,book);
    });
    if(!unique.size&&settled.every(result=>result.status==="rejected")){
      return response.status(502).json({error:"NATIONAL_LIBRARY_UNAVAILABLE"});
    }
    response.setHeader("Cache-Control","s-maxage=86400, stale-while-revalidate=604800");
    return response.status(200).json({books:[...unique.values()].slice(0,limit)});
  }catch(error){
    const code=error?.name==="AbortError"?"NATIONAL_LIBRARY_TIMEOUT":"NATIONAL_LIBRARY_UNAVAILABLE";
    return response.status(502).json({error:code});
  }finally{
    clearTimeout(timeout);
  }
}
