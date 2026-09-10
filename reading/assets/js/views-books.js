import { h,mount,field,button,input,select,textArea,empty,head,modal,confirm,cover,chips,task } from './ui.js';
import { STATUSES,FORMATS,GENRES,today,nowIso,displayDate,durationOf,readingsFor,activeReading,bookMatches,summary,noteHasContent } from './domain.js';
import { searchBooks } from './api.js';
import { shrinkCover } from './platform.js';
const shelfLabels={all:'전체',reading:'읽는 중',planned:'읽을 예정',paused:'잠시 멈춤',abandoned:'그만 읽음'};
const ratingLabel=r=>r.rating!=null?'★ '+r.rating.toFixed(1):'별점 없음';
function bookCard(ctx,b,r,library=false){
  const badge=library?ratingLabel(r):(r.status==='reading'&&durationOf(r)?`${durationOf(r)}일째`:r.status==='planned'?'예정':STATUSES[r.status]);
  return h('button.book-card',{type:'button',onclick:()=>ctx.navigate('book/'+encodeURIComponent(b.id)),'aria-label':`${b.title} · ${badge}`},cover(b),h('span.title',{},b.title),h('div.author',{},b.authors.join(', ')||'저자 미상'),h('span.badge'+(library?'.soft':''),{},badge));
}
function section(title,items){return h('section',{},h('div.section-head',{},h('h2',{},title),h('span.count',{},items.length+'권')),h('div.grid',{},items));}
export function renderShelf(root,ctx){
  const control=h('div'),list=h('div'),q=input(ctx.view.shelfQuery||'',{type:'search',placeholder:'제목 · 저자 · 장르 검색','aria-label':'책꽂이 검색'});
  q.className='search';q.addEventListener('input',()=>{ctx.view.shelfQuery=q.value;paint();});
  function paint(){
    const filter=ctx.view.shelfFilter||'all';
    mount(control,chips(shelfLabels,filter,v=>{ctx.view.shelfFilter=v;paint();}));
    const state=ctx.repo.state;
    const groups={reading:[],planned:[],paused:[],abandoned:[]};
    for(const b of state.books){if(!bookMatches(b,q.value))continue;const r=activeReading(state,b.id)||readingsFor(state,b.id).find(r=>r.status==='abandoned');if(r&&groups[r.status])groups[r.status].push([b,r]);}
    const sections=[];
    for(const key of (filter==='all'?['reading','planned']: [filter])){
      const rows=groups[key].sort((a,b)=>b[1].updatedAt.localeCompare(a[1].updatedAt));
      if(rows.length)sections.push(section(shelfLabels[key],rows.map(([b,r])=>bookCard(ctx,b,r))));
    }
    mount(list,sections.length?sections:empty(q.value?'찾는 책이 없어요':'읽고 싶은 책을 담아보세요',q.value?'다른 검색어를 입력해 주세요.':'책을 담고, 읽고, 생각을 남기는 나만의 공간이에요.',q.value?null:button('첫 책 담기',()=>bookForm(ctx),'primary')));
    root.style.setProperty('--cols',state.settings.cols);
  }
  mount(root,head('책꽂이','앞으로 읽을 책, 지금 함께하는 책',button('＋ 책 담기',()=>bookForm(ctx),'primary small')),q,control,list);paint();
}
export function renderLibrary(root,ctx){
  const stats=summary(ctx.repo.state),list=h('div'),q=input(ctx.view.libraryQuery||'',{type:'search',placeholder:'읽은 책에서 검색','aria-label':'책장 검색'});q.className='search';
  const sorting=select({date:'최근 완독',rating:'별점 순',title:'제목 순'},ctx.view.librarySort||'date',{'aria-label':'책장 정렬',onchange:e=>{ctx.view.librarySort=e.target.value;paint();}});
  q.addEventListener('input',()=>{ctx.view.libraryQuery=q.value;paint();});
  function paint(){
    const state=ctx.repo.state,books=state.books.filter(b=>bookMatches(b,q.value)).map(b=>[b,readingsFor(state,b.id).filter(r=>r.status==='finished').sort((a,b)=>(b.finishedAt||'').localeCompare(a.finishedAt||''))[0]]).filter(([,r])=>r);
    const sort=ctx.view.librarySort||'date';books.sort((a,b)=>sort==='rating'?(b[1].rating??-1)-(a[1].rating??-1):sort==='title'?a[0].title.localeCompare(b[0].title,'ko'):(b[1].finishedAt||'').localeCompare(a[1].finishedAt||''));
    if(!books.length){mount(list,empty('아직 책장이 비어 있어요','책꽂이에서 다 읽은 책을 완독으로 표시해 주세요. 과거에 읽은 책도 추가할 수 있어요.',button('읽은 책 추가',()=>bookForm(ctx,null,{finished:true}),'primary')));return;}
    if(sort!=='date')mount(list,h('div.grid',{},books.map(([b,r])=>bookCard(ctx,b,r,true))));
    else{const groups=new Map();for(const pair of books){const year=pair[1].finishedAt?.slice(0,4)||'날짜 미상';if(!groups.has(year))groups.set(year,[]);groups.get(year).push(pair);}mount(list,[...groups].map(([year,rows])=>section(year==='날짜 미상'?year:year+'년',rows.map(([b,r])=>bookCard(ctx,b,r,true)))));}
    root.style.setProperty('--cols',state.settings.cols);
  }
  mount(root,head('책장','책은 덮어도, 기록은 남아 있어요.',button('＋ 읽은 책',()=>bookForm(ctx,null,{finished:true}),'small')),h('div.stats-strip',{},h('div',{},h('strong',{},stats.year),h('span',{},'올해 완독')),h('div',{},h('strong',{},stats.month),h('span',{},'이번 달')),button('통계 보기',()=>ctx.navigate('stats'),'quiet')),q,h('div.books-controls',{},h('span.hint',{},'책은 한 번, 재독 이력은 따로'),sorting),list);paint();
}
export function renderBook(root,ctx,bookId){
  const state=ctx.repo.state,b=state.books.find(x=>x.id===bookId);if(!b){mount(root,empty('책을 찾지 못했어요','책꽂이에서 다시 선택해 주세요.'));return;}
  const reads=readingsFor(state,bookId),active=activeReading(state,bookId),notes=state.notes.filter(n=>n.bookId===bookId&&noteHasContent(n));
  const card=r=>{
    const index=[...reads].reverse().findIndex(x=>x.id===r.id)+1,period=durationOf(r),actions=[];
    if(r.status==='planned')actions.push(button('읽기 시작',e=>task(e.currentTarget,async()=>{await ctx.repo.editReading(r.id,{status:'reading',startedAt:today(),startedTime:nowIso()});ctx.refresh();}),'primary'));
    if(r.status==='reading'){
      actions.push(button('다 읽음',()=>recordForm(ctx,b,r,{finish:true}),'primary'));
      actions.push(button('잠시 멈춤',e=>task(e.currentTarget,async()=>{await ctx.repo.editReading(r.id,{status:'paused'});ctx.refresh();})));
    }
    if(r.status==='paused')actions.push(button('이어서 읽기',e=>task(e.currentTarget,async()=>{await ctx.repo.editReading(r.id,{status:'reading'});ctx.refresh();}),'primary'));
    if(r.status!=='finished'&&r.status!=='abandoned')actions.push(button('그만 읽음',()=>stopForm(ctx,r),'quiet'));
    actions.push(button(r.status==='finished'?'감상평 쓰기':'노트 남기기',()=>ctx.openReview(b.id,r.id),'small'));
    return h('section.card',{},h('div.section-head.no-margin',{},h('h2',{},`${index}번째 읽기`),h('span.badge',{},STATUSES[r.status])),h('div.record-grid',{},h('div',{},h('span',{},'시작일'),h('strong',{},displayDate(r.startedAt))),h('div',{},h('span',{},r.status==='finished'?'완독일':'읽기 상태'),h('strong',{},r.status==='finished'?displayDate(r.finishedAt):STATUSES[r.status])),h('div',{},h('span',{},'달력상 기간'),h('strong',{},period===null?'시작·완독일 확인 필요':period+'일'+(r.status==='finished'?'':' (오늘까지)'))),h('div',{},h('span',{},FORMATS[r.format]),h('strong',{},ratingLabel(r)))),r.why?h('p.hint',{},'읽으려는 이유 · '+r.why):null,r.oneLiner?h('p.one-liner',{},r.oneLiner):null,r.stopReason?h('p.hint',{},'중단 이유 · '+r.stopReason):null,h('div.button-row',{},actions),button('날짜 · 별점 · 한줄평 수정',()=>recordForm(ctx,b,r),'inline-link small'));
  };
  mount(root,button('‹ 돌아가기',()=>ctx.navigate(active?'shelf':'library'),'back'),h('div.detail-hero',{},cover(b,true),h('div',{},h('p.eyebrow',{},'MY READING'),h('h1',{},b.title),h('p.sub',{},b.authors.join(', ')||'저자 미상'),h('p.hint',{},[b.publisher,b.genre,b.pageCount?b.pageCount+'쪽':''].filter(Boolean).join(' · ')),button('책 정보 수정',()=>bookForm(ctx,b),'inline-link'))),...reads.map(card),!active?button('＋ 다시 읽기',e=>task(e.currentTarget,async()=>{await ctx.repo.reread(b.id,today());ctx.refresh();ctx.toast('이전 완독 기록을 남기고 새 읽기를 시작했어요.');}),'wide'):null,h('div.section-head',{},h('h2',{},'이 책의 생각들'),button('＋ 빠른 메모',()=>ctx.openMemo(b.id,active?.id||reads[0]?.id),'small')),notes.length?h('div.note-list',{},notes.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(n=>h('button.note-card',{type:'button',onclick:()=>ctx.navigate('note/'+encodeURIComponent(n.id))},h('div.note-title',{},n.kind==='review'?'감상평':'읽으며 남긴 메모'),h('h2',{},n.title||b.title),h('p',{},n.summary||n.text||n.reflection||n.legacyText),h('div.note-meta',{},n.stage==='complete'?'정리 완료':'초안')))):h('p.hint',{},'읽는 중 떠오른 생각도 여기서 바로 남길 수 있어요.'),h('div.divider'),button('이 책과 연결된 기록 삭제',async()=>{if(await confirm('이 책을 삭제할까요?',`독서 이력 ${reads.length}개와 노트 ${state.notes.filter(n=>n.bookId===b.id).length}개도 함께 삭제돼요. 필요한 내용은 먼저 내보내 주세요.`,'삭제',true)){await ctx.repo.removeBook(b.id);ctx.navigate('shelf');}},'quiet danger'));
}
function stopForm(ctx,r){modal('그만 읽은 이유',close=>{const reason=textArea(r.stopReason,{placeholder:'지금은 맞지 않았던 이유가 있나요? (선택)'});return h('div',{},field('짧게 남겨두기',reason),button('기록하고 그만 읽음으로',e=>task(e.currentTarget,async()=>{await ctx.repo.editReading(r.id,{status:'abandoned',stopReason:reason.value});close();ctx.refresh();}),'primary wide'));});}
export function recordForm(ctx,b,r,{finish=false}={}){
  modal(finish?'완독 기록':'간단 기록 수정',close=>{
    const start=input(r.startedAt,{type:'date',max:today()}),end=input(finish?(r.finishedAt||today()):r.finishedAt,{type:'date',max:today()});
    const ratingOpts={'':'미평가'};for(let i=0;i<=5;i+=.5)ratingOpts[String(i)]='★ '+i.toFixed(1);
    const rating=select(ratingOpts,r.rating??''),format=select(FORMATS,r.format),one=input(r.oneLiner,{maxLength:4000,placeholder:'한 문장만 남겨도 충분해요.'}),why=textArea(r.why,{rows:2}),period=h('p.hint'),error=h('p.error',{'role':'alert'});
    const status=finish?'finished':r.status;
    const paint=()=>{const d=durationOf({...r,status,startedAt:start.value,finishedAt:end.value});period.textContent=d===null?'시작일을 모르면 기간은 미상으로 남겨요.':`달력상 기간 ${d}일 · 실제 읽은 시간과는 달라요.`;};start.oninput=paint;end.oninput=paint;paint();
    const form=h('form',{onsubmit:async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;error.textContent='';try{await ctx.repo.editReading(r.id,{status,startedAt:start.value,finishedAt:status==='finished'?end.value:'',startedTime:start.value===r.startedAt?r.startedTime:'',finishedTime:end.value===r.finishedAt?r.finishedTime:'',rating:rating.value===''?null:Number(rating.value),format:format.value,oneLiner:one.value,why:why.value});close();ctx.refresh();ctx.toast(finish?'완독 기록을 저장했어요. 감상평은 나중에 써도 괜찮아요.':'기록을 저장했어요.');}catch(err){error.textContent=err.message;}finally{btn.disabled=false;}}},h('p.sub',{},b.title),h('div.form-row',{},field('읽기 시작일 (모르면 비워두기)',start),status==='finished'?field('완독일 (모르면 비워두기)',end):null),period,h('div.form-row',{},field('별점 (선택)',rating),field('읽은 형식',format)),field('한줄평 (선택)',one),h('details',{},h('summary',{},'읽으려는 이유'),field('읽기 전 기대',why)),error,h('button.primary.wide',{type:'submit'},finish?'완독 기록 저장':'저장'));
    return form;
  });
}
export function bookForm(ctx,book=null,{finished=false}={}){
  let lookupController=null;
  modal(book?'책 정보 수정':'책 담기',close=>{
    let metadata=book?{...book}:{};
    const query=input('',{type:'search',placeholder:'제목 또는 ISBN','aria-label':'책 자동 조회'}),results=h('div'),message=h('p.hint',{'role':'status'});
    const title=input(book?.title||'',{required:true,maxLength:2000,placeholder:'책 제목만 넣어도 돼요.'}),authors=input(book?.authors?.join(', ')||''),publisher=input(book?.publisher||''),isbn=input(book?.isbn||''),pages=input(book?.pageCount??'',{type:'number',min:0,max:1000000,step:1,inputmode:'numeric'}),genre=select({'':'미분류',...Object.fromEntries(GENRES.map(x=>[x,x])),...(book?.genre?{[book.genre]:book.genre}:{})},book?.genre||''),origin=select({'':'모름',domestic:'한국 작품',foreign:'외국 작품'},book?.origin||''),format=select(FORMATS,'paper'),why=textArea('',{rows:2,placeholder:'읽으려는 이유가 있나요? (선택)'}),coverInput=input(book?.coverUrl||'',{placeholder:'https://…'}),error=h('p.error',{role:'alert'}),photo=input('',{type:'file',accept:'image/*'});
    async function run(){
      const q=query.value.trim();if(!q){message.textContent='검색어를 넣어 주세요.';return;}
      lookupController?.abort();const controller=new AbortController();lookupController=controller;message.textContent='책 정보를 찾고 있어요…';mount(results);
      try{const response=await searchBooks(q,ctx.repo.state.settings,controller.signal);if(controller.signal.aborted)return;message.textContent=response.items.length?'책을 선택하면 아래에 정보가 채워져요.':'검색 결과가 없어요. 제목만 직접 입력해도 돼요.';
        if(response.warnings.length)message.textContent+=' 일부 조회가 실패해 다른 출처를 사용했어요.';
        mount(results,response.items.map(b=>h('button.lookup-result',{type:'button',onclick:()=>{
          metadata={...b};title.value=b.title;authors.value=b.authors?.join(', ')||'';publisher.value=b.publisher||'';isbn.value=b.isbn||'';pages.value=b.pageCount??'';coverInput.value=b.coverUrl||'';if(![...genre.options].some(x=>x.value===b.genre))genre.append(h('option',{value:b.genre},b.genre));genre.value=b.genre||'';origin.value=b.origin||'';message.textContent=`${b.source}에서 가져왔어요. 필요한 부분은 수정해 주세요.`;mount(results);
        }},cover(b),h('div',{},h('span.title',{},b.title),h('span.hint',{},[b.authors?.join(', '),b.publisher].filter(Boolean).join(' · '))))));
      }catch(e){if(!controller.signal.aborted)message.textContent=e.message;}
    }
    query.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run();}});
    photo.addEventListener('change',async()=>{if(!photo.files[0])return;try{coverInput.value=await shrinkCover(photo.files[0]);message.textContent='사진을 작은 표지로 넣었어요.';}catch(e){error.textContent=e.message;}});
    const advanced=h('details',{},h('summary',{},'책 정보 더 보기'),field('출판사',publisher),h('div.form-row',{},field('ISBN',isbn),field('페이지',pages)),h('div.form-row',{},field('장르',genre),field('작품 출처',origin,'출판 언어와 별개예요. 모르면 비워두세요.')),field('표지 이미지 주소',coverInput),field('사진에서 표지 선택',photo));
    const pastEnd=input('',{type:'date',max:today()}),pastOne=input('',{maxLength:4000,placeholder:'기억나는 한 문장이 있나요?'});
    const form=h('form',{onsubmit:async e=>{e.preventDefault();error.textContent='';const btn=e.submitter;btn.disabled=true;try{
      const data={...metadata,title:title.value.trim(),authors:authors.value.split(',').map(x=>x.trim()).filter(Boolean),publisher:publisher.value.trim(),isbn:isbn.value.trim(),pageCount:pages.value===''?null:Number(pages.value),genre:genre.value,origin:origin.value,coverUrl:coverInput.value.trim()};
      if(book){await ctx.repo.editBook(book.id,data);close();ctx.refresh();ctx.toast('책 정보를 저장했어요.');}
      else{const id=await ctx.repo.createBook(data,{status:finished?'finished':'planned',finishedAt:finished?pastEnd.value:'',oneLiner:finished?pastOne.value:'',format:format.value,why:why.value});close();await ctx.navigate('book/'+encodeURIComponent(id));ctx.toast(finished?'읽은 책을 등록했어요. 모르는 날짜는 미상으로 남겼어요.':'책꽂이에 담았어요.');}
    }catch(e){error.textContent=e.message;}finally{btn.disabled=false;}}},
      book?null:h('div',{},h('div.form-row',{},field('책 정보 자동 조회',query),button('찾기',run,'small')),message,results,h('div.divider')),
      field('책 제목',title),field('저자 (쉼표로 구분)',authors),finished?field('완독일 (모르면 비워두기)',pastEnd):null,finished?field('한줄평 (선택)',pastOne):null,book?null:field('읽을 형식',format),book?null:field('읽으려는 이유 (선택)',why),advanced,error,h('button.primary.wide',{type:'submit',style:{marginTop:'18px'}},book?'수정 저장':finished?'읽은 책 등록':'책꽂이에 담기'));
    return form;
  },{onClose:()=>lookupController?.abort()});
}
export function renderStats(root,ctx){
  const state=ctx.repo.state,s=summary(state),rows=[];
  const d=new Date();for(let i=11;i>=0;i--){const m=new Date(d.getFullYear(),d.getMonth()-i,1),key=today(m).slice(0,7),count=state.readings.filter(r=>r.status==='finished'&&r.finishedAt.startsWith(key)).length;rows.push(h('tr',{},h('th',{scope:'row'},key),h('td',{},count+'회')));}
  mount(root,button('‹ 책장으로',()=>ctx.navigate('library'),'back'),head('독서의 흔적','재독과 날짜 미상 기록을 구분해서 집계해요.'),h('div.stats-list',{},...[[s.unique,'서로 다른 책'],[s.count,'재독 포함 완독'],[s.notes,'내용 있는 노트'],[s.avgDays??'—','평균 달력상 기간(일)']].map(([v,k])=>h('div.stat',{},h('strong',{},v),h('span',{},k)))),h('p.hint',{},`완독일 미상 ${s.undated}회는 월별 집계에서 제외해요. 평균 기간은 시작·완독일이 모두 있는 ${s.durationSamples}회 기준이에요.`),h('div.card',{style:{marginTop:'24px'}},h('h2',{},'최근 12개월'),h('div.table-scroll',{},h('table',{},h('thead',{},h('tr',{},h('th',{scope:'col'},'기간'),h('th',{scope:'col'},'완독'))),h('tbody',{},rows)))));
}
