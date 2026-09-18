import{duplicateCandidates,normalizeAmount,normalizeText,parseDate,uid}from'./domain.js?v=1.6.4';

const MAX_ZIP_ENTRIES=5000,MAX_CSV_BYTES=25*1024*1024,MAX_ZIP_BYTES=50*1024*1024;
const MONTHS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
const pad=value=>String(value).padStart(2,'0');
const textDecoder=new TextDecoder('utf-8',{fatal:false});

export function parseNotionDate(value){
  const text=String(value||'').trim(),iso=text.slice(0,10);
  if(parseDate(iso))return iso;
  const match=text.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/),month=MONTHS[match?.[1]?.toLowerCase()];
  if(!match||!month)return null;
  const result=`${match[3]}-${pad(month)}-${pad(match[2])}`;
  return parseDate(result)?result:null;
}

export function parseCsv(text){
  const source=String(text||'').replace(/^\uFEFF/,''),rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<source.length;i++){
    const char=source[i];
    if(quoted){
      if(char==='"'&&source[i+1]==='"'){field+='"';i++;}
      else if(char==='"')quoted=false;
      else field+=char;
    }else if(char==='"'&&!field)quoted=true;
    else if(char===','){row.push(field);field='';}
    else if(char==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
    else field+=char;
  }
  if(quoted)throw new Error('CSV의 따옴표가 닫히지 않았어요.');
  if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
  while(rows.length&&rows.at(-1).every(value=>!value.trim()))rows.pop();
  if(rows.length<2)throw new Error('가져올 거래가 없는 CSV예요.');
  const headers=rows.shift().map(value=>value.trim());
  if(new Set(headers).size!==headers.length)throw new Error('CSV에 같은 이름의 열이 여러 개 있어요.');
  return rows.map((values,index)=>({rowNumber:index+2,values:Object.fromEntries(headers.map((header,i)=>[header,values[i]??'']))}));
}

function findEndOfCentralDirectory(bytes){
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes[i]===0x50&&bytes[i+1]===0x4b&&bytes[i+2]===0x05&&bytes[i+3]===0x06)return i;
  throw new Error('올바른 ZIP 파일이 아니에요.');
}
function zipEntries(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer),eocd=findEndOfCentralDirectory(bytes),count=view.getUint16(eocd+10,true),offset=view.getUint32(eocd+16,true);
  if(view.getUint16(eocd+4,true)||view.getUint16(eocd+6,true)||count===0xffff)throw new Error('분할 또는 ZIP64 내보내기는 지원하지 않아요.');
  if(count>MAX_ZIP_ENTRIES)throw new Error('ZIP 안의 파일이 너무 많아요.');
  const entries=[];let cursor=offset;
  for(let i=0;i<count;i++){
    if(view.getUint32(cursor,true)!==0x02014b50)throw new Error('ZIP 파일 목록이 손상되었어요.');
    const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),compressedSize=view.getUint32(cursor+20,true),size=view.getUint32(cursor+24,true),nameLength=view.getUint16(cursor+28,true),extraLength=view.getUint16(cursor+30,true),commentLength=view.getUint16(cursor+32,true),localOffset=view.getUint32(cursor+42,true);
    const name=textDecoder.decode(bytes.slice(cursor+46,cursor+46+nameLength));
    entries.push({name,flags,method,compressedSize,size,localOffset});cursor+=46+nameLength+extraLength+commentLength;
  }
  return {bytes,view,entries};
}
function chooseCsv(entries){
  const csv=entries.filter(entry=>entry.name.toLowerCase().endsWith('.csv')&&!entry.name.endsWith('/'));
  if(!csv.length)throw new Error('ZIP에서 CSV 파일을 찾지 못했어요.');
  const all=csv.filter(entry=>/_all\.csv$/i.test(entry.name));
  return [...(all.length?all:csv)].sort((a,b)=>b.size-a.size)[0];
}
async function inflateEntry(zip,entry){
  if(entry.flags&1)throw new Error('암호화된 ZIP은 가져올 수 없어요.');
  if(entry.size>MAX_CSV_BYTES)throw new Error('CSV가 너무 커서 가져오기를 중단했어요.');
  const {view,bytes}=zip,offset=entry.localOffset;
  if(view.getUint32(offset,true)!==0x04034b50)throw new Error('ZIP 안의 CSV 위치가 올바르지 않아요.');
  const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true),compressed=bytes.slice(start,start+entry.compressedSize);
  let output;
  if(entry.method===0)output=compressed;
  else if(entry.method===8){
    if(typeof DecompressionStream==='undefined')throw new Error('이 브라우저는 ZIP 압축 해제를 지원하지 않아요. CSV 파일을 직접 선택해 주세요.');
    try{output=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}
    catch{throw new Error('ZIP 안의 CSV 압축을 풀지 못했어요.');}
  }else throw new Error('지원하지 않는 ZIP 압축 방식이에요.');
  if(entry.size&&output.length!==entry.size)throw new Error('ZIP 안의 CSV 크기가 일치하지 않아요.');
  return output;
}

