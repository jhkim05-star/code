import { APP,VERSION,FORMATS,GENRES,ORIGINS,emptyState,normalizeBook,normalizeReading,normalizeNote,noteHasContent,readingsFor,suggestedCollection } from './domain.js';

export const BOOKMORY_SHEET='책 목록';
export const BOOK_HEADERS=['책 제목','저자','역자','일러스트레이터','나레이터','출판사','출판일','언어','ISBN','책 유형','전체 페이지 수','사용 중인 태그들','컬렉션','구매하고 싶은 책','읽기 상태'];
export const ROUND_HEADERS=['읽은 기간','별점','의견','읽은 시간'];
const encoder=new TextEncoder(),decoder=new TextDecoder();
const xmlDecode=value=>String(value||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const xmlEncode=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const cellColumn=ref=>{let n=0;for(const ch of ref.match(/^[A-Z]+/)?.[0]||'')n=n*26+ch.charCodeAt(0)-64;return n-1;};
const columnName=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};

async function asBytes(input){
  if(input instanceof Uint8Array)return input;
  if(input instanceof ArrayBuffer)return new Uint8Array(input);
  if(input?.arrayBuffer)return new Uint8Array(await input.arrayBuffer());
  throw new Error('Excel 파일을 읽을 수 없어요.');
}
async function inflateRaw(bytes){
  if(typeof DecompressionStream==='undefined')throw new Error('이 브라우저는 압축된 Excel 파일을 열 수 없어요. 최신 브라우저에서 다시 시도해 주세요.');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzip(input){
  const bytes=await asBytes(input);if(bytes.length>30000000)throw new Error('30MB 이하의 Excel 파일을 골라 주세요.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw new Error('올바른 XLSX 압축 구조가 아니에요.');
  const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true),files=new Map();let cursor=offset;
  for(let i=0;i<count;i++){
    if(view.getUint32(cursor,true)!==0x02014b50)throw new Error('Excel 파일 목록이 손상됐어요.');
    const method=view.getUint16(cursor+10,true),size=view.getUint32(cursor+20,true),nameLength=view.getUint16(cursor+28,true),extraLength=view.getUint16(cursor+30,true),commentLength=view.getUint16(cursor+32,true),local=view.getUint32(cursor+42,true);
    const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLength));
    const localName=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true),start=local+30+localName+localExtra,compressed=bytes.subarray(start,start+size);
    files.set(name,method===0?compressed:method===8?await inflateRaw(compressed):null);
    cursor+=46+nameLength+extraLength+commentLength;
  }
  return files;
}
const fileText=(files,name,required=true)=>{
  const bytes=files.get(name);if(!bytes&&required)throw new Error(`Excel 내부 파일이 없어요: ${name}`);
  if(bytes===null)throw new Error('지원하지 않는 Excel 압축 방식이에요.');
  return bytes?decoder.decode(bytes):'';
};
function sharedStrings(xml){
  const values=[];for(const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g))values.push([...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x=>xmlDecode(x[1])).join(''));
  return values;
}
function sheetRows(xml,shared){
  const rows=[];
  for(const rowMatch of xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)){
    const row=[];
    for(const cell of rowMatch[2].matchAll(/<c\b([^>]*)\br="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)){
      const attrs=cell[1]+cell[3],body=cell[4],type=/\bt="([^"]+)"/.exec(attrs)?.[1]||'';let value='';
      if(type==='inlineStr')value=[...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x=>xmlDecode(x[1])).join('');
      else{const raw=/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1]??'';value=type==='s'?(shared[Number(raw)]??''):xmlDecode(raw);}
      row[cellColumn(cell[2])]=value;
    }
    rows[Number(rowMatch[1])-1]=row;
  }
  return rows;
}
function parseDate(value){
  const match=String(value||'').trim().match(/^(\d{4})[/.]\s*(\d{1,2})[/.]\s*(\d{1,2})\.?$/);if(!match)return '';
  const iso=`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`,date=new Date(iso+'T00:00:00Z');
  return date.toISOString().slice(0,10)===iso?iso:'';
}
function parsePeriod(value){
  const raw=String(value||'').trim();if(!raw)return {start:'',end:''};
  const parts=raw.split(/\s*~\s*/);if(parts.length!==2)throw new Error(`읽은 기간 형식을 확인해 주세요: ${raw}`);
  const start=parseDate(parts[0]),end=parseDate(parts[1]);if(!start)throw new Error(`읽기 시작일 형식을 확인해 주세요: ${raw}`);if(parts[1]&&!end)throw new Error(`완독일 형식을 확인해 주세요: ${raw}`);if(end&&end<start)throw new Error(`완독일이 시작일보다 빨라요: ${raw}`);return {start,end};
}
const splitPeople=value=>String(value||'').split(/\s*[,;]\s*/).map(x=>x.trim()).filter(Boolean);
const splitTags=value=>String(value||'').trim().split(/\s+(?=#)/).map(x=>x.replace(/^#/,'').trim()).filter(Boolean);
function marker(tags,prefix){return tags.find(x=>x.startsWith(prefix))?.slice(prefix.length).replaceAll('_',' ')||'';}
function mappedGenre(tags){const explicit=marker(tags,'장르_');if(explicit&&GENRES.includes(explicit))return explicit;const joined=tags.join(' ');return GENRES.find(g=>g!=='기타'&&joined.includes(g))||(joined.includes('소설/시/희곡')?'소설':'');}
function mappedOrigin(tags){const value=marker(tags,'출처_');return Object.entries(ORIGINS).find(([,label])=>label===value)?.[0]||'';}
function stableId(prefix,parts,used){
  let hash=2166136261;for(const ch of parts.join('|').normalize('NFKC'))hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0;
  const base=`${prefix}_${hash.toString(36)}`;let id=base,n=2;while(used.has(id))id=`${base}_${n++}`;used.add(id);return id;
}
function statusFrom(value,{start,end},fallback='planned'){
  if(end)return 'finished';const raw=String(value||'');if(/읽고/.test(raw))return 'reading';if(/멈/.test(raw))return 'paused';if(/그만|포기/.test(raw))return 'abandoned';if(/다 읽|완독/.test(raw))return start?'reading':'finished';return start?'reading':fallback;
}
function formatFrom(value){const raw=String(value||'').trim();if(raw==='종이책')return'paper';if(raw==='전자책')return'ebook';if(raw==='오디오북')return'audio';throw new Error(`지원하지 않는 책 유형이에요: ${raw||'빈 값'}`);}
function parseRating(value){if(value===''||value==null)return null;const n=Number(value);if(!Number.isFinite(n)||n<0||n>5||n*2!==Math.round(n*2))throw new Error(`별점은 0.5점 단위여야 해요: ${value}`);return n===0?null:n;}
function pageCount(value,format){const raw=String(value||'').trim();if(!raw||/%$/.test(raw))return null;const match=raw.match(/^p\.\s*([\d,]+)$/i);if(!match)throw new Error(`전체 페이지 수 형식을 확인해 주세요: ${raw}`);const n=Number(match[1].replaceAll(',',''));if(!Number.isInteger(n)||n<0)throw new Error(`페이지 수를 확인해 주세요: ${raw}`);return format==='audio'?null:n;}
function statusLabel(readings){const active=readings.find(r=>!['finished','abandoned'].includes(r.status));if(active)return active.status==='reading'?'읽고있는 중':active.status==='paused'?'읽기를 잠시 멈췄어요.':'읽을 예정이에요!';return readings.some(r=>r.status==='finished')?'다 읽었어요!':readings.some(r=>r.status==='abandoned')?'그만 읽었어요.':'읽을 예정이에요!';}
const stampFor=(period,index)=>`${period.start||'2000-01-01'}T00:00:${String(index).padStart(2,'0')}.000Z`;

export async function parseBookmoryXlsx(input){
  const files=await unzip(input),workbook=fileText(files,'xl/workbook.xml');
  const sheetNames=[...workbook.matchAll(/<sheet\b[^>]*\bname="([^"]+)"/g)].map(x=>xmlDecode(x[1]));
  if(sheetNames.length!==1||sheetNames[0]!==BOOKMORY_SHEET)throw new Error(`시트 이름은 '${BOOKMORY_SHEET}' 하나여야 해요.`);
  const shared=sharedStrings(fileText(files,'xl/sharedStrings.xml',false)),rows=sheetRows(fileText(files,'xl/worksheets/sheet1.xml'),shared);
  const group=rows[0]||[],headers=rows[1]||[];
  for(let i=0;i<BOOK_HEADERS.length;i++)if(headers[i]!==BOOK_HEADERS[i])throw new Error(`열 ${i+1}은 '${BOOK_HEADERS[i]}'이어야 해요.`);
  const rounds=Math.max(1,Math.ceil((headers.length-BOOK_HEADERS.length)/ROUND_HEADERS.length));
  for(let n=0;n<rounds;n++){
    const offset=BOOK_HEADERS.length+n*4;if(group[offset]!==`${n+1} 회차 읽은 기록`)throw new Error(`${n+1} 회차 머리글을 확인해 주세요.`);
    for(let j=0;j<4;j++)if(headers[offset+j]!==ROUND_HEADERS[j])throw new Error(`${n+1} 회차의 '${ROUND_HEADERS[j]}' 열을 확인해 주세요.`);
  }
  const state=emptyState(),warnings=[],ids=new Set();let rowNumber=2;
  for(const row of rows.slice(2)){rowNumber++;if(!row?.some(value=>String(value??'').trim()))continue;
    try{
      const title=String(row[0]||'').trim();if(!title)throw new Error('책 제목이 비어 있어요.');
      const format=formatFrom(row[9]),tags=splitTags(row[11]),visibleTags=tags.filter(x=>!/^장르_|^출처_|^시리즈_/.test(x));
      const isbn=String(row[8]||'').replace(/\s|-/g,''),bookId=stableId('book',[isbn||title,row[1]||'',row[5]||''],ids),published=parseDate(row[6]);
      if(row[6]&&!published)warnings.push(`${rowNumber}행 ${title}: 출판일은 원문으로 보존했어요.`);
      const book=normalizeBook({id:bookId,title,authors:splitPeople(row[1]),translator:String(row[2]||''),illustrator:String(row[3]||''),narrator:String(row[4]||''),publisher:String(row[5]||''),publishedDate:published||String(row[6]||''),language:String(row[7]||''),isbn,pageCount:pageCount(row[10],format),genre:mappedGenre(tags),origin:mappedOrigin(tags),tags:visibleTags,collection:String(row[12]||''),series:marker(tags,'시리즈_'),wishlisted:/^(예|yes)$/i.test(String(row[13]||'')),source:'Bookmory Excel',createdAt:stampFor({start:published},0),updatedAt:stampFor({start:published},0)});
      state.books.push(book);const bookReadings=[];
      for(let n=0;n<rounds;n++){
        const offset=BOOK_HEADERS.length+n*4,periodValue=row[offset],ratingValue=row[offset+1],opinion=String(row[offset+2]||''),readTime=String(row[offset+3]||'');
        if(![periodValue,ratingValue,opinion,readTime].some(v=>String(v??'').trim()))continue;
        const period=parsePeriod(periodValue),status=statusFrom(row[14],period),readingId=stableId('read',[bookId,String(n+1)],ids),stamp=stampFor(period,n+1);
        const reading=normalizeReading({id:readingId,bookId,status,startedAt:period.start,finishedAt:status==='finished'?period.end:'',format,rating:parseRating(ratingValue),readTime,createdAt:stamp,updatedAt:stamp});
        state.readings.push(reading);bookReadings.push(reading);
        if(opinion){const noteId=stableId('note',[readingId,'opinion'],ids);state.notes.push(normalizeNote({id:noteId,bookId,readingId,kind:'review',stage:'complete',title:'Bookmory 감상',reflection:opinion,createdAt:stamp,updatedAt:stamp}));}
      }
      if(!bookReadings.length){const readingId=stableId('read',[bookId,'1'],ids),status=statusFrom(row[14],{start:'',end:''});state.readings.push(normalizeReading({id:readingId,bookId,status,format,createdAt:stampFor({},1),updatedAt:stampFor({},1)}));}
    }catch(error){throw new Error(`${rowNumber}행: ${error.message}`);}
  }
  if(!state.books.length)throw new Error('가져올 책이 없어요.');
  state.updatedAt=new Date().toISOString();
  return {state,warnings,summary:summarizeBookmory(state),sheetName:BOOKMORY_SHEET,rounds};
}

export function summarizeBookmory(state){
  const count=(values,labels)=>Object.fromEntries(Object.entries(labels).map(([key,label])=>[label,values.filter(value=>value===key).length]));
  return {books:state.books.length,readings:state.readings.length,statuses:count(state.readings.map(r=>r.status),{finished:'완독',reading:'읽는 중',planned:'읽을 예정',paused:'잠시 멈춤',abandoned:'그만 읽음'}),formats:count(state.readings.map(r=>r.format),FORMATS),ratings:state.readings.filter(r=>r.rating!=null).length,notes:state.notes.filter(noteHasContent).length};
}
const displayBookmoryDate=value=>value?`${+value.slice(0,4)}. ${+value.slice(5,7)}. ${+value.slice(8,10)}.`:'';
const periodText=r=>r.startedAt||r.finishedAt?`${displayBookmoryDate(r.startedAt)} ~ ${r.status==='finished'?displayBookmoryDate(r.finishedAt):''}`:'';
function reviewText(note){
  if(!note)return'';const parts=[];
  for(const [key,label]of [['summary','핵심 내용'],['reflection','내 생각'],['questions','남은 질문'],['actions','해볼 일'],['takeaway','이전 내게 남은 것'],['legacyText','기존 독서록']])if(note[key])parts.push(key==='reflection'&&Object.keys(note).filter(k=>['summary','questions','actions','takeaway','legacyText'].includes(k)&&note[k]).length===0?note[key]:`[${label}]\n${note[key]}`);
  return parts.join('\n\n');
}
function exportTags(book){
  const tags=[...(book.tags||[])];if(book.genre)tags.push(`장르_${book.genre.replaceAll(' ','_')}`);if(book.origin)tags.push(`출처_${ORIGINS[book.origin].replaceAll(' ','_')}`);if(book.series)tags.push(`시리즈_${book.series.replaceAll(' ','_')}`);
  return [...new Set(tags)].map(x=>'#'+x).join(' ');
}
export function bookmoryMatrix(state){
  const maxRounds=Math.max(1,...state.books.map(b=>readingsFor(state,b.id).length)),group=['책 정보',...Array(14).fill('')],headers=[...BOOK_HEADERS];
  for(let n=1;n<=maxRounds;n++){group.push(`${n} 회차 읽은 기록`,'','','');headers.push(...ROUND_HEADERS);}
  const rows=state.books.map(book=>{
    const readings=[...readingsFor(state,book.id)].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)),format=readings.at(-1)?.format||'paper';
    const extent=format==='ebook'?'100.00%':format==='paper'&&book.pageCount!=null?`p. ${book.pageCount}`:'';
    const base=[book.title,book.authors.join(', '),book.translator,book.illustrator,book.narrator,book.publisher,/^\d{4}-\d{2}-\d{2}$/.test(book.publishedDate)?book.publishedDate.replaceAll('-','/'):book.publishedDate,book.language,book.isbn,FORMATS[format],extent,exportTags(book),book.collection,book.wishlisted?'예':'아니오',statusLabel(readings)];
    for(let n=0;n<maxRounds;n++){const reading=readings[n],note=reading&&state.notes.find(x=>x.kind==='review'&&x.readingId===reading.id&&noteHasContent(x));base.push(reading?periodText(reading):'',reading?.rating?reading.rating.toFixed(1):reading?'0.0':'',reviewText(note)||reading?.oneLiner||'',reading?.readTime||'');}
    return base;
  });
  return {group,headers,rows,maxRounds};
}

