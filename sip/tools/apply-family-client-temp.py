from pathlib import Path
import re,json
r=Path('sip')
p=r/'assets/domain.js';s=p.read_text().replace("VERSION='1.0.0'","VERSION='1.1.0'").replace("provider:'gemini'","provider:'openai'").replace("provider:raw.settings?.provider==='openai'?'openai':'gemini'","provider:'openai'");p.write_text(s)
p=r/'assets/api.js';s=p.read_text();s=s.replace("let session={configured:false,user:null,connected:{}};","let session={mode:'shared-openai',configured:false,authorized:false,apiConfigured:false,state:'server-unavailable',connected:{}};")
s=s.replace("if(!r.ok)throw new Error(data.error||'요청을 완료하지 못했어요.');","if(!r.ok){const error=new Error(data.error||'요청을 완료하지 못했어요.');error.code=data.code;error.status=r.status;throw error;}")
s=s.replace("session={configured:false,user:null,connected:{}};","session={mode:'shared-openai',configured:false,authorized:false,apiConfigured:false,state:'server-unavailable',connected:{}};")
s=s.replace("export function connected(provider){return Boolean(session.configured&&session.user&&session.connected?.[provider]);}","export function connected(){return Boolean(session.mode==='shared-openai'&&session.configured&&session.authorized&&session.apiConfigured);}")
p.write_text(s)
p=r/'assets/ui.js';s=p.read_text();start=s.index('export function settings(');end=s.index('export function field(',start)
settings='''export function familyStatus(status){
  if(!status?.configured)return '가족 AI 서버가 아직 연결되지 않았어요. 기기 내 기록과 검색은 사용할 수 있습니다.';
  if(!status.authorized)return '처음 한 번 가족 이용 코드를 입력해 주세요. ChatGPT 계정이나 API 키는 필요하지 않아요.';
  if(!status.apiConfigured)return '이 기기의 이용 승인은 완료됐어요. 운영자의 OpenAI API 키 설정이 남아 있습니다.';
  return status.lastSuccessAt?'OpenAI 응답 확인: '+new Date(status.lastSuccessAt).toLocaleString('ko-KR'):'서버 API 키가 준비됐어요. 아직 실제 응답을 확인하지 않았습니다.';
}
export function settings(s,status){return head('MAKE IT YOURS','설정','익숙한 색과 편안한 기록 방식으로.')+`<section class="panel"><h2>서재의 색</h2><p class="hint">강조색과 배경을 따로 고를 수 있어요.</p><div class="choices" style="margin:15px 0">${Object.entries(ACCENTS).map(([k,n])=>`<button data-setting="accent" data-value="${k}" aria-pressed="${s.settings.accent===k}">${n}</button>`).join('')}</div><div class="choices">${Object.entries(BACKGROUNDS).map(([k,n])=>`<button data-setting="background" data-value="${k}" aria-pressed="${s.settings.background===k}">${n}</button>`).join('')}</div></section>
<section class="panel"><div class="profile">${icon('spark')}<div><h2>가족 AI 도우미</h2><p class="hint">OpenAI로 사진과 노트를 정리해요.</p></div></div><div class="notice" id="family-status">${esc(familyStatus(status))}</div><p class="hint">가족은 AI 계정이나 구독 없이 사용합니다. 분석 비용은 운영자가 부담하며, API 키는 서버에서만 관리해요.</p>
${status?.authorized?`<p class="hint" style="margin-top:12px">승인된 기기: ${esc(status.user)}<br>오늘 이 기기: 분석·연결확인 ${status.usage?.dailyAnalysis||0}/${status.limits?.dailyAnalysis||10} · 웹 평가 ${status.usage?.dailyReviews||0}/${status.limits?.dailyReviews||3}<br>이번 달 가족 전체: 분석·연결확인 ${status.usage?.monthlyAnalysis||0}/${status.limits?.monthlyAnalysis||200} · 웹 평가 ${status.usage?.monthlyReviews||0}/${status.limits?.monthlyReviews||30}</p>`:''}
<div class="actions" style="margin-top:16px">${button(status?.authorized?'승인·연결 상태':'가족 이용 승인','connect',true)}${button('AI 연결 확인','check-ai',false,status?.authorized&&status?.apiConfigured?'':'disabled')}</div><p class="hint" style="margin-top:12px">연결 확인도 짧은 API 호출 1회를 사용해요. 호출 실패·시간초과도 비용 보호 한도에 포함될 수 있습니다. 한도는 결제 금액 자체의 상한이 아닙니다.</p></section>
<section class="panel"><h2>기록과 백업</h2><p class="hint">사진·원문·평점·경험은 이 브라우저에 저장합니다. 가족 이용 승인은 AI 사용 권한이며 기록 동기화나 개인 노트 잠금 기능은 아니에요.</p><div class="actions" style="margin-top:16px">${button('전체 백업 내보내기','export')}${button('백업 가져오기','import')}</div><p class="hint" style="margin-top:12px">서버 주소가 바뀌면 기존 주소에서 백업한 뒤 새 주소에서 가져오세요. 다른 기기에는 자동 동기화되지 않습니다.</p></section><section class="panel"><h2>앱 정보</h2><p class="hint">잔의 기록 1.1.0 · 가족 공용 AI<br>선택한 사진·텍스트만 동의 후 전송합니다. 웹 평가는 별도로 요청할 때만 검색해요.</p><div class="actions" style="margin-top:15px">${button('새 버전 확인','update')}${button('체험 화면','demo')}</div></section>`;}
'''
s=s[:start]+settings+s[end:]
s=s.replace('<p class="detail-note small">${esc(t.webSummary)}</p>','<p class="detail-note small">${reviewSummary(t)}</p>')
s=s.replace("${t.searchSuggestions?suggestionsFrame(t.searchSuggestions):''}",'')
s+='''\nexport function reviewSummary(t){return String(t.webSummary||'').split(/(\\[\\d+\\])/).map(part=>{const n=/^\\[(\\d+)\\]$/.exec(part);const source=n?t.sources?.[Number(n[1])-1]:null;return source?`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer" aria-label="출처 ${n[1]}: ${esc(source.title)}">${part}</a>`:esc(part);}).join('');}\n'''
p.write_text(s)
p=r/'assets/app.js';s=p.read_text();s=s.replace('scanRevision=null;',"scanRevision=null,checkingAI=false;")
s=s.replace("${state().settings.provider==='gemini'?'Gemini':'OpenAI'}",'OpenAI')
s=s.replace('무료 API의 데이터 정책도 확인하세요.','분석 비용은 운영자가 부담합니다. 개인 메모가 포함되는지 확인해 주세요.')
s=s.replace('<p id="scan-error" class="error" role="alert"></p>','<p id="scan-error" class="error" role="alert"></p><button type="button" data-act="scan-approval" id="scan-approval" hidden>가족 이용 승인 · 입력 보존</button>')
s=s.replace('연결 전에도 기존 ChatGPT·Gemini로 정리하기','외부에서 정리한 결과 가져오기 · 선택')
s=s.replace('<a href="https://gemini.google.com/" target="_blank" rel="noopener noreferrer">Gemini 열기</a>','')
s=s.replace('connected(state().settings.provider)','connected()')
s=s.replace("body:{provider:state().settings.provider,mode:scanMode,images:scanImages,text:scanText}","body:{requestId:uid(),mode:scanMode,images:scanImages,text:scanText}")
s=s.replace("err.textContent='AI 연결이 아직 활성화되지 않았어요. 설정의 연결 안내 또는 아래의 기존 AI 결과 가져오기를 이용해 주세요.';return;","err.textContent=UI.familyStatus(session);$('#scan-approval').hidden=false;return;")
s=s.replace("body.querySelector('[name=scanText]').oninput=e=>{scanText=e.target.value;};","body.querySelector('[name=scanText]').oninput=e=>{scanText=e.target.value;clearTimeout(draftTimer);draftTimer=setTimeout(()=>saveScanDraft().catch(()=>toast('초안 저장 실패 · 입력을 복사해 주세요.')),500);};")
s=s.replace("async function analyze(){","async function saveScanDraft(){if(view.demo)return;clearTimeout(draftTimer);const data={mode:'scan',scanMode,scanImages:[...scanImages],scanText};await store.saveDraft(data);recoverDraft=data;}\nasync function analyze(){")
s=s.replace("pendingAI=new AbortController();const controller=pendingAI;try{const data=await api('analyze'","pendingAI=new AbortController();const controller=pendingAI;try{await saveScanDraft();if(controller.signal.aborted||generation!==modalGeneration)return;const data=await api('analyze'")
s=s.replace("catch(e){if(err.isConnected)err.textContent=e.message;}finally{btn.disabled=false;btn.textContent='AI로 정리하기';}","catch(e){if(err.isConnected){err.textContent=e.message;if(e.status===401)$('#scan-approval').hidden=false;}}finally{btn.disabled=false;btn.textContent='AI로 정리하기';}")
start=s.index('async function reviews(');end=s.index('function download(',start)
s=s[:start]+'''async function reviews(id){
  const t=state().tastings.find(x=>x.id===id),b=state().bottles.find(x=>x.id===t?.bottleId);if(!b||!t||pendingAI)return;
  const generation=modalGeneration;session=await getSession();if(generation!==modalGeneration)return;
  if(view.demo){toast('체험 화면에서는 AI를 호출하지 않아요.');return;}
  if(!connected()){toast(UI.familyStatus(session));return;}
  if(!confirm('제품명·생산자·빈티지·숙성·도수만 웹 검색합니다. 개인 감상과 여행 정보는 전송하지 않아요. 조회할까요?'))return;
  const expected=state().revision,controller=new AbortController();pendingAI=controller;toast('출처가 있는 평가를 찾아보고 있어요.');
  try{const result=await api('reviews',{method:'POST',body:{requestId:uid(),bottle:{title:b.title,producer:b.producer,kind:b.kind,vintage:b.vintage,age:String(b.age??''),abv:String(b.abv??''),cask:b.cask}},signal:controller.signal});
    if(controller.signal.aborted||generation!==modalGeneration||!sheet.open)return;
    const next=structuredClone(state()),target=next.tastings.find(x=>x.id===id);if(!target)throw new Error('기록이 삭제되어 결과를 적용하지 않았어요.');
    target.webSummary=result.summary||'';target.searchSuggestions='';target.sources=result.sources||[];
    if(!target.sources.length)throw new Error('확인할 출처가 없어 평가를 저장하지 않았어요.');
    await persist(next,expected);if(generation===modalGeneration)openTasting(id);toast(result.cached?'보관된 웹 평가를 불러왔어요. 추가 AI 호출은 없어요.':'외부 평가와 출처를 저장했어요.');
  }catch(e){if(!controller.signal.aborted)toast(e.message);}finally{if(pendingAI===controller)pendingAI=null;}
}
''' + s[end:]
start=s.index('async function connection(');end=s.index('async function act(',start)
s=s[:start]+'''async function connection(resumeScan=false){
  if(resumeScan)await saveScanDraft();const generation=modalGeneration;session=await getSession();if(generation!==modalGeneration)return;
  const back=resumeScan?UI.button('사진·노트로 돌아가기','resume-scan'):'';
  if(!session.configured){open('가족 AI 연결 준비',`<div class="notice">${esc(UI.familyStatus(session))}</div><p class="detail-note small">운영자가 HTTPS 서버에 OpenAI API 키 하나를 등록하면 가족 모두 같은 AI 도우미를 사용합니다. ChatGPT 로그인이나 가족별 API 키는 필요하지 않아요.</p><p class="hint">지금은 API 서버 활성화가 남아 있어요. 사진·작성 내용은 보존합니다.</p>${back}<p><a href="README.md" target="_blank" rel="noopener noreferrer">운영자 설정 안내</a></p>`);return;}
  if(!session.authorized){open('가족 이용 승인',`<p class="hint">처음 한 번만 운영자가 알려준 가족 코드를 넣어 주세요. AI 계정이나 비밀번호는 필요하지 않습니다.</p><form id="family-form">${UI.field('이 기기의 이름','name','','text','required maxlength="40" placeholder="예: 내 아이패드"')}${UI.field('가족 이용 코드','code','','password','required minlength="24" maxlength="200" autocomplete="off" spellcheck="false"')}<p class="hint">코드는 가족끼리만 공유하세요. 승인은 이 브라우저에 유지되며 장기간 미사용·쿠키 삭제·운영자의 코드 변경 시 다시 요청합니다.</p><p id="family-error" class="error" role="alert"></p><button class="primary full-button" type="submit">이 기기에서 사용하기</button></form>${back}`);
    const epoch=modalGeneration;$('#family-form').onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector('[type=submit]'),values=Object.fromEntries(new FormData(e.target));btn.disabled=true;
      try{const result=await api('approve',{method:'POST',body:values});if(epoch!==modalGeneration)return;setSession(result);session=result;e.target.reset();await close(true);if(resumeScan)capture(scanMode,true);else render();toast('가족 이용 승인을 완료했어요.');}
      catch(err){if($('#family-error'))$('#family-error').textContent=err.message;}finally{btn.disabled=false;}};return;
  }
  open('가족 AI 연결 상태',`<div class="notice">${esc(UI.familyStatus(session))}</div><p class="hint">이 기기: ${esc(session.user)}<br>운영자 OpenAI API를 사용하며 가족에게 API 키를 나눠주지 않습니다. 승인 해제는 이 기기의 AI 사용 권한만 끕니다. 기기 내 노트는 삭제하거나 숨기지 않아요.</p><div class="actions" style="margin-top:18px">${UI.button('AI 연결 확인','check-ai',true,session.apiConfigured?'':'disabled')}${UI.button('이 기기 승인 해제','logout')}</div>${back}`);
}
async function checkAI(){
  if(checkingAI||view.demo)return;checkingAI=true;const el=document.querySelector('[data-act=check-ai]:not(:disabled)');if(el)el.disabled=true;
  try{session=await getSession();if(!connected())throw new Error(UI.familyStatus(session));const result=await api('check',{method:'POST',body:{requestId:uid()}});if(!result.verified)throw new Error('AI 응답을 확인하지 못했어요.');session=await getSession();if(!sheet.open)render();else if($('#sheet-title').textContent==='가족 AI 연결 상태')await connection();toast('OpenAI가 실제 응답했어요. 사진 분석을 사용할 수 있습니다.');}
  catch(e){toast(e.message);}finally{checkingAI=false;if(el?.isConnected)el.disabled=false;}
}
''' + s[end:]
s=s.replace("case'connect':await connection();break;","case'connect':await connection();break;case'scan-approval':await connection(true);break;case'resume-scan':capture(scanMode,true);break;case'check-ai':await checkAI();break;")
s=s.replace("case'disconnect':await api('disconnect',{method:'POST',body:{provider:el.dataset.value}});session=await getSession();toast('연결을 해제했어요.');break;",'')
s=s.replace("async function analyze(){const err", "async function analyze(){if(view.demo){toast('체험 화면에서는 AI를 호출하지 않아요.');return;}const err")
s=s.replace("if(dirty&&!await saveDraftNow())", "if(body.querySelector('[name=scanText]')){try{await saveScanDraft();}catch{toast('사진·노트 초안을 저장하지 못했어요. 창을 닫지 않았습니다.');return false;}}if(dirty&&!await saveDraftNow())")
s=s.replace("render();if('serviceWorker'in navigator", "render();if(view.tab==='settings')getSession().then(s=>{session=s;if(view.tab==='settings'&&!sheet.open)render();});if('serviceWorker'in navigator")
p.write_text(s)
for name in ['app','ui','storage','api']:
 p=r/f'assets/{name}.js';s=p.read_text();s=re.sub(r"from'\./([\w-]+)\.js'",r"from'./\1.js?v=1.1.0'",s);p.write_text(s)