export async function readNotionExport(file){
  if(!file)throw new Error('Notion 내보내기 파일을 선택해 주세요.');
  const name=String(file.name||'').toLowerCase(),buffer=await file.arrayBuffer();
  if(buffer.byteLength>MAX_CSV_BYTES&&name.endsWith('.csv'))throw new Error('CSV가 너무 커서 가져오기를 중단했어요.');
  if(buffer.byteLength>MAX_ZIP_BYTES&&name.endsWith('.zip'))throw new Error('ZIP이 너무 커서 가져오기를 중단했어요.');
  let csvName=file.name||'Notion.csv',bytes;
  if(name.endsWith('.csv'))bytes=new Uint8Array(buffer);
  else if(name.endsWith('.zip')){const zip=zipEntries(buffer),entry=chooseCsv(zip.entries);csvName=entry.name;bytes=await inflateEntry(zip,entry);}
  else throw new Error('Notion에서 내보낸 ZIP 또는 CSV 파일만 선택해 주세요.');
  return {fileName:file.name||csvName,csvName,rows:parseCsv(textDecoder.decode(bytes))};
}

function hash(text){let value=2166136261;for(const char of text){value^=char.codePointAt(0);value=Math.imul(value,16777619);}return(value>>>0).toString(36);}
function categoryId(name){return `notion_${hash(normalizeText(name)||'other')}`;}
function cardMatches(card,alias){return[card.id,card.name,card.issuer,...(card.aliases||[])].some(value=>normalizeText(value)===normalizeText(alias));}
function paymentMethod(alias){const value=normalizeText(alias);if(!value||value==='현금'||value==='cash')return'cash';if(value==='계좌'||value==='계좌이체'||value==='account')return'account';return'card';}

export function previewNotionExport(rows,{existing=[],cards=[],categories=[],fileName='',csvName='',now=()=>new Date().toISOString()}={}){
  const required=['지출 내역','금액','날짜'],fresh=[],duplicates=[],errors=[],seen=[...existing],createdCategories=[],categoryByName=new Map(categories.map(category=>[normalizeText(category.name),category])),occurrences=new Map();
  for(const row of rows){
    try{
      const missing=required.filter(name=>!(name in row.values));if(missing.length)throw new Error(`필수 열이 없어요: ${missing.join(', ')}`);
      const merchant=String(row.values['지출 내역']||'').trim(),date=parseNotionDate(row.values['날짜']),billingRaw=String(row.values['결제일']||'').trim(),billingDate=billingRaw?parseNotionDate(billingRaw):null,amount=normalizeAmount(row.values['금액']),categoryName=String(row.values['카테고리']||'기타').trim()||'기타',cardAlias=String(row.values['카드']||'').trim();
      if(!merchant)throw new Error('지출 내역이 비어 있어요.');if(!date)throw new Error('날짜 형식이 올바르지 않아요.');if(billingRaw&&!billingDate)throw new Error('결제일 형식이 올바르지 않아요.');if(!amount)throw new Error('금액이 비어 있거나 0원이에요.');
      let category=categoryByName.get(normalizeText(categoryName));
      if(!category){category={id:categoryId(categoryName),name:categoryName,kind:'expense',fixed:categoryName==='고정비'};categoryByName.set(normalizeText(categoryName),category);createdCategories.push(category);}
      const signature=[date,billingDate||'',amount,merchant,categoryName,cardAlias,String(row.values['메모']||'')].join('|'),ordinal=(occurrences.get(signature)||0)+1;occurrences.set(signature,ordinal);
      const method=paymentMethod(cardAlias),matches=method==='card'?cards.filter(card=>cardMatches(card,cardAlias)):[],timestamp=now();
      const tx={id:uid('tx'),date,time:'12:00',type:'expense',amount,merchant,categoryId:category.id,paymentMethod:method,cardId:matches.length===1?matches[0].id:null,cardAlias,billingDate,source:'notion',sourceId:`notion-export:${hash(signature)}:${ordinal}`,memo:String(row.values['메모']||'').trim(),installment:null,cancelled:false,linkedOriginal:null,createdAt:timestamp,updatedAt:timestamp};
      const candidates=duplicateCandidates(tx,seen);if(candidates.length)duplicates.push({transaction:tx,candidates});else{fresh.push(tx);seen.push(tx);}
    }catch(error){errors.push({rowNumber:row.rowNumber,error:`${row.rowNumber}행: ${error.message}`});}
  }
  const usedCategoryIds=new Set(fresh.map(tx=>tx.categoryId));
  return {newTransactions:fresh,duplicates,errors,newCategories:createdCategories.filter(category=>usedCategoryIds.has(category.id)),unmatchedCardAliases:[...new Set(fresh.filter(tx=>tx.paymentMethod==='card'&&!tx.cardId).map(tx=>tx.cardAlias))].sort(),fileName,csvName,rowCount:rows.length};
}
