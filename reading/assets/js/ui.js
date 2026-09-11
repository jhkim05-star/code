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
export function empty(title,body,action=null){return h('div.empty',{},h('div.empty-mark',{'aria-hidden':'true'},icon('bookmark')),h('h2',{},title),h('p',{},body),action);}
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
export function cover(book,large=false,reading=null){
  const fallback=h('span.cover-fallback',{},book.title);
  const format=reading?.format||'paper',box=h('span.cover'+(large?'.large':'')+`.format-${format}`,{'data-format':format},fallback);
  if(book.coverUrl){const img=h('img',{src:book.coverUrl,alt:'',loading:'lazy',decoding:'async',referrerPolicy:'no-referrer'});img.addEventListener('load',()=>{fallback.hidden=true;});img.addEventListener('error',()=>{img.remove();fallback.hidden=false;});box.append(img);}
  box.append(h('span.format-overlay',{'aria-hidden':'true'},icon(format),h('span',{},format==='paper'?'P':format==='ebook'?'E':'A')));
  if(reading?.rating)box.append(h('span.rating-overlay',{'aria-label':`별점 ${reading.rating.toFixed(1)}`},icon('star'),reading.rating.toFixed(1)));
  return box;
}
export const chips=(options,current,change)=>h('div.chips',{},...Object.entries(options).map(([key,label])=>button(label,()=>change(key),'chip',{'aria-pressed':String(key===current)})));
export function icon(name){
  const paths={
    shelf:'M3.5 19.5h17M5 5.5h3.5v12H5zM10.5 4h4v13.5h-4zM16.5 6l2.8-.8 3 10.8-2.8.8zM11.5 4v5l1-1 1 1V4',
    library:'M3.5 5.5h17v13h-17zM3.5 12h17M8 5.5v6.5M15.5 12v6.5M5.5 9h4M12.5 15.5h5',
    notes:'M6 3.5h10l2 2v15H6zM9 9h6M9 13h6M9 17h3M15.5 3.5v3h3M4 18.5l1.5 2',
    stats:'M4 19.5V11M9.5 19.5V6.5M15 19.5v-5M20.5 19.5V3.5M3 19.5h19M4 8l5.5-4 5.5 7 5.5-9',
    settings:'M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4M14 4v4M7 10v4M12 16v4',
    search:'M15.5 15.5l5 5M18 10a8 8 0 11-16 0a8 8 0 1116 0',plus:'M12 4v16M4 12h16',
    paper:'M3.5 5.5c3-1 5.5-.5 8.5 1.5v12c-3-2-5.5-2.5-8.5-1.5zM20.5 5.5c-3-1-5.5-.5-8.5 1.5v12c3-2 5.5-2.5 8.5-1.5z',
    ebook:'M6 3.5h12v17H6zM9 6.5h6M9 17.5h6M10 20.5h4',
    audio:'M4 14v-2a8 8 0 0116 0v2M4 13h3v6H5a1 1 0 01-1-1zM20 13h-3v6h2a1 1 0 001-1z',
    star:'M12 3.5l2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9z',
    bookmark:'M7 3.5h10v17l-5-3.5-5 3.5z',collection:'M4 5h12v14H4zM8 3h12v14M7 8h6M7 12h6'
  };
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.notes);svg.append(path);return svg;
}
