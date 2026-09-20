/** Manual-only snapshot adapters. No background reads, no write-back. */
(function(root){
  'use strict';const D=root.HaruDomain;
  function unescape(s){return String(s||'').replace(/\\[nN]/g,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\');}
  function zoned(y,m,d,h,minute,sec,zone){
    if(!zone)return new Date(y,m-1,d,h,minute,sec);
    const target=Date.UTC(y,m-1,d,h,minute,sec);
    const f=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    let guess=target;
    for(let i=0;i<4;i++){const p=Object.fromEntries(f.formatToParts(new Date(guess)).map(p=>[p.type,p.value]));const shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);const delta=target-shown;if(!delta)return new Date(guess);guess+=delta;}
    throw new Error('해석할 수 없는 시간대 또는 일광절약시간 경계예요.');
  }
  function icsDate(prop){
    if(!prop)return null;const s=prop.value.trim(),m=/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(s);if(!m)throw new Error('지원하지 않는 날짜 형식');
    const date=`${m[1]}-${m[2]}-${m[3]}`;if(!D.validDate(date))throw new Error('날짜 오류');
    if(!m[4])return {date,allDay:true};if(+m[4]>23||+m[5]>59||+(m[6]||0)>59)throw new Error('시간 오류');
    const dt=m[7]?new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0))):zoned(+m[1],+m[2],+m[3],+m[4],+m[5],+(m[6]||0),prop.params.TZID);
    return {date:D.ymd(dt),dt,allDay:false};
  }
  function csvRows(text){
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted){quoted=false;}else if(cell===''){quoted=true;}else cell+=c;}
      else if(!quoted&&(c===','||c==='\n'||c==='\r')){row.push(cell);cell='';if(c!==','){if(row.some(v=>v!==''))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}}else cell+=c;
      if(rows.length>10000)throw new Error('한 번에 10,000행 이하의 파일을 사용해 주세요.');}
    if(quoted)throw new Error('CSV의 따옴표가 닫히지 않았어요.');row.push(cell);if(row.some(v=>v!==''))rows.push(row);return rows;
  }
  function clockDate(value,zone){
    const s=String(value||'').trim();if(!s)return null;
    if(D.validDate(s))return {date:s,allDay:true};
    const m=/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
    if(m){const date=`${m[1]}-${D.pad(+m[2])}-${D.pad(+m[3])}`;if(!D.validDate(date))throw new Error('날짜 오류');if(!m[4])return {date,allDay:true};if(+m[4]>23||+m[5]>59)throw new Error('시간 오류');const dt=zoned(+m[1],+m[2],+m[3],+m[4],+m[5],+(m[6]||0),zone);return {date:D.ymd(dt),allDay:false,dt};}
    if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(s))throw new Error('지원하지 않는 날짜 형식');
    const dt=new Date(s);if(!Number.isFinite(+dt))throw new Error('날짜 오류');return {date:D.ymd(dt),allDay:false,dt};
  }
  function eventCandidate({uid,title,start,end,note='',kind='calendar',done=false},date){
    if(!start)return null;let slot=null,allDay=!!start.allDay;
    if(allDay){const until=end?.allDay?end.date:D.shiftDay(start.date,1);if(date<start.date||date>=until)return null;}
    else {
      const b=D.bounds(date),stop=end?.dt||start.dt;
      if(+stop===+start.dt){if(start.date!==date)return null;}else if(stop<=b.start||start.dt>=b.end)return null;
      if(end?.dt&&end.dt>start.dt){const a=new Date(Math.max(+start.dt,+b.start)),z=new Date(Math.min(+end.dt,+b.end));const min=a.getHours()*60+a.getMinutes(),last=z>=b.end?1440:z.getHours()*60+z.getMinutes();
        if(last>min)slot={start:min,duration:last-min};else note+='\n이 일정은 시간대 전환 경계에 있어 원본 시간을 확인해 주세요.';
      }else note+=`\n시작 ${D.hm(start.dt.getHours()*60+start.dt.getMinutes())} · 종료 시각 미지정`;
    }
    return D.task({id:D.id(),title:title||'제목 없는 일정',done,note:note.trim(),slot,allDay,fixed:kind==='calendar'||kind==='google',source:{kind,key:`${kind}:${uid}:${date}`,title:title||'',start:start.dt?.toISOString()||start.date,end:end?.dt?.toISOString()||end?.date||'',importedAt:new Date().toISOString()}});
  }
  function parseICS(input,date){
    const warnings=[],candidates=[];const lines=input.replace(/^\uFEFF/,'').replace(/\r?\n[ \t]/g,'').split(/\r?\n/);
    if(!lines.some(l=>l.trim()==='BEGIN:VCALENDAR'))throw new Error('올바른 .ics 캘린더 파일이 아니에요.');
    let item=null,depth=0,unsupported=0;
    for(const l of lines){if(l==='BEGIN:VEVENT'||l==='BEGIN:VTODO'){item={_type:l.slice(6)};depth=1;continue;}
      if(!item)continue;if(l.startsWith('BEGIN:')){depth++;continue;}
      if(l==='END:VEVENT'||l==='END:VTODO'){
        try{
          if(item.STATUS?.value==='CANCELLED'){item=null;continue;}
          if(item.RRULE||item.RDATE){unsupported++;item=null;continue;}
          const start=icsDate(item.DTSTART||item.DUE),end=icsDate(item.DTEND||item.DUE),title=unescape(item.SUMMARY?.value||'제목 없는 일정');
          const c=eventCandidate({uid:item.UID?.value||D.hash(l+title+JSON.stringify(start)),title,start,end,note:unescape(item.DESCRIPTION?.value||''),kind:item._type==='VTODO'?'ticktick':'calendar',done:item.STATUS?.value==='COMPLETED'},date);if(c)candidates.push(c);
        }catch(e){warnings.push(`${unescape(item.SUMMARY?.value||'일정')}: ${e.message}`);}item=null;continue;
      }
      if(l.startsWith('END:')){depth--;continue;}if(depth!==1)continue;
      const colon=l.indexOf(':');if(colon<0)continue;const spec=l.slice(0,colon).split(';'),name=spec.shift().toUpperCase(),params={};for(const p of spec){const i=p.indexOf('=');if(i>0)params[p.slice(0,i).toUpperCase()]=p.slice(i+1).replace(/^"|"$/g,'');}item[name]={value:l.slice(colon+1),params};
    }
    if(unsupported)warnings.push(`반복 규칙이 있는 ${unsupported}개 일정은 임의로 펼치지 않았어요. Google 직접 조회는 반복 회차도 지원해요. 필요한 일정은 텍스트로도 추가할 수 있어요.`);
    if(item)throw new Error('끝나지 않은 일정이 있어요. 파일 전체를 선택해 주세요.');
    return {candidates,warnings};
  }
  function parseCSV(input,date){
    const rows=csvRows(input.replace(/^\uFEFF/,'')),warnings=[],candidates=[];
    const norm=s=>s.toLowerCase().replace(/[\s_-]/g,'');
    const header=rows.findIndex(r=>r.some(v=>['title','taskname','제목','할일','content'].includes(norm(v))));if(header<0)throw new Error('CSV에 Title 또는 제목 열이 필요해요.');
    const h=rows[header].map(norm),idx=names=>h.findIndex(v=>names.includes(v));
    const ti=idx(['title','taskname','제목','할일','content']),si=idx(['startdate','date','날짜','시작일']),di=idx(['duedate','마감일']),ni=idx(['content','description','note','메모']),ii=idx(['id','taskid']),zi=idx(['timezone']),ci=idx(['status','상태']);
    if(si<0&&di<0)throw new Error('오늘 항목을 고르려면 Date, Start Date 또는 Due Date 열이 필요해요. 날짜 없는 목록은 텍스트 붙여넣기를 사용해 주세요.');
    let missing=0;
    for(let r=header+1;r<rows.length;r++){const a=rows[r];if(!a[ti]?.trim())continue;try{
      const s=clockDate(a[si],a[zi]),due=clockDate(a[di],a[zi]),chosen=due?.date===date?due:s?.date===date?s:null;
      if(!chosen){if(!s&&!due)missing++;continue;}
      const title=a[ti].trim(),key=a[ii]||D.hash(`${title}|${a[si]||''}|${a[di]||''}`);
      const t=D.task({id:D.id(),title,done:['2','completed','완료'].includes(String(a[ci]||'').toLowerCase()),note:ni>=0&&ni!==ti?a[ni]||'':'',source:{kind:'ticktick',key:`ticktick:${key}:${date}`,title,importedAt:new Date().toISOString()},slot:null});candidates.push(t);
    }catch(e){warnings.push(`${r+1}행: ${e.message}`);}}
    if(missing)warnings.push(`날짜 없는 ${missing}개 항목은 오늘 할 일로 추정하지 않았어요.`);
    return {candidates,warnings};
  }
  function parseText(input,date){const lines=input.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(lines.length>500)throw new Error('한 번에 500줄 이하로 넣어 주세요.');
    const seen=new Set();const candidates=[];for(const line of lines){const done=/^[-*]?\s*\[[xX]\]/.test(line)||/^✓/.test(line),clean=line.replace(/^[-*]?\s*\[[ xX]\]\s*/,'').replace(/^[☐□✓]\s*/,'').replace(/^[-•]\s+/,'');
      let title=clean,slot=null;const m=/^(\d{2}:\d{2})\s*[-–~]\s*(\d{2}:\d{2})\s+(.+)$/.exec(clean);
      if(m){const start=D.minutes(m[1]),end=m[2]==='24:00'?1440:D.minutes(m[2]);if(start==null||end==null||end<=start)throw new Error(`시간 범위를 확인해 주세요: ${line}`);slot=D.span(start,end-start);title=m[3];}
      if(!title.trim())continue;const key=`text:${date}:${D.hash(clean)}`;if(seen.has(key))continue;seen.add(key);candidates.push(D.task({id:D.id(),title,done,slot,source:{kind:'text',key,title,importedAt:new Date().toISOString()}}));}
    return {candidates,warnings:[]};
  }
  async function json(url,token){const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),15000);try{const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:ac.signal,cache:'no-store'});if(!r.ok)throw new Error(r.status===401?'Google 연결이 만료됐어요. 다시 연결해 주세요.':r.status===403?'Calendar API 사용 설정과 읽기 권한을 확인해 주세요.':`Google 조회 실패 (${r.status})`);return await r.json();}finally{clearTimeout(timer);}}
  let sdkPromise;
  function loadGoogle(){if(root.google?.accounts?.oauth2)return Promise.resolve();if(sdkPromise)return sdkPromise;
    sdkPromise=new Promise((resolve,reject)=>{const el=document.createElement('script'),t=setTimeout(()=>reject(new Error('Google 연결 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')),15000);el.src='https://accounts.google.com/gsi/client';el.async=true;el.onload=()=>{clearTimeout(t);resolve();};el.onerror=()=>{clearTimeout(t);reject(new Error('Google 연결 모듈을 불러오지 못했어요.'));};document.head.append(el);}).catch(e=>{sdkPromise=null;throw e;});return sdkPromise;
  }
  function authorizeGoogle(clientId){return new Promise((resolve,reject)=>{const client=root.google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/calendar.readonly',callback:r=>{if(r.error||!r.access_token)reject(new Error('Google 읽기 권한을 허용하지 않았어요.'));else resolve(r.access_token);},error_callback:r=>reject(new Error(r.type==='popup_closed'?'연결을 취소했어요.':'Google 로그인 창을 열지 못했어요. Safari에서 다시 시도해 주세요.'))});client.requestAccessToken({prompt:'select_account'});});}
  async function fetchGoogleToday(token,date,calendarId='primary'){
    const base='https://www.googleapis.com/calendar/v3/calendars/',calendar=await json(base+encodeURIComponent(calendarId),token),b=D.bounds(date);let page='',loops=0;const candidates=[];
    do{const qs=new URLSearchParams({singleEvents:'true',orderBy:'startTime',timeMin:b.start.toISOString(),timeMax:b.end.toISOString(),maxResults:'250',showDeleted:'false'});if(page)qs.set('pageToken',page);
      const data=await json(base+encodeURIComponent(calendarId)+'/events?'+qs,token);if(!Array.isArray(data.items))throw new Error('Google 응답을 읽지 못했어요.');
      for(const e of data.items){if(e.status==='cancelled'||e.attendees?.some(a=>a.self&&a.responseStatus==='declined'))continue;
        const cv=x=>x?.date?{date:x.date,allDay:true}:x?.dateTime?clockDate(x.dateTime):null;
        const c=eventCandidate({uid:`${calendar.id||calendarId}:${e.id}`,title:e.summary||'제목 없는 일정',start:cv(e.start),end:cv(e.end),note:e.description||'',kind:'google'},date);if(c)candidates.push(c);
      }page=data.nextPageToken||'';if(++loops>20)throw new Error('오늘 일정이 너무 많아요. 캘린더 범위를 줄여 주세요.');
    }while(page);return {candidates,warnings:[]};
  }
  root.HaruImport={csvRows,parseCSV,parseICS,parseText,clockDate,icsDate,eventCandidate,loadGoogle,authorizeGoogle,fetchGoogleToday};
})(globalThis);
