import { h,mount,field,button,input,select,textArea,empty,head,chips,confirm,modal,cover,task } from './ui.js';
import { clone,uid,nowIso,MEMO_TYPES,readingsFor,activeReading,noteHasContent,noteMatches,displayDate } from './domain.js';
import { noteMarkdown } from './exports.js';
import { exportFile } from './platform.js';
const nameOf=n=>n.title|| (n.kind==='review'?'감상평':MEMO_TYPES[n.memoType]);
const excerpt=n=>n.summary||n.reflection||n.takeaway||n.text||n.legacyText||n.questions||n.actions||n.comment||'';
const filterNames={all:'전체',review:'감상평',memo:'읽는 중 메모',draft:'초안',pinned:'고정'};
export function noteChooser(ctx,kind='review'){
  const books=ctx.repo.state.books;
  if(!books.length){ctx.toast('먼저 책을 한 권 담아 주세요.');ctx.navigate('shelf');return;}
  modal(kind==='review'?'어떤 책의 감상평인가요?':'어떤 책의 메모인가요?',close=>{
    const q=input('',{type:'search',placeholder:'책 제목 검색','aria-label':'노트를 쓸 책 선택'}),list=h('div');
    const paint=()=>mount(list,books.filter(b=>b.title.toLowerCase().includes(q.value.toLowerCase())).map(b=>button(b.title,()=>{close();const r=activeReading(ctx.repo.state,b.id)||readingsFor(ctx.repo.state,b.id)[0];kind==='review'?ctx.openReview(b.id,r?.id):ctx.openMemo(b.id,r?.id);},'wide',{style:{marginTop:'8px'}})));
    q.oninput=paint;paint();return h('div',{},q,list);
  });
}
export function renderNotes(root,ctx){
  const query=input(ctx.view.noteQuery||'',{type:'search',placeholder:'책 · 생각 · 인용 · 태그를 찾아보세요','aria-label':'노트 본문 검색'});query.className='search';
  const control=h('div'),list=h('div.note-list'),add=button('＋ 노트',()=>noteChooser(ctx),'primary small');
  const paint=()=>{
    const state=ctx.repo.state,filter=ctx.view.noteFilter||'all';
    mount(control,chips(filterNames,filter,v=>{ctx.view.noteFilter=v;paint();}));
    const notes=state.notes.filter(n=>noteHasContent(n)&&noteMatches(n,state.books.find(b=>b.id===n.bookId),query.value)&&(filter==='all'||filter===n.kind||(filter==='draft'&&n.stage==='draft')||(filter==='pinned'&&n.pinned))).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt));
    if(!notes.length){list.className='';mount(list,empty('생각이 머무는 자리','짧은 메모 한 줄도 좋아요. 읽는 중의 생각부터 남겨보세요.',button('＋ 빠른 메모',()=>noteChooser(ctx,'memo'),'primary')));return;}
    list.className='note-list';mount(list,notes.map(n=>{const b=state.books.find(b=>b.id===n.bookId);return h('button.note-card',{type:'button',onclick:()=>ctx.navigate('note/'+encodeURIComponent(n.id))},h('div.note-title',{},b?.title,n.pinned?h('span.pinned',{},'· 고정'):null),h('h2',{},nameOf(n)),h('p',{},excerpt(n)),h('div.note-meta',{},n.kind==='review'?'감상평':MEMO_TYPES[n.memoType], '·',n.stage==='complete'?'정리 완료':'초안','·',new Date(n.updatedAt).toLocaleDateString('ko-KR'),...n.tags.map(t=>h('span.tag',{},'#'+t))));}));
  };
  query.oninput=()=>{ctx.view.noteQuery=query.value;paint();};mount(root,head('노트','읽은 내용을 넘어, 나에게 남은 생각',add),query,control,list);paint();
}
export function renderNote(root,ctx,noteId){
  const state=ctx.repo.state,n=state.notes.find(n=>n.id===noteId);if(!n){mount(root,empty('노트를 찾지 못했어요','다른 노트를 선택해 주세요.'));return;}
  const b=state.books.find(b=>b.id===n.bookId),r=state.readings.find(r=>r.id===n.readingId);
  const section=(key,label)=>n[key]?h('section.note-read-section',{},h('h2',{},label),h('p.prose'+(key==='text'&&n.memoType==='quote'?'.quote':''),{},n[key])):null;
  mount(root,button('‹ 노트로',()=>ctx.navigate('notes'),'back'),head(nameOf(n),b?.title||'',button('수정',()=>ctx.navigate('write/'+encodeURIComponent(n.id)),'primary')),h('div.note-meta',{},n.stage==='complete'?'정리 완료':'초안',n.pinned?'· 고정':''),r?.oneLiner?h('p.one-liner',{},r.oneLiner):null,h('div.card',{style:{marginTop:'22px'}},section('summary','핵심 내용'),section('reflection','내 생각'),section('takeaway','나에게 남은 것'),section('questions','남은 질문'),section('actions','해볼 일'),section('text',n.memoType==='quote'?'인상 깊은 문장':'메모'),section('locator','페이지 · 장 · 위치'),section('comment','인용에 대한 내 생각'),section('legacyText','기존 독서록 · 원문 보존'),!noteHasContent(n)?h('p.hint',{},'아직 적은 내용이 없어요. 수정에서 한 줄 남겨보세요.'):null,n.tags.length?h('div.note-meta',{},...n.tags.map(t=>h('span.tag',{},'#'+t))):null),h('div.button-row',{},button(n.pinned?'고정 해제':'다시 볼 노트로 고정',e=>task(e.currentTarget,async()=>{await ctx.repo.saveNote({...n,pinned:!n.pinned},n.rev);ctx.refresh();})),button('Markdown 내보내기',e=>task(e.currentTarget,async()=>{await exportFile(`독서노트_${new Date().toISOString().slice(0,10)}.md`,noteMarkdown(n,b,r),'text/markdown;charset=utf-8');ctx.toast('파일 저장을 요청했어요. 파일 앱에서 확인해 주세요.');}))),button('이 책의 기록 보기',()=>ctx.navigate('book/'+encodeURIComponent(n.bookId)),'inline-link'),h('div.divider'),button('이 노트 삭제',async()=>{if(await confirm('노트를 삭제할까요?','책과 독서 이력은 그대로 남아요. 필요한 글은 먼저 내보내 주세요.','노트 삭제',true)){await ctx.repo.removeNote(n.id);ctx.navigate('notes');}},'quiet danger'));
}
const PROMPTS={
  general:['이 책은 무엇을 말하고 있나요? 내 말로 짧게 적어보세요.','무엇에 공감했고, 무엇이 걸렸나요?','읽기 전과 비교해 무엇이 달라졌나요?'],
  fiction:['이야기와 인물의 변화 중 무엇이 중심이었나요?','어떤 장면이나 인물에서 마음이 움직였나요?','이 이야기가 내 삶과 만나는 지점은 무엇인가요?'],
  practical:['핵심 주장이나 방법은 무엇인가요?','설득력 있었던 근거와 의문이 드는 점은 무엇인가요?','내 상황에서 기억하거나 적용할 것은 무엇인가요?']
};
export async function renderEditor(root,ctx,noteId){
  const stored=ctx.repo.state.notes.find(n=>n.id===noteId),pending=ctx.pendingNote?.(noteId);
  let recovered=null,draftError=null;try{recovered=await ctx.repo.adapter.draftGet(noteId);}catch(e){draftError=e;}
  const seed=stored||pending||(!stored&&recovered?.baseRev===0?recovered.note:null);
  if(!seed){mount(root,empty('노트를 찾지 못했어요','목록에서 다시 선택해 주세요.'));return;}
  let note=clone(seed),baseRev=stored?.rev??0,dirty=false,generation=0,timer=null,chain=Promise.resolve(),disposed=false,composing=false;
  const book=ctx.repo.state.books.find(b=>b.id===note.bookId),reading=ctx.repo.state.readings.find(r=>r.id===note.readingId);
  const status=h('span.save-status',{role:'status','aria-live':'polite'},stored?'저장됨':'내용을 입력하면 저장돼요'),failure=h('div',{hidden:true}),notice=h('div',{hidden:true});
  if(draftError){notice.hidden=false;notice.className='notice';notice.textContent='임시 글을 확인하지 못했어요. '+draftError.message;}
  else if(stored&&recovered?.note && recovered.baseRev===stored.rev && JSON.stringify(recovered.note)!==JSON.stringify(stored)){
    note=clone(recovered.note);baseRev=stored.rev;dirty=true;generation++;notice.hidden=false;notice.className='notice';notice.textContent='저장되지 않았던 임시 글을 복구했어요. 내용을 확인한 뒤 저장해 주세요.';status.textContent='복구한 글 · 저장 필요';
  }else if(!stored&&recovered?.note&&recovered.baseRev===0){
    note=clone(recovered.note);dirty=true;generation++;notice.hidden=false;notice.className='notice';notice.textContent='저장되지 않았던 새 노트의 임시 글을 복구했어요.';status.textContent='복구한 글 · 저장 필요';
  }else if(recovered?.note && recovered.baseRev!==baseRev){
    notice.hidden=false;notice.className='notice';notice.append('다른 수정본과 충돌하는 임시 글이 있어요. 현재 저장된 노트는 바꾸지 않았어요.',button('임시 글 내보내기',()=>exportFile('복구할_독서노트.md',noteMarkdown(recovered.note,book,reading),'text/markdown'),'small'));
  }
  function showError(err){status.textContent='저장 실패 · 글은 화면에 남아 있어요';status.className='save-status error';failure.hidden=false;mount(failure,h('p.error',{role:'alert'},err.message),h('div.button-row',{},button('다시 저장',()=>persist().catch(()=>{})),button('현재 글 파일로 보관',()=>exportFile('미저장_독서노트.md',noteMarkdown(note,book,reading),'text/markdown')),button('별도 노트로 저장',async()=>{try{const copy={...clone(note),id:uid('note'),rev:0,title:(note.title||'감상평')+' (복구 사본)',createdAt:nowIso()};const saved=await ctx.repo.saveNote(copy,0);dirty=false;ctx.setLeaveGuard(null);ctx.navigate('note/'+encodeURIComponent(saved.id));}catch(e){ctx.toast(e.message);}})) );}
  function persist(){
    clearTimeout(timer);
    const job=async()=>{
      if(disposed||!dirty)return true;
      if(composing)return false;
      const snap=clone(note),gen=generation,rev=baseRev;
      status.textContent='저장 중…';status.className='save-status';
      try{
        if(rev===0&&!noteHasContent(snap)){
          await ctx.repo.adapter.draftDelete(note.id);ctx.discardPendingNote?.(note.id);
          if(gen===generation){dirty=false;status.textContent='내용을 입력하면 저장돼요';}
          failure.hidden=true;return !dirty;
        }
        await ctx.repo.draft(snap,rev);
        const saved=await ctx.repo.saveNote(snap,rev);
        baseRev=saved.rev;note.rev=saved.rev;note.updatedAt=saved.updatedAt;ctx.discardPendingNote?.(note.id);
        if(gen===generation){dirty=false;status.textContent='저장됨 · '+new Date(saved.updatedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});try{await ctx.repo.adapter.draftDelete(note.id);}catch{status.textContent='글은 저장됨 · 임시 글 정리 보류';}}
        else{status.textContent='새 입력 저장 대기…';timer=setTimeout(()=>persist().catch(()=>{}),600);}
        failure.hidden=true;return !dirty;
      }catch(e){showError(e);throw e;}
    };
    const result=chain.then(job,job);chain=result.catch(()=>{});return result;
  }
  function changed(){dirty=true;generation++;status.textContent='저장 대기…';status.className='save-status';clearTimeout(timer);if(!composing)timer=setTimeout(()=>persist().catch(()=>{}),700);}
  const fields={};
  function area(key,label,hint=''){
    const a=textArea(note[key],{oninput:()=>{note[key]=a.value;changed();},'aria-label':label});fields[key]=a;
    return h('section.editor-section',{},h('h2',{},label),hint?h('p.hint',{},hint):null,a);
  }
  const title=input(note.title,{placeholder:note.kind==='review'?'노트 제목 (선택)':'짧은 제목 (선택)','aria-label':'노트 제목',class:'editor-title',oninput:e=>{note.title=e.target.value;changed();}});
  const template=select({general:'기본 질문',fiction:'소설 · 문학',practical:'인문 · 실용'},note.template,{'aria-label':'감상평 질문 틀',onchange:e=>{note.template=e.target.value;hintNodes.forEach((x,i)=>{x.textContent=PROMPTS[note.template][i];});changed();}});
  const hintNodes=[],body=h('div');
  if(note.kind==='review'){
    body.append(field('질문 틀',template,'안내 질문만 바뀌고 작성한 글은 그대로 남아요.'));
    ['summary','reflection','takeaway'].forEach((key,i)=>{const node=area(key,['핵심 내용','내 생각','나에게 남은 것'][i],PROMPTS[note.template][i]);hintNodes.push(node.querySelector('.hint'));body.append(node);});
    const details=h('details',{open:!!(note.questions||note.actions)},h('summary',{},'남은 질문 · 해볼 일 (선택)'),area('questions','남은 질문','아직 이해되지 않았거나 더 찾아보고 싶은 것은?'),area('actions','해볼 일','실제로 해볼 한 가지가 있다면?'));body.append(details);
  }else{
    const type=select(MEMO_TYPES,note.memoType,{'aria-label':'메모 종류',onchange:e=>{note.memoType=e.target.value;changed();}});
    body.append(field('어떤 기록인가요?',type),area('text','메모 또는 인용문','책의 문장이라면 원문을 적고, 아래에 내 생각을 구분해 주세요.'),field('페이지 · 장 · 전자책 위치 (선택)',input(note.locator,{placeholder:'예: p. 42 / 3장 / 위치 120','aria-label':'인용 위치',oninput:e=>{note.locator=e.target.value;changed();}})),area('comment','내 생각 (선택)','왜 이 문장을 남기고 싶었나요?'));
  }
  if(note.legacyText)body.append(h('details',{open:false},h('summary',{},'기존 독서록 원문 보기'),h('p.prose',{},note.legacyText)));
  const tags=input(note.tags.join(', '),{placeholder:'쉼표로 구분 · 예: 삶, 일, 불확실성',oninput:e=>{note.tags=e.target.value.split(',').map(x=>x.trim().replace(/^#/, '')).filter(Boolean);changed();}});
  body.append(field('태그 (선택)',tags),h('label.checkbox',{},input('',{type:'checkbox',checked:note.pinned,onchange:e=>{note.pinned=e.target.checked;changed();}}),'다시 볼 노트로 고정'),h('p.hint',{},'모든 칸을 채우지 않아도 괜찮아요. 한 항목만 적어도 저장돼요.'));
  const memos=ctx.repo.state.notes.filter(n=>n.bookId===note.bookId&&n.kind==='memo'&&n.id!==note.id&&noteHasContent(n));
  const side=h('aside.editor-side',{},h('div.card',{},h('p.eyebrow',{},'THIS BOOK'),h('h2',{},book.title),h('p.hint',{},book.authors.join(', ')),reading?.why?h('p.hint',{},'읽기 전 기대 · '+reading.why):null,reading?.oneLiner?h('p.one-liner',{},reading.oneLiner):null,button('책 기록 보기',()=>ctx.navigate('book/'+encodeURIComponent(book.id)),'inline-link')),note.kind==='review'&&memos.length?h('details',{open:true},h('summary',{},'읽으며 남긴 메모 '+memos.length+'개'),...memos.map(m=>h('div.card',{},h('p.hint',{},MEMO_TYPES[m.memoType]+(m.locator?' · '+m.locator:'')),h('p.prose',{},m.text||m.comment),button('내 생각에 가져오기',()=>{note.reflection+=(note.reflection?'\n\n':'')+(m.memoType==='quote'?`인용 (${m.locator||'위치 미상'})\n${m.text}\n\n내 생각: ${m.comment||''}`:m.text+(m.comment?'\n'+m.comment:''));fields.reflection.value=note.reflection;changed();},'inline-link small')))):null);
  const reference=h('details.editor-reference',{open:matchMedia('(min-width:700px)').matches},h('summary',{},'책 정보 · 참고할 메모'),side);
  const destination=()=>baseRev>0?'note/'+encodeURIComponent(note.id):'book/'+encodeURIComponent(note.bookId);
  mount(root,head(note.kind==='review'?'생각을 정리하는 시간':'읽으며 남긴 메모',book.title),h('div.editor-top',{},button('‹ 읽기 화면',()=>ctx.navigate(destination()),'quiet'),status,button('저장',()=>persist().catch(()=>{}),'small')),notice,failure,title,h('p.hint',{style:{marginBottom:'22px'}},'입력을 멈추면 이 기기에 자동 저장해요. 정리 완료 표시는 별도예요.'),h('div.editor-layout',{},reference,body),h('div.button-row',{},button('초안으로 두기',async()=>{note.stage='draft';changed();try{await persist();ctx.navigate(destination());}catch{}}),button('정리 완료',async()=>{note.stage='complete';changed();try{await persist();ctx.navigate(destination());}catch{note.stage='draft';}},'primary')));
  root.addEventListener('compositionstart',onCompStart);root.addEventListener('compositionend',onCompEnd);
  function onCompStart(){composing=true;clearTimeout(timer);}function onCompEnd(){composing=false;if(dirty)timer=setTimeout(()=>persist().catch(()=>{}),700);}
  const unload=e=>{if(dirty){e.preventDefault();e.returnValue='';}};
  const hide=()=>{if(document.visibilityState==='hidden'&&dirty)persist().catch(()=>{});};
  addEventListener('beforeunload',unload);document.addEventListener('visibilitychange',hide);
  ctx.setLeaveGuard(async()=>{if(!dirty)return true;try{await persist();return !dirty;}catch{return false;}});
  return()=>{disposed=true;clearTimeout(timer);if(baseRev===0)ctx.discardPendingNote?.(note.id);removeEventListener('beforeunload',unload);document.removeEventListener('visibilitychange',hide);root.removeEventListener('compositionstart',onCompStart);root.removeEventListener('compositionend',onCompEnd);ctx.setLeaveGuard(null);};
}
