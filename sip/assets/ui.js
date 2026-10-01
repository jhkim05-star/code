import{esc,KINDS,ACCENTS,BACKGROUNDS,summary,searchExperiences,today}from'./domain.js?v=1.3.0';
const paths={collection:'M3 9h18v12H3zM6 9V3h3v6m6 0V3h3v6M6 14h12',note:'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',search:'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',insights:'M4 20V10m6 10V4m6 16V8m6 12H2',settings:'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-7 0v6',camera:'M3 7h4l2-3h6l2 3h4v14H3zM16 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0',wine:'M8 2h8l2 8a6 6 0 0 1-12 0zM12 16v6M7 22h10',whisky:'M9 2h6v6l4 5v9H5v-9l4-5zM5 14h14',other:'M5 4h14l-2 17H7zM6 9h12',plus:'M12 4v16M4 12h16',close:'m5 5 14 14M19 5 5 19',arrow:'m9 4 8 8-8 8',upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z',spark:'m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z'};
export const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n]||paths.note}"/></svg>`;
export const button=(label,act,primary=false,extra='')=>`<button type="button" data-act="${act}" class="${primary?'primary':''}" ${extra}>${label}</button>`;
export function cover(b,r=null){return `<div class="cover">${b.cover?`<img src="${esc(b.cover)}" alt="${esc(b.title)} 라벨" loading="lazy">`:icon(b.kind)}<span class="badge">${KINDS[b.kind]}</span>${r!=null?`<span class="rating">★ ${Number(r).toFixed(1)}</span>`:''}</div>`;}
const head=(eyebrow,title,sub,action='')=>`<div class="page-head"><div>${eyebrow?`<p class="eyebrow">${esc(eyebrow)}</p>`:''}<h1>${esc(title)}</h1>${sub?`<p class="hint">${esc(sub)}</p>`:''}</div>${action}</div>`;
const empty=(title,desc,action='')=>`<div class="empty">${icon('note')}<h3>${title}</h3><p class="hint">${desc}</p>${action?`<div class="actions">${action}</div>`:''}</div>`;
export function collection(s,filter){
  const bs=s.bottles.filter(b=>!filter||b.kind===filter).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return head('','컬렉션','내가 마셔 본 술을 한 병씩 모아 봅니다.',button('내 취향 보기','taste'))
    +`<div class="pills">${[['','모두'],...Object.entries(KINDS)].map(([v,n])=>`<button class="pill" data-kind="${v}" aria-pressed="${v===filter}">${n}</button>`).join('')}</div>`
    +(bs.length?`<div class="grid">${bs.map(b=>{const memories=s.tastings.filter(t=>t.bottleId===b.id),rated=memories.filter(t=>t.rating!=null),rating=rated.length?rated.reduce((a,t)=>a+t.rating,0)/rated.length:null;return `<button class="bottle-card" data-bottle="${b.id}">${cover(b,rating)}<strong>${esc(b.title)}</strong><p class="hint">${esc([b.producer,b.vintage].filter(Boolean).join(' · '))}</p><p class="hint">${memories.length}번 마심</p></button>`;}).join('')}</div>`:empty('아직 모은 술이 없어요','그날의 기억을 남기면 여기에 한 병씩 모여요.',button('기록으로 가기','records')))
    +`<p class="footer-note">기록은 이 브라우저에 저장돼요. 소중한 기억은 백업으로도 간직해 주세요.</p>`;
}
export function noteCard(t,b){
  const photo=t.photos?.[0]||b.cover;
  return `<article class="note-card" data-tasting="${t.id}" tabindex="0" role="button" aria-label="${esc(b.title)} ${esc(t.date||'날짜 미상')} 기록 열기"><div class="memory-row">${photo?`<img class="note-thumb" src="${esc(photo)}" alt="" loading="lazy">`:''}<div class="memory-copy"><div class="row"><span class="note-date">${esc(t.date||'날짜 미상')}${t.trip?' · '+esc(t.trip):''}</span>${t.rating!=null?`<span class="small">★ ${t.rating.toFixed(1)}</span>`:''}</div><h3>${esc(b.title)}</h3><p class="excerpt">${esc((t.note||t.palate||t.originalText||'그날의 기억을 더 남겨보세요.').slice(0,100))}</p><p class="hint">${esc([t.city||t.visitCountry,t.venue].filter(Boolean).join(' · '))}${t.wantAgain?' · ♡ 또 마시고 싶어요':''}</p></div></div></article>`;
}
export function records(s){
  const rows=searchExperiences(s).rows;
  const intro=rows.length?`<section class="record-cta"><div><h2>그날의 잔을 남겨요</h2><p class="hint">사진 한 장과 한 줄이면 충분해요.</p></div><div class="actions">${button(icon('camera')+' 사진으로 기록','capture',true)}${button('직접 입력','new')}</div></section>`:`<section class="hero"><p class="eyebrow">SIP JOURNAL</p><h2>그날의 한 잔,<br>오늘의 한 문장.</h2><p class="hint">사진 한 장과 그날의 기억 한 줄부터 시작해요.</p><div class="actions">${button(icon('camera')+' 사진으로 기록','capture',true)}${button('직접 입력','new')}</div><div class="hero-art">${icon('wine')}</div></section>`;
  return head('','기록','그날 나는 뭘 마셨고, 어떤 순간이 남았을까요?')+intro+(rows.length?`<div class="section-head"><h2>최근 기록</h2></div>${rows.map(x=>noteCard(x.t,x.b)).join('')}`:'');
}
export const notes=records;
export function search(s,v){
  const result=searchExperiences(s,v.query,{kind:v.searchKind,year:v.year,minRating:v.minRating});
  const active=Boolean(v.query||v.searchKind||v.year||v.minRating);
  return head('','찾기','여행, 장소, 함께한 사람으로 기억을 찾아요.')
    +`<form id="search-form"><label class="field"><span>기억나는 말로 검색</span><div class="search-row"><input type="search" name="query" value="${esc(v.query)}" placeholder="지난 일본 여행에서 마셨던 와인은" enterkeyhint="search" autocomplete="off"><button class="primary" type="submit" aria-label="기록 찾기">${icon('search')}</button></div></label><details class="search-filters" ${v.searchKind||v.year||v.minRating?'open':''}><summary>필터</summary><div class="form-grid"><label class="field"><span>종류</span><select name="kind"><option value="">모두</option>${Object.entries(KINDS).map(([k,n])=>`<option value="${k}" ${k===v.searchKind?'selected':''}>${n}</option>`).join('')}</select></label><label class="field"><span>마신 연도</span><select name="year"><option value="">전체 기간</option>${summary(s).years.map(y=>`<option ${v.year===y?'selected':''}>${y}</option>`).join('')}</select></label><label class="field"><span>평점</span><select name="minRating"><option value="">전체</option><option value="4" ${v.minRating===4?'selected':''}>4점 이상</option></select></label></div></details></form>`
    +(active?`<div class="actions">${button('검색 지우기','search-clear')}</div>`:'')
    +`<p class="hint">내 기록만 이 기기에서 찾아요. 방문한 나라와 생산국도 구분합니다.</p><div class="section-head"><h2>${result.rows.length}개의 기록</h2></div>`
    +(result.description?`<div class="notice">${esc(result.description)}</div>`:'')
    +(result.rows.length?result.rows.map(x=>noteCard(x.t,x.b)).join(''):empty('아직 찾은 기록이 없어요','짧은 키워드로 다시 찾아보세요. 예: 교토, 가족, 와인.'));
}
export function taste(s){
  const rows=searchExperiences(s).rows,onePerBottle=items=>{const seen=new Set();return items.filter(({b})=>!seen.has(b.id)&&seen.add(b.id));};
  const wanted=onePerBottle(rows.filter(({t})=>t.wantAgain));
  const highlyRated=onePerBottle([...rows].filter(({t})=>t.rating>=4.5).sort((a,b)=>b.t.rating-a.t.rating||b.t.date.localeCompare(a.t.date)));
  const tripBest=new Map();for(const row of rows){const trip=row.t.trip;if(!trip)continue;const previous=tripBest.get(trip);if(!previous||Number(row.t.rating??-1)>Number(previous.t.rating??-1))tripBest.set(trip,row);}
  const repeated=s.bottles.map(b=>({b,count:s.tastings.filter(t=>t.bottleId===b.id).length})).filter(x=>x.count>=2).sort((a,b)=>b.count-a.count);
  const rated=rows.filter(({t})=>t.rating!=null),groups=new Map();
  if(rated.length>=5)for(const {b} of rated)for(const [name,value] of [['품종',b.grape],['지역',b.region],['캐스크',b.cask]]){if(!value)continue;const id=name+'|'+value;if(!groups.has(id))groups.set(id,{name,value,ids:new Set()});groups.get(id).ids.add(b.id);}
  const patterns=[...groups.values()].filter(g=>g.ids.size>=2).sort((a,b)=>b.ids.size-a.ids.size).slice(0,5);
  return head('','내 취향 보기','숫자보다 다시 떠오르는 잔을 먼저 모았어요.',button('컬렉션으로','collection'))
    +`<section class="panel"><h2>다시 마시고 싶은 술</h2>${wanted.length?wanted.slice(0,4).map(x=>noteCard(x.t,x.b)).join(''):'<p class="hint">기록에 ♡를 남기면 여기서 다시 볼 수 있어요.</p>'}</section>`
    +`<section class="panel"><h2>평점이 높았던 술</h2>${highlyRated.length?highlyRated.slice(0,4).map(x=>noteCard(x.t,x.b)).join(''):'<p class="hint">높은 평점을 남긴 잔이 모여요.</p>'}</section>`
    +`<section class="panel"><h2>여행에서 기억에 남은 잔</h2>${tripBest.size?[...tripBest.values()].slice(0,4).map(x=>noteCard(x.t,x.b)).join(''):'<p class="hint">여행 이름이 있는 기록이 모여요.</p>'}</section>`
    +`<section class="panel"><h2>여러 번 마신 술</h2>${repeated.length?repeated.slice(0,6).map(({b,count})=>`<button class="taste-bottle" data-bottle="${b.id}">${esc(b.title)} <span class="hint">${count}번 마심</span></button>`).join(''):'<p class="hint">같은 술을 다시 마신 기록이 생기면 보여드릴게요.</p>'}</section>`
    +`<section class="panel"><h2>기록에서 반복된 취향 단서</h2><p class="hint">평점 기록 5개 이상, 서로 다른 술 2종 이상일 때만 보여요. 취향을 단정하지 않는 참고 정보입니다.</p>${patterns.length?patterns.map(g=>`<p class="taste-pattern">${esc(g.name)} · ${esc(g.value)} <span class="hint">${g.ids.size}종 기록</span></p>`).join(''):'<p class="hint">조금 더 기록하면 취향이 보여요.</p>'}</section>`;
}
export const insights=taste;
export function familyStatus(status){
  if(!status?.configured)return '가족 AI 서버가 아직 연결되지 않았어요. 기기 내 기록과 검색은 사용할 수 있습니다.';
  if(!status.authorized)return '처음 한 번 가족 이용 코드를 입력해 주세요. ChatGPT 계정이나 API 키는 필요하지 않아요.';
  if(!status.apiConfigured)return '이 기기의 이용 승인은 완료됐어요. 운영자의 OpenAI API 키 설정이 남아 있습니다.';
  return status.lastSuccessAt?'OpenAI 응답 확인: '+new Date(status.lastSuccessAt).toLocaleString('ko-KR'):'서버 API 키가 준비됐어요. 아직 실제 응답을 확인하지 않았습니다.';
}
export function settings(s,status){
  return head('','설정','')
    +`<section class="panel"><h2>서재의 색</h2><div class="choices" style="margin:15px 0">${Object.entries(ACCENTS).map(([k,n])=>`<button data-setting="accent" data-value="${k}" aria-pressed="${s.settings.accent===k}">${n}</button>`).join('')}</div><div class="choices">${Object.entries(BACKGROUNDS).map(([k,n])=>`<button data-setting="background" data-value="${k}" aria-pressed="${s.settings.background===k}">${n}</button>`).join('')}</div></section>`
    +`<section class="panel"><div class="profile">${icon('spark')}<div><h2>가족 AI</h2><p class="hint">사진과 노트를 정리할 때만 사용해요.</p></div></div><div class="notice" id="family-status">${esc(familyStatus(status))}</div><div class="actions">${button(status?.authorized?'승인·연결 상태':'가족 이용 승인','connect')}</div></section>`
    +`<section class="panel"><h2>백업</h2><p class="hint">기록은 이 기기에 저장돼요. 다른 기기로 옮길 때는 JSON 백업을 사용해 주세요.</p><div class="actions" style="margin-top:16px">${button('전체 백업 내보내기','export')}${button('백업 가져오기','import')}</div></section>`
    +`<details class="advanced-settings"><summary>고급 설정</summary><section class="panel"><h2>대표사진 묶음</h2><p class="hint">일치하는 술의 빈 사진만 채우며 기존 사진과 기록은 유지합니다.</p>${button('대표사진 묶음 가져오기','import-covers')}</section><section class="panel"><h2>가족 AI 자세히</h2>${status?.authorized?`<p class="hint">승인된 기기: ${esc(status.user)}<br>오늘 이 기기: 분석·연결확인 ${status.usage?.dailyAnalysis||0}/${status.limits?.dailyAnalysis||10} · 웹 평가 ${status.usage?.dailyReviews||0}/${status.limits?.dailyReviews||3}<br>이번 달 가족 전체: 분석·연결확인 ${status.usage?.monthlyAnalysis||0}/${status.limits?.monthlyAnalysis||200} · 웹 평가 ${status.usage?.monthlyReviews||0}/${status.limits?.monthlyReviews||30}</p>`:''}<p class="hint">연결 확인은 유료 API 호출 1회를 사용할 수 있어요. 개인 기록은 자동으로 전송하지 않습니다.</p>${button('AI 연결 확인','check-ai',false,status?.authorized&&status?.apiConfigured?'':'disabled')}</section><section class="panel"><h2>앱 정보</h2><p class="hint">잔의 기록 1.3.0</p><div class="actions">${button('새 버전 확인','update')}${button('체험 화면','demo')}</div></section><section class="panel"><h2>이 기기 기록 초기화</h2><p class="hint">이 기기의 술 정보, 기록, 초안을 삭제합니다. 다른 기기와 가족 AI 승인은 그대로예요.</p><button type="button" class="danger" data-act="reset">이 기기 기록 초기화</button></section></details>`;
}
export function field(label,name,value='',type='text',extra=''){return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value??'')}" ${extra}></label>`;}
export function area(label,name,value='',placeholder=''){return `<label class="field"><span>${label}</span><textarea name="${name}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;}
export function editor(b,t){
  return `<form id="record-form"><p class="editor-status" id="draft-status">저장 버튼을 누르기 전까지는 초안입니다.</p>
  <div class="photo-strip">${[b.cover,...t.photos||[]].filter(Boolean).map(p=>`<img src="${esc(p)}" alt="기록에 첨부한 사진">`).join('')}</div><div class="actions">${button(icon('camera')+' 사진 추가','editor-photo')}${b.cover||t.photos?.length?button('첨부 사진 비우기','clear-photos'):''}</div>
  ${field('술 이름 *','title',b.title,'text','required maxlength="160"')}
  <div class="form-grid">${field('마신 날짜','date',t.date,'date')}${field('나의 평점 · 5점 만점','rating',t.rating,'number','min="0" max="5" step="0.5"')}</div>
  ${area('그날의 기억','note',t.note,'어디서 누구와, 어떤 기분이었나요? 한 줄도 좋아요.')}
  <label class="check-line want-again"><input type="checkbox" name="wantAgain" ${t.wantAgain?'checked':''}>♡ 또 마시고 싶어요</label>
  <div class="form-grid">${field('장소·식당','venue',t.venue)}${field('여행·모임','trip',t.trip)}</div>
  <details><summary>조금 더 기록하기</summary><div class="form-grid">${field('함께한 사람','companions',t.companions)}${field('마신 국가','visitCountry',t.visitCountry)}${field('도시','city',t.city)}${field('태그 · 쉼표로 구분','tags',Array.isArray(t.tags)?t.tags.join(', '):String(t.tags||''))}</div>${area('향','aroma',t.aroma)}${area('맛','palate',t.palate)}${area('여운','finish',t.finish)}${field('음식·분위기','occasion',t.occasion)}<div class="form-grid">${field('가격 · 선택','price',t.price,'number','min="0" step="0.01"')}<label class="field"><span>통화</span><select name="currency">${['KRW','JPY','EUR','USD','GBP'].map(c=>`<option ${c===t.currency?'selected':''}>${c}</option>`).join('')}</select></label></div></details>
  <details><summary>술 정보 확인·수정</summary><label class="field"><span>종류</span><select name="kind">${Object.entries(KINDS).map(([k,n])=>`<option value="${k}" ${b.kind===k?'selected':''}>${n}</option>`).join('')}</select></label><div class="form-grid">${field('생산자·증류소','producer',b.producer)}${field('생산 국가','country',b.country)}${field('생산 지역','region',b.region)}${field('빈티지','vintage',b.vintage)}${field('숙성 연수','age',b.age,'number','min="0" max="100"')}${field('알코올 도수 (%)','abv',b.abv,'number','min="0" max="100" step="0.1"')}${field('포도 품종','grape',b.grape)}${field('캐스크','cask',b.cask)}</div>${area('라벨에서 읽은 정보','labelText',b.labelText)}</details>
  <details><summary>스캔 원문·확인할 부분</summary>${area('원문 · 삭제하지 않고 보관해요','originalText',t.originalText)}${(t.aiWarnings||[]).map(w=>`<p class="notice">${esc(w)}</p>`).join('')}</details>
  <p id="record-error" class="error" role="alert"></p><button class="primary full-button" type="submit">기록 저장</button></form>`;
}

export function tastingDetail(b,t){
  const facts=[['마신 곳',[t.visitCountry,t.city,t.venue].filter(Boolean).join(' · ')],['함께한 사람',t.companions],['음식·분위기',t.occasion],['가격',t.price!=null?t.price.toLocaleString()+' '+t.currency:'']].filter(([,value])=>value);
  return `<div class="detail-title">${cover(b,t.rating)}<div><p class="note-date">${esc(t.date||'날짜 미상')}${t.trip?' · '+esc(t.trip):''}</p><h2>${esc(b.title)}</h2><p class="hint">${esc([t.city,t.venue].filter(Boolean).join(' · '))}</p></div></div>
    <div class="detail-note quote">${esc(t.note||'아직 남긴 문장이 없어요.')}</div>${t.wantAgain?'<p class="want-again">♡ 또 마시고 싶어요</p>':''}
    ${facts.length?`<div class="meta-grid">${facts.map(([key,value])=>`<div><span>${key}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`:''}
    ${[['향',t.aroma],['맛',t.palate],['여운',t.finish]].filter(([,value])=>value).map(([key,value])=>`<h3>${key}</h3><p class="detail-note">${esc(value)}</p>`).join('')}
    ${t.tags.map(tag=>`<span class="tag">${esc(tag)}</span>`).join('')}<div class="photo-strip">${t.photos.map(p=>`<img src="${esc(p)}" alt="그날의 사진">`).join('')}</div>
    ${t.originalText?`<details><summary>스캔 원문 보기</summary><p class="detail-note">${esc(t.originalText)}</p></details>`:''}
    <div class="actions">${button('기록 수정','edit',true,`data-id="${t.id}"`)}${button('같은 술 다시 기록','again',false,`data-id="${b.id}"`)}</div>
    <div class="actions">${button('이 술 정보·모든 기록 보기','open-bottle',false,`data-id="${b.id}"`)}</div>
    <button type="button" class="ghost danger full-button" data-act="delete" data-id="${t.id}" style="margin-top:16px">이 경험 기록 삭제</button>`;
}
export function bottleDetail(b,ts){
  const reviews=ts.filter(t=>t.webSummary||t.sources?.length),reviewed=reviews[0],target=reviewed||ts[0];
  return `<div class="detail-title">${cover(b)}<div><p class="eyebrow">${KINDS[b.kind]}</p><h2>${esc(b.title)}</h2><p class="hint">${esc([b.producer,b.country,b.region,b.vintage,b.age!=null?b.age+'년':'',b.abv!=null?b.abv+'%':''].filter(Boolean).join(' · '))}</p></div></div>
    ${ts.some(t=>t.wantAgain)?'<p class="want-again">♡ 다시 마시고 싶은 경험이 있어요</p>':''}${b.grape?`<p class="hint">품종: ${esc(b.grape)}</p>`:''}${b.cask?`<p class="hint">캐스크: ${esc(b.cask)}</p>`:''}
    ${b.labelText?`<details><summary>라벨·사진 메모</summary><p class="detail-note">${esc(b.labelText)}</p></details>`:''}
    <section class="panel"><h3>웹에서 본 평가</h3><p class="hint">내 경험과 분리된 참고 정보예요. 빈티지·에디션을 확인하세요.</p>
    ${reviewed?.webSummary?`<p class="detail-note small">${reviewSummary(reviewed)}</p>`:'<p class="hint">아직 웹 평가를 가져오지 않았어요.</p>'}
    <div class="link-list">${(reviewed?.sources||[]).map(source=>`<a target="_blank" rel="noopener noreferrer" href="${esc(source.url)}">${esc(source.title||new URL(source.url).hostname)}</a>`).join('')}</div>
    ${reviews.length>1?`<details><summary>이전에 보관한 웹 평가 ${reviews.length-1}개</summary>${reviews.slice(1).map(t=>`<p class="hint">${esc(t.date||'날짜 미상')}</p><p class="detail-note small">${reviewSummary(t)}</p><div class="link-list">${t.sources.map(source=>`<a target="_blank" rel="noopener noreferrer" href="${esc(source.url)}">${esc(source.title||new URL(source.url).hostname)}</a>`).join('')}</div>`).join('')}</details>`:''}
    ${target?button('출처와 함께 웹 평가 찾기','reviews',false,`data-id="${target.id}"`):''}</section>
    <div class="section-head"><h2>내가 마신 경험 · ${ts.length}번</h2></div>${ts.length?ts.map(t=>noteCard(t,b)).join(''):'<p class="hint">아직 이 술의 경험 기록이 없어요.</p>'}
    ${button('이 술 다시 기록','again',true,`data-id="${b.id}"`)}`;
}

export function suggestionsFrame(html){const csp="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:; base-uri 'none'; form-action 'none'";const doc=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><base target="_blank"></head><body>${html}</body></html>`;return `<iframe title="Google 검색 제안" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" style="border:0;width:100%;min-height:120px" srcdoc="${esc(doc)}"></iframe>`;}

export function reviewSummary(t){return String(t.webSummary||'').split(/(\[\d+\])/).map(part=>{const n=/^\[(\d+)\]$/.exec(part);const source=n?t.sources?.[Number(n[1])-1]:null;return source?`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer" aria-label="출처 ${n[1]}: ${esc(source.title)}">${part}</a>`:esc(part);}).join('');}
