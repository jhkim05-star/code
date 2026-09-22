import test from'node:test';
import assert from'node:assert/strict';
import{parseCsv,parseNotionDate,previewNotionExport,readNotionExport}from'../assets/js/notion-export.js';

const encoder=new TextEncoder();
function storedZip(files){
  const locals=[],centrals=[];let offset=0;
  for(const [name,text]of Object.entries(files)){
    const fileName=encoder.encode(name),data=encoder.encode(text),local=new Uint8Array(30+fileName.length+data.length),lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(8,0,true);lv.setUint32(18,0,true);lv.setUint32(22,data.length,true);lv.setUint32(26,data.length,true);lv.setUint16(26,fileName.length,true);lv.setUint16(28,0,true);local.set(fileName,30);local.set(data,30+fileName.length);
    const central=new Uint8Array(46+fileName.length),cv=new DataView(central.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(10,0,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,fileName.length,true);cv.setUint32(42,offset,true);central.set(fileName,46);locals.push(local);centrals.push(central);offset+=local.length;
  }
  const centralSize=centrals.reduce((sum,value)=>sum+value.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,centrals.length,true);ev.setUint16(10,centrals.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
  return new Blob([...locals,...centrals,end]);
}
const csv='\uFEFF지출 내역,결제일,금액,날짜,메모,카드,카테고리\r\n넷플릭스,"June 25, 2025","₩17,000","June 11, 2025","쉼표, 포함",삼성카드,고정비\r\n시장,,₩3000,2025-06-12,,현금,식비\r\n';

test('Notion English and ISO dates are normalized without local timezone conversion',()=>{assert.equal(parseNotionDate('September 13, 2026'),'2026-09-13');assert.equal(parseNotionDate('2026-09-13'),'2026-09-13');assert.equal(parseNotionDate('February 30, 2026'),null);});
test('CSV parser handles BOM, quoted won amounts and embedded commas',()=>{const rows=parseCsv(csv);assert.equal(rows.length,2);assert.equal(rows[0].values['금액'],'₩17,000');assert.equal(rows[0].values['메모'],'쉼표, 포함');});
test('ZIP import prefers the Notion _all.csv database export',async()=>{const zip=storedZip({'월별 지출.csv':'지출 내역,금액,날짜\n일부,1,2025-01-01','월별 지출_all.csv':csv});const parsed=await readNotionExport({name:'notion.zip',arrayBuffer:()=>zip.arrayBuffer()});assert.equal(parsed.csvName,'월별 지출_all.csv');assert.equal(parsed.rows.length,2);});
test('Notion rows preserve use date, billing date, categories and card meaning',()=>{const rows=parseCsv(csv),preview=previewNotionExport(rows,{cards:[{id:'samsung',name:'삼성',issuer:'삼성',aliases:['삼성카드']}],categories:[{id:'food',name:'식비',kind:'expense',fixed:false}],now:()=> '2026-09-13T00:00:00.000Z'});assert.equal(preview.errors.length,0);assert.equal(preview.newTransactions.length,2);assert.equal(preview.newTransactions[0].date,'2025-06-11');assert.equal(preview.newTransactions[0].billingDate,'2025-06-25');assert.equal(preview.newTransactions[0].cardId,'samsung');assert.equal(preview.newTransactions[1].paymentMethod,'cash');assert.equal(preview.newTransactions[1].categoryId,'food');assert.deepEqual(preview.newCategories.map(value=>value.name),['고정비']);assert.equal(preview.newCategories[0].fixed,true);});
test('Notion export preserves zero-won expenses while rejecting an empty amount',()=>{const rows=parseCsv('지출 내역,금액,날짜\n무료 사용,0,2026-09-11\n빈 금액,,2026-09-12'),preview=previewNotionExport(rows);assert.equal(preview.newTransactions.length,1);assert.equal(preview.newTransactions[0].amount,0);assert.equal(preview.errors.length,1);assert.match(preview.errors[0].error,/금액이 비어/);});
test('duplicates and malformed rows are previewed and never silently repaired',()=>{const rows=parseCsv(csv),first=previewNotionExport(rows),broken={rowNumber:9,values:{'지출 내역':'오류','금액':'₩0','날짜':'not-a-date'}};const again=previewNotionExport([...rows,broken],{existing:first.newTransactions});assert.equal(again.newTransactions.length,0);assert.equal(again.duplicates.length,2);assert.equal(again.errors.length,1);assert.match(again.errors[0].error,/날짜 형식/);});
test('CSV with no required columns is reported row by row without producing transactions',()=>{const result=previewNotionExport(parseCsv('이름,값\n테스트,1'));assert.equal(result.newTransactions.length,0);assert.equal(result.errors.length,1);assert.match(result.errors[0].error,/필수 열/);});
