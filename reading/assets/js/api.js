/** Book metadata only. Personal notes are never sent to these services. */
import { cleanUrl } from './domain.js';
const txt=x=>typeof x==='string'?x:'';
const array=x=>Array.isArray(x)?x:[];
const plain=x=>txt(x).replace(/<[^>]*>/g,'').trim();
const image=x=>{try{return cleanUrl(txt(x),{image:true});}catch{return '';}};
function genre(categories){const raw=array(categories).join(' ').toLowerCase();const table=[[/사회과학|social science|political|정치/,'사회/정치'],[/computer|programming|컴퓨터/,'IT/컴퓨터'],[/business|economic|경제|경영/,'경제/경영'],[/philosophy|철학/,'철학'],[/religion|bible|종교/,'종교'],[/history|역사/,'역사'],[/science|수학|과학/,'과학'],[/poetry|essay|에세이|한국시|시집/,'시/에세이'],[/fiction|novel|소설/,'소설'],[/psychology|인문|심리/,'인문'],[/self-help|자기계발/,'자기계발']];return table.find(([re])=>re.test(raw))?.[1]||'';}
async function getJson(url,signal){
  const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);
  if(signal?.aborted)throw new DOMException('취소됨','AbortError');
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(),6000);
  try{const r=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const data=await r.json();if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('응답 형식 오류');return data;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function fromGoogle(item){
  const v=item?.volumeInfo||{};
  return {title:plain(v.title),subtitle:plain(v.subtitle),authors:array(v.authors).filter(x=>typeof x==='string'),publisher:plain(v.publisher),publishedDate:txt(v.publishedDate),isbn:array(v.industryIdentifiers).find(x=>x?.type==='ISBN_13')?.identifier||array(v.industryIdentifiers)[0]?.identifier||'',pageCount:Number.isInteger(v.pageCount)&&v.pageCount>0?v.pageCount:null,genre:genre(v.categories),language:txt(v.language),origin:'',coverUrl:image(v.imageLinks?.thumbnail||v.imageLinks?.smallThumbnail),description:plain(v.description),source:'Google Books'};
}
export function fromKakao(d){
  const ids=txt(d?.isbn).split(/\s+/);
  return {title:plain(d?.title),authors:array(d?.authors).filter(x=>typeof x==='string'),translator:array(d?.translators).filter(x=>typeof x==='string').join(', '),publisher:plain(d?.publisher),publishedDate:txt(d?.datetime).slice(0,10),isbn:ids.find(x=>/^\d{13}$/.test(x))||ids[0]||'',pageCount:null,genre:'',origin:'',language:'',coverUrl:image(d?.thumbnail),description:plain(d?.contents),source:'카카오'};
}
export function fromOpenLibrary(d){return {title:plain(d?.title),authors:array(d?.author_name).filter(x=>typeof x==='string'),publisher:txt(array(d?.publisher)[0]),publishedDate:d?.first_publish_year?String(d.first_publish_year):'',isbn:txt(array(d?.isbn)[0]),pageCount:Number.isInteger(d?.number_of_pages_median)?d.number_of_pages_median:null,genre:genre(d?.subject),language:'',origin:'',coverUrl:Number.isInteger(d?.cover_i)?`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`:'',source:'Open Library'};}
export function fromProxy(d){return {title:plain(d?.title),authors:array(d?.authors).filter(x=>typeof x==='string'),translator:plain(d?.translator),publisher:plain(d?.publisher),publishedDate:txt(d?.publishedDate),isbn:txt(d?.isbn),pageCount:Number.isInteger(d?.pageCount)&&d.pageCount>0?d.pageCount:null,genre:plain(d?.genre),language:txt(d?.language),origin:'',coverUrl:image(d?.coverUrl),description:plain(d?.description),source:plain(d?.source)||'도서 검색'};}
export function parseAladinAuthors(raw){
  const authors=[],translators=[];
  for(const part of plain(raw).split(',')){
    const value=part.trim();if(!value)continue;
    const match=/^(.*?)\s*\(([^)]*)\)\s*$/.exec(value),name=plain(match?.[1]??value),role=plain(match?.[2]??'');
    if(!name)continue;
    if(/\uc62e\uae34\uc774|\ubc88\uc5ed|\uc5ed\uc790/.test(role))translators.push(name);
    else if(!role||/\uc9c0\uc740\uc774|\uc800\uc790|\uae00\uc4f4\uc774|\uae00|\uc6d0\uc791|\uc791\uac00|\uc500/.test(role))authors.push(name);
    // 그림·사진·엮은이·감수·기획 등 저자가 아닌 역할은 서지 저자 목록에 넣지 않는다.
  }
  return {authors,translator:translators.join(', ')};
}
export function fromAladin(d){
  const who=parseAladinAuthors(d?.author),pages=Number(d?.subInfo?.itemPage);
  return {title:plain(d?.title),authors:who.authors,translator:who.translator,publisher:plain(d?.publisher),publishedDate:txt(d?.pubDate),isbn:txt(d?.isbn13||d?.isbn),pageCount:Number.isInteger(pages)&&pages>0?pages:null,genre:genre([d?.categoryName]),origin:'',language:'',coverUrl:image(d?.cover),description:plain(d?.description),source:'알라딘'};
}
function aladinJsonp(query,key,signal){
  return new Promise((resolve,reject)=>{
    const cb='__reading_'+Math.random().toString(36).slice(2),script=document.createElement('script');let settled=false;
    const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);script.remove();globalThis[cb]=()=>{};setTimeout(()=>{delete globalThis[cb];},30000);};
    const finish=(err,data)=>{if(settled)return;settled=true;clean();err?reject(err):resolve(data);};
    const abort=()=>finish(new DOMException('취소됨','AbortError'));
    const timer=setTimeout(()=>finish(new Error('알라딘 응답 시간 초과')),6000);
    if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
    globalThis[cb]=data=>finish(null,data);script.onerror=()=>finish(new Error('알라딘 연결 실패'));
    const u=new URL('https://www.aladin.co.kr/ttb/api/ItemSearch.aspx');
    for(const [k,v]of Object.entries({ttbkey:key,Query:query,QueryType:'Keyword',MaxResults:'12',SearchTarget:'Book',Cover:'Big',OptResult:'itemPage',Version:'20131101',output:'js',Callback:cb}))u.searchParams.set(k,v);
    script.src=u.href;script.referrerPolicy='no-referrer';document.head.append(script);
  });
}
async function fromAladinQuery(query,key,signal){
  const data=await aladinJsonp(query,key,signal);if(!data||data.errorCode||!Array.isArray(data.item))throw new Error('알라딘 응답 오류');
  return data.item.map(fromAladin);
}
export async function searchBooks(query,settings={},signal){
  const q=String(query||'').trim();if(!q)return {items:[],warnings:[]};
  const providers=[];
  if(settings.kakaoProxyUrl)providers.push(['국내 도서',async()=>{const u=new URL(cleanUrl(settings.kakaoProxyUrl));u.searchParams.set('query',q.replace(/^(\d[\d-]+)$/,(s)=>s.replace(/-/g,'')));u.searchParams.set('size','12');if(/^[\d-]{10,17}$/.test(q))u.searchParams.set('target','isbn');const data=await getJson(u.href,signal);if(Array.isArray(data.items))return data.items.map(fromProxy);if(Array.isArray(data.documents))return data.documents.map(fromKakao);throw new Error('도서 검색 프록시 응답 형식 오류');}]);
  providers.push(['Google Books',async()=>{const gq=/^[\d-]{10,17}$/.test(q)?'isbn:'+q.replace(/-/g,''):q;const d=await getJson('https://www.googleapis.com/books/v1/volumes?maxResults=12&printType=books&q='+encodeURIComponent(gq),signal);if(d.items!==undefined&&!Array.isArray(d.items))throw new Error('Google 응답 형식 오류');return array(d.items).map(fromGoogle);}]);
  providers.push(['Open Library',async()=>{const d=await getJson('https://openlibrary.org/search.json?limit=12&fields=title,author_name,publisher,first_publish_year,isbn,cover_i,number_of_pages_median,subject&q='+encodeURIComponent(q),signal);if(!Array.isArray(d.docs))throw new Error('Open Library 응답 형식 오류');return d.docs.map(fromOpenLibrary);}]);
  const warnings=[];let successes=0;
  for(const [name,fetcher]of providers){
    if(signal?.aborted)throw new DOMException('취소됨','AbortError');
    try{const items=(await fetcher()).filter(x=>x.title);successes++;if(items.length)return{items,warnings};}
    catch(e){if(signal?.aborted)throw e;warnings.push(name+' 조회 실패');}
  }
  if(!successes)throw new Error('책 정보를 불러오지 못했어요. 인터넷 연결을 확인하거나 제목만 직접 입력해 주세요.');
  return {items:[],warnings};
}

