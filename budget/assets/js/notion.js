import{duplicateCandidates,normalizeAmount,normalizeText,uid}from'./domain.js?v=1.6.1';
const rich=value=>Array.isArray(value)?value.map(v=>v.plain_text||v.text?.content||'').join(''):'';
export function notionValue(property){
  if(!property)return null;const type=property.type,value=property[type];
  if(type==='title'||type==='rich_text')return rich(value);
  if(type==='number'||type==='checkbox')return value;
  if(type==='select'||type==='status')return value?.name||'';
  if(type==='multi_select')return (value||[]).map(v=>v.name).join(', ');
  if(type==='date')return value?.start||'';
  if(type==='formula')return value?.[value.type]??null;
  return null;
}
export function mapNotionPage(page,mapping){
  const get=key=>notionValue(page.properties?.[mapping[key]]),rawType=String(get('type')||'지출').toLowerCase();
  if(/(수입|income)/.test(rawType))throw new Error('지원하지 않는 거래 유형이에요.');
  const type=/(이체|transfer)/.test(rawType)?'transfer':'expense',dateTime=String(get('date')||'').split('T');
  const amount=normalizeAmount(get('amount')),date=dateTime[0],time=(dateTime[1]||'12:00').slice(0,5);
  if(!date||!amount)throw new Error('날짜 또는 금액이 비어 있어요.');
  return {id:uid('tx'),date,time,type,amount,merchant:String(get('merchant')||'가맹점 미입력'),categoryId:String(get('category')||'other'),paymentMethod:get('card')?'card':'other',cardId:null,cardAlias:String(get('card')||''),source:'notion',sourceId:`notion:${page.id}`,memo:String(get('memo')||''),installment:null,cancelled:false,linkedOriginal:null,createdAt:new Date().toISOString(),updatedAt:page.last_edited_time||new Date().toISOString()};
}
export async function queryAllNotion({proxyUrl,dataSourceId,clientToken,lastSync,fetcher=fetch}){
  if(!/^https:\/\//.test(proxyUrl))throw new Error('HTTPS Notion 프록시 주소를 입력해 주세요.');if(!dataSourceId)throw new Error('data source ID를 입력해 주세요.');
  const pages=[];let cursor=null,guard=0;
  do{const body={dataSourceId,startCursor:cursor,pageSize:100,lastSync:lastSync||null};const response=await fetcher(`${proxyUrl.replace(/\/$/,'')}/notion/query`,{method:'POST',headers:{'Content-Type':'application/json','X-Client-Token':clientToken||''},body:JSON.stringify(body)});if(!response.ok)throw new Error(`Notion 조회 실패 (${response.status})`);const data=await response.json();if(!Array.isArray(data.results))throw new Error('Notion 응답 형식이 올바르지 않아요.');pages.push(...data.results);cursor=data.has_more?data.next_cursor:null;if(++guard>100)throw new Error('Notion 페이지가 너무 많아 중단했어요.');}while(cursor);
  return pages;
}
export function previewNotion(pages,{mapping,existing=[],cards=[],categories=[]}={}){
  const fresh=[],duplicates=[],errors=[],seen=[...existing];
  for(const page of pages){try{const tx=mapNotionPage(page,mapping),category=categories.find(c=>normalizeText(c.id)===normalizeText(tx.categoryId)||normalizeText(c.name)===normalizeText(tx.categoryId));tx.categoryId=category?.id||'other';const cardMatches=cards.filter(c=>[c.id,c.name,c.issuer,...(c.aliases||[])].some(alias=>normalizeText(alias)===normalizeText(tx.cardAlias)));if(cardMatches.length===1)tx.cardId=cardMatches[0].id;const candidates=duplicateCandidates(tx,seen);if(candidates.length)duplicates.push({transaction:tx,candidates});else{fresh.push(tx);seen.push(tx);}}catch(error){errors.push({pageId:page.id,error:error.message});}}
  return {newTransactions:fresh,duplicates,errors};
}
