/** 하루, 한 장 — pure, date-local domain rules. No IO and no remote services. */
(function (root) {
  'use strict';
  const APP = 'haru-page', VERSION = 1, MAX_TASKS = 500;
  const pad = n => String(n).padStart(2, '0');
  const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function validDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y,m,d] = s.split('-').map(Number), dt = new Date(y,m-1,d,12);
    return y >= 1900 && y <= 2199 && ymd(dt) === s;
  }
  function dateOf(s) { if (!validDate(s)) throw new Error('날짜를 확인해 주세요.'); const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d,12); }
  function shiftDay(s, n) { const d = dateOf(s); d.setDate(d.getDate()+n); return ymd(d); }
  function bounds(s) { const d = dateOf(s); d.setHours(0,0,0,0); const end=new Date(d); end.setDate(end.getDate()+1); return { start:d, end }; }
  const id = () => root.crypto?.randomUUID?.() || `h${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  function text(v, max, label, trim = false) { if (typeof v !== 'string' || v.length > max) throw new Error(`${label} 형식 또는 길이를 확인해 주세요.`); return trim ? v.trim() : v; }
  function hm(minutes) { return `${pad(Math.floor(minutes/60))}:${pad(minutes%60)}`; }
  function minutes(s) { if (!/^\d{2}:\d{2}$/.test(s||'')) return null; const [h,m]=s.split(':').map(Number); return h < 24 && m < 60 ? h*60+m : null; }
  function span(start, duration) { if (!Number.isInteger(start)||start<0||start>=1440||!Number.isInteger(duration)||duration<1||start+duration>1440) throw new Error('시간은 1분 이상, 오늘 24시 이내로 정해 주세요.'); return {start,duration}; }
  function task(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('할 일 형식이 올바르지 않아요.');
    const tid=text(raw.id,150,'할 일 ID',true), title=text(raw.title,500,'제목',true);
    if(!tid||!title) throw new Error('제목이 없는 할 일은 저장할 수 없어요.');
    if(raw.done!=null && typeof raw.done!=='boolean') throw new Error('완료 상태가 올바르지 않아요.');
    let slot=null; if(raw.slot!=null) slot=span(raw.slot.start,raw.slot.duration);
    const source=raw.source == null ? null : {
      kind:text(raw.source.kind,50,'출처',true), key:text(raw.source.key,1200,'원본 ID',true),
      title:text(raw.source.title||'',500,'원본 제목'), start:text(raw.source.start||'',100,'원본 시작'),
      end:text(raw.source.end||'',100,'원본 종료'), importedAt:text(raw.source.importedAt||'',50,'불러온 시각')
    };
    if(source && (!source.kind || !source.key)) throw new Error('원본 식별 정보가 없어요.');
    const movedTo=raw.movedTo||null; if(movedTo&&!validDate(movedTo)) throw new Error('이월 날짜를 확인해 주세요.');
    return {id:tid,title,done:!!raw.done,note:text(raw.note||'',10000,'할 일 메모'),slot,source,
      allDay:!!raw.allDay, fixed:!!raw.fixed, movedTo,
      carriedFrom:validDate(raw.carriedFrom)?raw.carriedFrom:null,
      createdAt:typeof raw.createdAt==='string'?raw.createdAt:new Date().toISOString()};
  }
  function emptyDay(date=ymd()) { if(!validDate(date))throw new Error('날짜 오류'); return {date,rev:0,note:'',tasks:[],updatedAt:''}; }
  function day(raw) {
    if(!raw||!validDate(raw.date)||!Array.isArray(raw.tasks)||raw.tasks.length>MAX_TASKS) throw new Error('하루 기록의 형식이 올바르지 않아요.');
    const tasks=raw.tasks.map(task), ids=new Set(); const sources=new Set();
    for(const t of tasks){if(ids.has(t.id))throw new Error('중복된 할 일 ID가 있어요.');ids.add(t.id); if(t.source){if(sources.has(t.source.key))throw new Error('중복된 외부 일정이 있어요.');sources.add(t.source.key);}}
    return {date:raw.date,rev:Number.isSafeInteger(raw.rev)&&raw.rev>=0?raw.rev:0,note:text(raw.note||'',300000,'오늘의 기록'),tasks,
      updatedAt:typeof raw.updatedAt==='string'?raw.updatedAt:''};
  }
  const createTask = title => task({id:id(),title,done:false,note:'',slot:null});
  function addTasks(d, titles) {
    const usable=titles.map(t=>String(t).trim()).filter(Boolean);
    if(d.tasks.length+usable.length>MAX_TASKS)throw new Error(`하루에 최대 ${MAX_TASKS}개까지 적을 수 있어요.`);
    d.tasks.push(...usable.map(createTask)); return usable.length;
  }
  function importInto(d, candidates) {
    const seen=new Set(d.tasks.flatMap(t=>t.source?[t.source.key]:[]));let added=0, skipped=0;
    for(const c of candidates){ const t=task(c); if(t.source&&seen.has(t.source.key)){skipped++;continue;} if(d.tasks.length>=MAX_TASKS)throw new Error('하루 항목 수 한도를 넘었어요.');d.tasks.push(t); if(t.source)seen.add(t.source.key);added++; }
    return {added,skipped};
  }
  function carryTask(t, from, to) {
    const copy=task({...t,id:id(),slot:null,carriedFrom:from,movedTo:null});
    if(copy.source){
      if(copy.source.kind==='text')copy.source.key=`text:${to}:${copy.source.key.split(':').at(-1)}`;
      else copy.source.key=copy.source.key.replace(/:\d{4}-\d{2}-\d{2}$/,':'+to);
    }
    return copy;
  }
  function conflicts(tasks) {
    const list=tasks.filter(t=>t.slot&&!t.movedTo), out=new Set();
    for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i].slot,b=list[j].slot;if(a.start<b.start+b.duration&&b.start<a.start+a.duration){out.add(list[i].id);out.add(list[j].id);}}
    return out;
  }
  function stats(d) { const tasks=d.tasks.filter(t=>!t.movedTo); const planned=tasks.filter(t=>t.slot).sort((a,b)=>a.slot.start-b.slot.start);
    // Count the union of occupied time, rather than double counting overlaps.
    let occupied=0,end=-1; for(const t of planned){const a=t.slot.start,b=a+t.slot.duration;occupied+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}
    return {total:tasks.length,done:tasks.filter(t=>t.done).length,planned:planned.length,occupied};
  }
  function backup(data) {
    if(!data||data.app!==APP||data.version!==VERSION||!Array.isArray(data.days)||data.days.length>36600)throw new Error('하루, 한 장 v1 백업 파일이 아니에요.');
    const days=data.days.map(day), dates=new Set();for(const d of days){if(dates.has(d.date))throw new Error('백업에 같은 날짜가 두 번 있어요.');dates.add(d.date);}
    return {app:APP,version:VERSION,days};
  }
  function mergeDay(local, incoming) {
    const next=day(local), known=new Set(next.tasks.map(t=>t.id)), sourceKeys=new Set(next.tasks.flatMap(t=>t.source?[t.source.key]:[]));
    for(const t of incoming.tasks){if(known.has(t.id)||(t.source&&sourceKeys.has(t.source.key)))continue;next.tasks.push(task(t));known.add(t.id);if(t.source)sourceKeys.add(t.source.key);}
    if(incoming.note && incoming.note!==next.note && !next.note.includes(incoming.note))next.note=next.note?`${next.note}\n\n── 가져온 기록 ──\n${incoming.note}`:incoming.note;
    return day(next);
  }
  function hash(s) {let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h.toString(16);}
  root.HaruDomain={APP,VERSION,MAX_TASKS,pad,ymd,validDate,dateOf,shiftDay,bounds,id,text,hm,minutes,span,task,day,emptyDay,createTask,addTasks,importInto,carryTask,conflicts,stats,backup,mergeDay,hash};
})(globalThis);
