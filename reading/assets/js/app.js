import { ReadingRepository } from './repository.js';
import { storageAdapter,nativeEnvironment,exportFile } from './platform.js';
import { BUILD,coverColorValue,newNote,readingsFor } from './domain.js';
import { h,mount,button,icon,toast } from './ui.js';
import { renderShelf,renderLibrary,renderBook,renderStats } from './views-books.js';
import { renderNotes,renderNote,renderEditor } from './views-notes.js';
import { renderSettings } from './views-settings.js';
const repo=new ReadingRepository(storageAdapter()),root=document.getElementById('main'),view={},pendingNotes=new Map();
let routeToken=0,cleanup=null,leaveGuard=null,activePath='',routing=false;
const getPath=()=>location.hash.slice(1)||'shelf';
function shell(path,ctx){
  const section=path.split('/')[0],selected=section==='note'||section==='write'?'notes':section==='book'?'library':section;
  document.body.dataset.theme=ctx.repo.state.settings.theme;
  document.body.dataset.background=ctx.repo.state.settings.background;
  const paperColor=coverColorValue(ctx.repo.state.settings.paperBorderColor),ebookColor=coverColorValue(ctx.repo.state.settings.ebookBorderColor);
  document.body.style.setProperty('--paper-border',paperColor||'var(--paper-contrast)');
  document.body.style.setProperty('--ebook-border',ebookColor||'var(--accent)');
  mount(document.getElementById('tabs'),...Object.entries({shelf:'책꽂이',library:'책장',notes:'노트',stats:'통계',settings:'설정'}).map(([key,label])=>h('button',{type:'button',onclick:()=>ctx.navigate(key),'aria-current':key===selected?'page':null},icon(key),h('span',{},label))));
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
      const hadController=Boolean(navigator.serviceWorker.controller);
      const reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      const showUpdate=()=>{if(reg.waiting)dispatchEvent(new CustomEvent('reading:update-ready'));};
      const checkUpdate=async()=>{await reg.update();showUpdate();};
      showUpdate();reg.addEventListener('updatefound',()=>{const sw=reg.installing;sw?.addEventListener('statechange',()=>{if(sw.state==='installed')showUpdate();});});
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkUpdate().catch(()=>{});});
      addEventListener('pageshow',()=>checkUpdate().catch(()=>{}));
      addEventListener('reading:check-update',event=>{checkUpdate().then(()=>event.detail?.done?.(reg.waiting?'새 버전이 준비됐어요.':'현재 최신 버전을 사용 중이에요.',Boolean(reg.waiting))).catch(()=>event.detail?.done?.('업데이트를 확인하지 못했어요. 인터넷 연결을 확인해 주세요.',false));});
      addEventListener('reading:apply-update',async event=>{if(!reg.waiting){event.detail?.done?.('적용할 새 버전이 없어요.');return;}if(leaveGuard&&!(await leaveGuard()))return;reg.waiting.postMessage({type:'ACTIVATE_UPDATE'});event.detail?.done?.('새 버전을 적용하고 있어요…');});
      let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(refreshing||!hadController)return;refreshing=true;location.reload();});
      checkUpdate().catch(()=>{});
    }catch(e){toast('오프라인 준비를 완료하지 못했어요. 인터넷 연결 후 다시 열어 주세요.');}
  }
  document.documentElement.dataset.build=BUILD;
}
boot().catch(err=>{
  mount(root,h('div.card',{},h('h1',{},'기록을 먼저 보호할게요'),h('p.error',{},err.message),h('p.hint',{},'빈 데이터로 덮어쓰지 않았어요. 브라우저 데이터를 지우거나 앱을 삭제하지 말아 주세요. 복구 원본에는 설정 키가 포함될 수 있으니 외부에 공유하지 마세요.'),button('다시 열기',()=>location.reload()),button('저장 원본 파일 내보내기',async()=>{try{let raw=null;try{const dbValue=await repo.adapter.load();if(dbValue)raw=JSON.stringify(dbValue,null,2);}catch{}if(!raw)raw=repo.adapter.readLegacy?.();if(!raw)return toast('원본 파일을 읽지 못했어요. 기기 데이터베이스는 그대로 두었어요.');await exportFile('책꽂이_복구원본.json',raw);toast('복구용 원본 파일 저장을 요청했어요.');}catch(e){toast(e.message);}})));
});
