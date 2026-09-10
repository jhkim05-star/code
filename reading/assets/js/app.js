import { ReadingRepository } from './repository.js';
import { storageAdapter,nativeEnvironment,exportFile } from './platform.js';
import { BUILD,newNote,readingsFor } from './domain.js';
import { h,mount,button,icon,toast } from './ui.js';
import { renderShelf,renderLibrary,renderBook,renderStats,bookForm } from './views-books.js';
import { renderNotes,renderNote,renderEditor,noteChooser } from './views-notes.js';
import { renderSettings } from './views-settings.js';
const repo=new ReadingRepository(storageAdapter()),root=document.getElementById('main'),view={},pendingNotes=new Map();
let routeToken=0,cleanup=null,leaveGuard=null,activePath='',routing=false;
const getPath=()=>location.hash.slice(1)||'shelf';
function shell(path,ctx){
  const section=path.split('/')[0],selected=section==='note'||section==='write'?'notes':section==='stats'?'library':section;
  mount(document.getElementById('topbar'),h('div.brand',{},h('span.brand-mark',{'aria-hidden':'true'}),'책꽂이',h('span.small-brand',{},'· 기록')),h('div.top-actions',{},button('',()=>ctx.navigate('settings'),'icon quiet',{'aria-label':'설정'}),button('',()=>selected==='notes'?noteChooser(ctx):bookForm(ctx),'icon primary',{'aria-label':selected==='notes'?'새 노트':'책 담기'})));
  document.querySelector('[aria-label="설정"]').append(icon('settings'));
  document.querySelector('.top-actions .primary').append(icon('plus'));
  mount(document.getElementById('tabs'),...Object.entries({shelf:'책꽂이',library:'책장',notes:'노트'}).map(([key,label])=>h('button',{type:'button',onclick:()=>ctx.navigate(key),'aria-current':key===selected?'page':null},icon(key),h('span',{},label))));
}
async function navigate(path){
  if(leaveGuard&&!(await leaveGuard()))return;
  if(getPath()===path)return route(true);
  location.hash=path;
}
async function route(skipGuard=false){
  const path=getPath();
  if(path===activePath&&!skipGuard)return;
  if(!skipGuard&&leaveGuard&&!(await leaveGuard())){history.replaceState(null,'','#'+activePath);return;}
  const token=++routeToken;cleanup?.();cleanup=null;leaveGuard=null;
  activePath=path;
  const container=h('div'),ctx={repo,view,toast,navigate,refresh:()=>route(true),setLeaveGuard:fn=>{if(token===routeToken)leaveGuard=fn;},
    pendingNote:id=>pendingNotes.get(id)||null,
    discardPendingNote:id=>pendingNotes.delete(id),
    openReview:async(bookId,readingId)=>{
      const existing=repo.state.notes.find(n=>n.bookId===bookId&&n.readingId===(readingId||null)&&n.kind==='review');
      if(existing)return navigate('write/'+encodeURIComponent(existing.id));
      const note=newNote(bookId,readingId||null,'review');pendingNotes.set(note.id,note);return navigate('write/'+encodeURIComponent(note.id));
    },
    openMemo:async(bookId,readingId)=>{const note=newNote(bookId,readingId||null,'memo');pendingNotes.set(note.id,note);return navigate('write/'+encodeURIComponent(note.id));}
  };
  shell(path,ctx);mount(root,container);window.scrollTo(0,0);
  const [kind,encodedId]=path.split('/');let id;try{id=decodeURIComponent(encodedId||'');}catch{id='';}
  let end;
  try{
    if(kind==='shelf')end=renderShelf(container,ctx);
    else if(kind==='library')end=renderLibrary(container,ctx);
    else if(kind==='book')end=renderBook(container,ctx,id);
    else if(kind==='notes')end=renderNotes(container,ctx);
    else if(kind==='note')end=renderNote(container,ctx,id);
    else if(kind==='write')end=await renderEditor(container,ctx,id);
    else if(kind==='settings')end=renderSettings(container,ctx);
    else if(kind==='stats')end=renderStats(container,ctx);
    else{history.replaceState(null,'','#shelf');activePath='';return route(true);}
  }catch(e){mount(container,h('div.notice',{},h('h2',{},'화면을 열지 못했어요'),h('p',{},e.message),button('책꽂이로',()=>navigate('shelf'))));}
  if(token!==routeToken){end?.();return;}cleanup=typeof end==='function'?end:null;
  container.querySelector('h1')?.focus({preventScroll:true});
}
async function boot(){
  await repo.init();await route(true);
  addEventListener('hashchange',()=>route().catch(e=>toast(e.message)));
  addEventListener('unhandledrejection',e=>{toast(e.reason?.message||'작업을 끝내지 못했어요.');});
  if('serviceWorker'in navigator&&!nativeEnvironment()&&['https:','http:'].includes(location.protocol)){
    try{
      const reg=await navigator.serviceWorker.register('./sw.js');
      const update=()=>{if(reg.waiting){const btn=button('새 버전 준비됨 · 업데이트',async()=>{if(leaveGuard&&!(await leaveGuard()))return;reg.waiting.postMessage({type:'ACTIVATE_UPDATE'});},'small');document.getElementById('topbar').append(btn);}};
      update();reg.addEventListener('updatefound',()=>{const sw=reg.installing;sw?.addEventListener('statechange',()=>{if(sw.state==='installed')update();});});
      let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(refreshing)return;refreshing=true; /* Do not reload during a note edit. Next navigation uses current files. */toast('앱 업데이트가 준비됐어요. 작성 중인 글을 저장한 뒤 다시 열어 주세요.');});
    }catch(e){toast('오프라인 준비를 완료하지 못했어요. 인터넷 연결 후 다시 열어 주세요.');}
  }
  document.documentElement.dataset.build=BUILD;
}
boot().catch(err=>{
  mount(root,h('div.card',{},h('h1',{},'기록을 먼저 보호할게요'),h('p.error',{},err.message),h('p.hint',{},'빈 데이터로 덮어쓰지 않았어요. 브라우저 데이터를 지우거나 앱을 삭제하지 말아 주세요. 복구 원본에는 설정 키가 포함될 수 있으니 외부에 공유하지 마세요.'),button('다시 열기',()=>location.reload()),button('저장 원본 파일 내보내기',async()=>{try{let raw=null;try{const dbValue=await repo.adapter.load();if(dbValue)raw=JSON.stringify(dbValue,null,2);}catch{}if(!raw)raw=repo.adapter.readLegacy?.();if(!raw)return toast('원본 파일을 읽지 못했어요. 기기 데이터베이스는 그대로 두었어요.');await exportFile('책꽂이_복구원본.json',raw);toast('복구용 원본 파일 저장을 요청했어요.');}catch(e){toast(e.message);}})));
});