const compactIsbn=value=>String(value||'').replace(/[^0-9Xx]/g,'').toUpperCase();
function isbn13(value){const isbn=compactIsbn(value);if(/^\d{13}$/.test(isbn))return isbn;if(!/^\d{9}[\dX]$/.test(isbn))return '';const core='978'+isbn.slice(0,9);let sum=0;for(let i=0;i<12;i++)sum+=Number(core[i])*(i%2?3:1);return core+String((10-sum%10)%10);}
function exactIsbn(item,isbn){const wanted=isbn13(isbn);return String(item?.isbn||'').split(/\s+/).some(value=>isbn13(value)===wanted);}
function uniqueCovers(items){const seen=new Set();return items.filter(item=>{if(!item.coverUrl||seen.has(item.coverUrl))return false;seen.add(item.coverUrl);return true;});}
/** Return exact-ISBN cover candidates in durable preference order. Image loading is
 * deliberately verified by the UI before any candidate is stored.
 */
export async function coverCandidates(book,settings={},signal){
  const isbn=compactIsbn(book?.isbn);if(!/^(?:\d{9}[\dX]|\d{13})$/.test(isbn))return {items:[],warnings:['ISBN이 없어 자동 복구에서 건너뛰었어요.']};
  const jobs=[];
  if(settings.kakaoProxyUrl)jobs.push(['국내 도서',async()=>{const u=new URL(cleanUrl(settings.kakaoProxyUrl));u.searchParams.set('action','cover');u.searchParams.set('query',isbn);u.searchParams.set('isbn',isbn);if(book?.title)u.searchParams.set('title',book.title);const data=await getJson(u.href,signal),found=Array.isArray(data.items)?data.items.map(fromProxy):Array.isArray(data.documents)?data.documents.map(fromKakao):[];return found.filter(item=>exactIsbn(item,isbn)&&item.coverUrl);}]);
  jobs.push(['Google Books',async()=>{const data=await getJson('https://www.googleapis.com/books/v1/volumes?maxResults=10&printType=books&q='+encodeURIComponent('isbn:'+isbn),signal);return array(data.items).map(fromGoogle).filter(item=>exactIsbn(item,isbn)&&item.coverUrl);}]);
  const settled=await Promise.allSettled(jobs.map(([,run])=>run()));if(signal?.aborted)throw signal.reason||new DOMException('취소됨','AbortError');
  const items=[],warnings=[];settled.forEach((result,index)=>{if(result.status==='fulfilled')items.push(...result.value);else warnings.push(jobs[index][0]+' 조회 실패');});
  items.push({title:book.title||'',authors:book.authors||[],publisher:book.publisher||'',isbn,coverUrl:`https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`,source:'Open Library'});
  return {items:uniqueCovers(items),warnings};
}