p=r/'sw.js';s=p.read_text().replace('v1.0.0','v1.1.0').replace('?v=1.0.0','?v=1.1.0')
for n in ['domain','storage','ui','api']:s=s.replace(f"'./assets/{n}.js'",f"'./assets/{n}.js?v=1.1.0'")
p.write_text(s)
p=r/'index.html';p.write_text(p.read_text().replace('v=1.0.0','v=1.1.0'))
p=r/'version.json';p.write_text(json.dumps({'version':'1.1.0','build':'sip-family-openai','aiDeployment':'requires-server-configuration'},indent=2)+'\n')
p=r/'package.json';d=json.loads(p.read_text());d['version']='1.1.0';d['scripts']['check']='node tools/check.mjs';p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=r/'tests/domain.test.mjs';s=p.read_text().replace('sip-journal-v1.0.0','sip-journal-v1.1.0').replace("'app.js?v=1.0.0','domain.js','ui.js','storage.js','api.js'","'app.js?v=1.1.0','domain.js?v=1.1.0','ui.js?v=1.1.0','storage.js?v=1.1.0','api.js?v=1.1.0'");p.write_text(s)
p=r/'tests/browser.mjs';s=p.read_text().replace("headless:true,args:['--no-sandbox']", "headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']");p.write_text(s+'\nawait import("./family-browser.mjs");\n')
