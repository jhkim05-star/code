/** Safe DOM primitives. User and API text is always a text node. */
export function h(spec,props,...kids){
  const [tag,...classes]=spec.split('.'),el=document.createElement(tag||'div');if(classes.length)el.classList.add(...classes);
  for(const [k,v]of Object.entries(props||{})){
    if(v===null||v===undefined)continue;
    if(k.startsWith('on')&&typeof v==='function')el.addEventListener(k.slice(2),v);
    else if(k==='style')Object.assign(el.style,v);
    else if(k==='class')el.className+=' '+v;
    else if(k in el && !k.startsWith('aria-') && !k.startsWith('data-'))el[k]=v;
    else el.setAttribute(k,String(v));
  }
  for(const child of kids.flat(Infinity))if(child!==null&&child!==undefined&&child!==false)el.append(child instanceof Node?child:document.createTextNode(String(child)));
  return el;
}
export function mount(root,...kids){root.replaceChildren(...kids.flat(Infinity).filter(x=>x!==null&&x!==false&&x!==undefined));}
let fieldSeq=0;
export function field(label,input,hint=''){const id=input.id||'reading-field-'+(++fieldSeq);input.id=id;const labelId=id+'-label',hintId=id+'-hint';if(!input.hasAttribute('aria-label'))input.setAttribute('aria-labelledby',labelId);if(hint)input.setAttribute('aria-describedby',hintId);return h('div.field',{},h('label.label',{htmlFor:id,id:labelId},label),input,hint?h('span.hint',{id:hintId},hint):null);}
export function button(text,fn,kind='',props={}){return h('button'+(kind?'.'+kind.split(' ').join('.'):''),{type:'button',onclick:fn,...props},text);}
export function input(value='',props={}){return h('input',{type:'text',value,...props});}
export function select(options,value,props={}){return h('select',props,...Object.entries(options).map(([v,label])=>h('option',{value:v,selected:v===String(value)},label)));}
export function textArea(value='',props={}){return h('textarea',{value,rows:4,...props});}
export function empty(title,body,action=null){return h('div.empty',{},h('div.empty-mark',{'aria-hidden':'true'},'◯'),h('h2',{},title),h('p',{},body),action);}
export function head(title,subtitle='',action=null){return h('div.page-head',{},h('div',{},h('h1',{tabIndex:-1},title),subtitle?h('p.sub',{},subtitle):null),action);}
let toastTimer;
export function toast(message){const el=document.getElementById('toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},3600);}
export async function task(el,fn){if(el.disabled)return;el.disabled=true;try{return await fn();}catch(e){toast(e.message||'작업을 마치지 못했어요.');return null;}finally{el.disabled=false;}}
export function modal(title,build,{onClose}={}){
  const previous=document.activeElement,d=h('dialog.sheet',{'aria-label':title});let ended=false;
  const close=(reason='cancel')=>{if(ended)return;ended=true;d.close();d.remove();onClose?.(reason);if(previous?.isConnected)previous.focus();};
  const body=h('div.sheet-body');d.append(h('header.sheet-head',{},h('h2',{},title),button('닫기',()=>close(),'quiet')),body);
  const content=build(close);if(content)body.append(content);document.body.append(d);d.showModal();
  d.addEventListener('cancel',e=>{e.preventDefault();close();});
  d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientY<r.top||e.clientY>r.bottom||e.clientX<r.left||e.clientX>r.right)close();}});
  return close;
}
export function confirm(title,message,yes='확인',danger=false){return new Promise(resolve=>{
  let answered=false;modal(title,close=>h('div',{},h('p',{},message),h('div.button-row',{},button('취소',()=>close()),button(yes,()=>{answered=true;close('confirm');resolve(true);},danger?'danger':'primary'))),{onClose:()=>{if(!answered)resolve(false);}});
});}
export function cover(book,large=false){
  const fallback=h('span.cover-fallback',{},book.title);
  const box=h('span.cover'+(large?'.large':''),{},fallback);
  if(book.coverUrl){const img=h('img',{src:book.coverUrl,alt:'',loading:'lazy',decoding:'async',referrerPolicy:'no-referrer'});img.addEventListener('load',()=>{fallback.hidden=true;});img.addEventListener('error',()=>{img.remove();fallback.hidden=false;});box.append(img);}
  return box;
}
export const chips=(options,current,change)=>h('div.chips',{},...Object.entries(options).map(([key,label])=>button(label,()=>change(key),'chip',{'aria-pressed':String(key===current)})));
export function icon(name){
  const paths={shelf:'M4 4v16M9 4v16M14 4v16M18 5l3 14',library:'M4 5h16v14H4zM8 5v14M12 5v14M16 5v14',notes:'M6 3h12v18H6zM9 8h6M9 12h6M9 16h3',settings:'M9 4h6l1 3 3 1v8l-3 1-1 3H9l-1-3-3-1V8l3-1zM9 12a3 3 0 106 0a3 3 0 10-6 0',search:'M16 16l5 5M18 10a8 8 0 11-16 0a8 8 0 1116 0',plus:'M12 4v16M4 12h16'};
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.notes);svg.append(path);return svg;
}
