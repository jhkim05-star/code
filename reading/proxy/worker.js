/**
 * 국내 도서 검색 프록시 (Cloudflare Workers)
 *
 * 비밀키는 Worker 환경변수에만 둔다. ISBN 표지는 국립중앙도서관, 네이버,
 * 카카오 순으로 모으고 앱이 실제 이미지 로딩을 확인한 뒤 저장한다.
 */
const KAKAO_URL='https://dapi.kakao.com/v3/search/book';
const NAVER_URL='https://openapi.naver.com/v1/search/book.json';
const NL_URL='https://www.nl.go.kr/seoji/SearchApi.do';
const text=value=>String(value??'').replace(/<[^>]*>/g,'').trim();
const https=value=>String(value||'').replace(/^http:\/\//i,'https://');
const compactIsbn=value=>String(value||'').replace(/[^0-9Xx]/g,'').toUpperCase();
const isbnParts=value=>String(value||'').split(/\s+/).map(compactIsbn).filter(value=>/^(?:\d{9}[\dX]|\d{13})$/.test(value));
function preferredIsbn(value){const values=isbnParts(value);return values.find(x=>x.length===13)||values[0]||'';}
function corsHeaders(request,env){const allowed=(env.ALLOWED_ORIGIN||'').trim(),origin=request.headers.get('Origin')||'';return {'Access-Control-Allow-Origin':!allowed?'*':origin===allowed?origin:allowed,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'};}
function json(value,status,cors){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8',...cors}});}
async function fetchJson(url,options={}){const response=await fetch(url,options);if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();if(!data||typeof data!=='object')throw new Error('응답 형식 오류');return data;}
function fromKakao(item){return {title:text(item.title),authors:Array.isArray(item.authors)?item.authors.map(text).filter(Boolean):[],translator:Array.isArray(item.translators)?item.translators.map(text).filter(Boolean).join(', '):'',publisher:text(item.publisher),publishedDate:text(item.datetime).slice(0,10),isbn:preferredIsbn(item.isbn),coverUrl:https(item.thumbnail),description:text(item.contents),source:'카카오'};}
function fromNaver(item){return {title:text(item.title),authors:text(item.author).split(/[|;]/).map(text).filter(Boolean),publisher:text(item.publisher),publishedDate:text(item.pubdate).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'),isbn:preferredIsbn(item.isbn),coverUrl:https(item.image),description:text(item.description),source:'네이버 책'};}
function nlRows(data){for(const value of [data.docs,data.items,data.results,data.RESULT,data.result])if(Array.isArray(value))return value;if(data&&typeof data==='object'){for(const value of Object.values(data))if(Array.isArray(value)&&value.some(row=>row&&typeof row==='object'&&('EA_ISBN'in row||'TITLE_URL'in row)))return value;}return [];}
function fromNl(item){return {title:text(item.TITLE||item.title),authors:text(item.AUTHOR||item.author).split(/[;,]/).map(text).filter(Boolean),publisher:text(item.PUBLISHER||item.publisher),publishedDate:text(item.PUBLISH_PREDATE||item.publish_date).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'),isbn:preferredIsbn(item.EA_ISBN||item.isbn),pageCount:Number(item.PAGE||item.page)||null,coverUrl:https(item.TITLE_URL||item.coverUrl),description:'',source:'국립중앙도서관'};}
async function kakao(query,env,target=''){if(!env.KAKAO_REST_API_KEY)return[];const url=new URL(KAKAO_URL);url.searchParams.set('query',query);url.searchParams.set('size','20');if(target)url.searchParams.set('target',target);const data=await fetchJson(url,{headers:{Authorization:'KakaoAK '+env.KAKAO_REST_API_KEY}});return Array.isArray(data.documents)?data.documents.map(fromKakao):[];}
async function naver(query,env){if(!env.NAVER_CLIENT_ID||!env.NAVER_CLIENT_SECRET)return[];const url=new URL(NAVER_URL);url.searchParams.set('query',query);url.searchParams.set('display','20');const data=await fetchJson(url,{headers:{'X-Naver-Client-Id':env.NAVER_CLIENT_ID,'X-Naver-Client-Secret':env.NAVER_CLIENT_SECRET}});return Array.isArray(data.items)?data.items.map(fromNaver):[];}
async function nationalLibrary(isbn,env){if(!env.NL_CERT_KEY||!isbn)return[];const url=new URL(NL_URL);for(const [key,value]of Object.entries({cert_key:env.NL_CERT_KEY,result_style:'json',page_no:'1',page_size:'20',isbn}))url.searchParams.set(key,value);return nlRows(await fetchJson(url)).map(fromNl);}
function unique(items){const seen=new Set();return items.filter(item=>{const key=[item.source,item.isbn,item.coverUrl,item.title].join('|');if(!item.title||seen.has(key))return false;seen.add(key);return true;});}

export default {async fetch(request,env){
  const cors=corsHeaders(request,env);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='GET')return json({error:'GET 요청만 지원합니다.'},405,cors);
  const url=new URL(request.url),query=text(url.searchParams.get('query')).slice(0,300),isbn=compactIsbn(url.searchParams.get('isbn')||query),action=url.searchParams.get('action')||'search';
  if(!query)return json({error:'query 파라미터가 필요합니다.'},400,cors);
  const configured=env.NL_CERT_KEY||(env.NAVER_CLIENT_ID&&env.NAVER_CLIENT_SECRET)||env.KAKAO_REST_API_KEY;if(!configured)return json({error:'워커에 도서 검색 API 키가 설정되지 않았습니다.'},500,cors);
  const jobs=action==='cover'?[nationalLibrary(isbn,env),naver(isbn,env),kakao(isbn,env,'isbn')]:[naver(query,env),kakao(query,env,/^(?:\d{9}[\dX]|\d{13})$/.test(isbn)?'isbn':'')];
  const settled=await Promise.allSettled(jobs),items=unique(settled.flatMap(result=>result.status==='fulfilled'?result.value:[]));
  return json({items,warnings:settled.filter(result=>result.status==='rejected').map(()=>'일부 제공처 조회 실패')},200,cors);
}};
