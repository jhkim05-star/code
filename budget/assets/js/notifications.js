import{duplicateCandidates,normalizeAmount,normalizeText,uid}from'./domain.js?v=1.6.1';

const ISSUERS=[
  {id:'shinhan',name:'신한',tokens:['신한카드','신한']},{id:'kb',name:'KB국민',tokens:['KB국민카드','국민카드','KB카드']},
  {id:'hyundai',name:'현대',tokens:['현대카드']},{id:'samsung',name:'삼성',tokens:['삼성카드']},
  {id:'lotte',name:'롯데',tokens:['롯데카드']},{id:'hana',name:'하나',tokens:['하나카드']},
  {id:'woori',name:'우리',tokens:['우리카드']},{id:'bc',name:'BC',tokens:['비씨카드','BC카드','페이북']}
];
export const parserRegistry=ISSUERS.map(issuer=>({issuer:issuer.id,label:issuer.name,canParse:text=>issuer.tokens.some(token=>text.includes(token)),parse:(text,context)=>parseKoreanCardMessage(text,{...context,issuer})}));

const hash=value=>{let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);};
function parseDateTime(text,nowDate){
  const full=text.match(/(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})\s*(\d{1,2}):(\d{2})/),short=text.match(/(?:^|\s)(\d{1,2})[.\/-](\d{1,2})\s*(\d{1,2}):(\d{2})/);
  if(full)return {date:`${full[1]}-${String(+full[2]).padStart(2,'0')}-${String(+full[3]).padStart(2,'0')}`,time:`${String(+full[4]).padStart(2,'0')}:${full[5]}`};
  if(short)return {date:`${String(nowDate).slice(0,4)}-${String(+short[1]).padStart(2,'0')}-${String(+short[2]).padStart(2,'0')}`,time:`${String(+short[3]).padStart(2,'0')}:${short[4]}`};
  return null;
}
function cardMatch(text,cards,issuer){
  const normalized=normalizeText(text),last4=text.match(/(?:카드|체크|승인)[^\d]{0,8}(\d{4})(?!\d)/)?.[1];
  const matches=cards.filter(card=>card.active!==false&&[card.name,card.issuer,...(card.aliases||[])].some(alias=>alias&&normalized.includes(normalizeText(alias)))&&(card.issuer?normalizeText(card.issuer).includes(normalizeText(issuer.name))||normalizeText(issuer.name).includes(normalizeText(card.issuer)):true));
  return {cardId:matches.length===1?matches[0].id:null,cardCandidates:matches.map(c=>c.id),last4:last4||null};
}
export function parseKoreanCardMessage(raw,{issuer,cards=[],nowDate=new Date().toISOString().slice(0,10)}={}){
  const text=String(raw||'').replace(/\s+/g,' ').trim(),dateTime=parseDateTime(text,nowDate),amountMatch=text.match(/(?:KRW\s*)?([\d,]+)\s*원/);
  if(!dateTime||!amountMatch)return {ok:false,error:'날짜·시간 또는 금액을 찾지 못했어요.',raw};
  const cancelled=/(승인취소|결제취소|취소|매입취소)/.test(text),amount=normalizeAmount(amountMatch[1]);
  const after=text.slice((amountMatch.index||0)+amountMatch[0].length).replace(/(?:누적|잔액|일시불|할부|해외승인).*$/,'').trim();
  const beforeDate=text.slice(0,text.indexOf(dateTime.date.slice(5,7).replace(/^0/,'')+'/')>-1?text.indexOf(dateTime.date.slice(5,7).replace(/^0/,'')+'/'):text.length);
  const merchant=(after||beforeDate.replace(/^.*?(승인취소|결제취소|취소|승인)/,'')).replace(/^[*\-: ]+|[*\-: ]+$/g,'').slice(0,80)||'가맹점 미확인';
  const link=cardMatch(text,cards,issuer);
  return {ok:true,transaction:{id:uid('tx'),date:dateTime.date,time:dateTime.time,type:'expense',amount,merchant,categoryId:'other',paymentMethod:'card',cardId:link.cardId,source:'kakao',sourceId:`notification:${hash(`${issuer.id}|${text}`)}`,memo:'',installment:null,cancelled,linkedOriginal:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},issuer:issuer.id,...link};
}
export function parseFinancialNotifications(entries,{cards=[],existing=[],nowDate}={}){
  const parsed=[],errors=[];
  for(const entry of entries){const text=typeof entry==='string'?entry:entry.text;const parser=parserRegistry.find(p=>p.canParse(text));if(!parser){errors.push({text,error:'지원하는 카드사를 찾지 못했어요.'});continue;}const result=parser.parse(text,{cards,nowDate});if(!result.ok){errors.push({text,error:result.error});continue;}if(typeof entry!=='string'&&['paste','import','kakao'].includes(entry.source))result.transaction.source=entry.source;parsed.push(result.transaction);}
  const all=[...existing],fresh=[],duplicates=[];
  for(const tx of parsed){const candidates=duplicateCandidates(tx,all);if(candidates.length){duplicates.push({transaction:tx,candidates});continue;}if(tx.cancelled){const original=all.find(item=>!item.cancelled&&item.type==='expense'&&item.amount===tx.amount&&normalizeText(item.merchant)===normalizeText(tx.merchant)&&(!tx.cardId||item.cardId===tx.cardId));if(original)tx.linkedOriginal=original.id;}fresh.push(tx);all.push(tx);}
  return {newTransactions:fresh,duplicates,errors};
}