const crcTable=(()=>{const out=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;out[n]=c>>>0;}return out;})();
const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
const u16=n=>new Uint8Array([n&255,(n>>>8)&255]),u32=n=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);
const join=parts=>{const length=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(length);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
function zipStore(files){
  const locals=[],central=[];let offset=0;
  for(const [name,content]of files){const n=encoder.encode(name),data=encoder.encode(content),crc=crc32(data),local=join([u32(0x04034b50),u16(20),u16(0x800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(n.length),u16(0),n,data]);locals.push(local);central.push(join([u32(0x02014b50),u16(20),u16(20),u16(0x800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(n.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),n]));offset+=local.length;}
  const centralBytes=join(central),end=join([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralBytes.length),u32(offset),u16(0)]);return join([...locals,centralBytes,end]);
}
const cell=(value,ref,style=0)=>`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEncode(value)}</t></is></c>`;
export function bookmoryXlsx(state){
  const matrix=bookmoryMatrix(state),cols=matrix.headers.length,rows=[matrix.group,matrix.headers,...matrix.rows],merges=['A1:O1'];for(let n=0;n<matrix.maxRounds;n++){const start=16+n*4;merges.push(`${columnName(start)}1:${columnName(start+3)}1`);}
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${columnName(cols)}${rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" state="frozen"/></sheetView></sheetViews><cols>${matrix.headers.map((_,i)=>`<col min="${i+1}" max="${i+1}" width="${i===0?28:i===11||i%4===1?22:16}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((row,ri)=>`<row r="${ri+1}">${row.map((value,ci)=>cell(value,`${columnName(ci+1)}${ri+1}`,ri<2?1:0)).join('')}</row>`).join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells></worksheet>`;
  const files=[
    ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${BOOKMORY_SHEET}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml',`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5E3040"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml',sheet]
  ];
  return new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
