import{changedCard,changedCashHistory,checkMonth,validateCycleExtras}from'./cycles.js?v=1.7.0';
import{defaultState,duplicateCandidates,recurringTransactionsDue,uid,validateState,validateTransaction,zonedDate}from'./domain.js?v=1.6.6';
export class BudgetRepository{
  constructor(storage){this.storage=storage;this.state=null;this.warnings=[];}
  async init(){const loaded=await this.storage.load();if(loaded===null){const initial=defaultState();await this.storage.save(initial,0);this.state=initial;return this.state;}try{this.state=validateCycleExtras(validateState(structuredClone(loaded)));}catch(error){this.warnings.push(`저장된 데이터를 읽지 못했습니다. 자동 초기화하지 않았어요: ${error.message}`);throw error;}await this.materializeRecurringExpenses(zonedDate(new Date(),this.state.settings.timeZone));return this.state;}
  async commit(mutator,{backup=false}={}){const before=this.state,expected=before.revision,next=structuredClone(before);await mutator(next);next.revision=expected+1;next.meta.updatedAt=new Date().toISOString();validateCycleExtras(validateState(next));await this.storage.save(next,expected,{backup});this.state=next;return next;}
  async addTransaction(input){if(input.type==='income')throw new Error('지원하지 않는 거래 유형이에요.');const tx=validateTransaction({...input,id:input.id||uid('tx'),createdAt:input.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});const duplicates=duplicateCandidates(tx,this.state.transactions);if(duplicates.length){const error=new Error('같은 거래로 보이는 내역이 이미 있어요.');error.candidates=duplicates;throw error;}await this.commit(s=>{s.transactions.unshift(tx);});return tx;}
  async updateTransaction(id,patch){let result;await this.commit(s=>{const i=s.transactions.findIndex(tx=>tx.id===id);if(i<0)throw new Error('거래를 찾지 못했어요.');result=validateTransaction({...s.transactions[i],...patch,id,updatedAt:new Date().toISOString()});s.transactions[i]=result;});return result;}
  async removeTransaction(id){await this.commit(s=>{const i=s.transactions.findIndex(tx=>tx.id===id);if(i<0)throw new Error('거래를 찾지 못했어요.');s.transactions.splice(i,1);});}
  async upsertCard(card){await this.commit(s=>{
    const i=s.cards.findIndex(c=>c.id===card.id),previous=i<0?null:s.cards[i];
    const value={id:card.id||uid('card'),issuer:String(card.issuer||'').trim(),name:String(card.name||'').trim(),billingDay:Number(card.billingDay),cycleRule:structuredClone(card.cycleRule),aliases:[...new Set((card.aliases||[]).map(String).map(v=>v.trim()).filter(Boolean))],active:card.active??previous?.active??true};
    if(!value.name)throw new Error('카드 이름을 확인해 주세요.');
    const month=zonedDate(new Date(),s.settings.timeZone).slice(0,7);
    const next=changedCard(previous,value,card.effectiveMonth||month,month);
    if(i<0)s.cards.push(next);else s.cards[i]=next;
  });}
  async setCashCycle(rule,fromMonth,expectedHistory){await this.commit(s=>{
    if(expectedHistory!==undefined&&JSON.stringify(s.settings.cashCycleHistory||[])!==expectedHistory)throw new Error('다른 작업에서 사용기간이 바뀌었어요. 다시 열어 주세요.');
    s.settings.cashCycleHistory=changedCashHistory(s.settings,rule,fromMonth);
  });}
  async setCycleNote(month,text,expectedText){
    checkMonth(month);if(typeof text!=='string'||text.length>10000)throw new Error('특이사항은 10,000자 이내로 적어 주세요.');
    await this.commit(s=>{
      const notes=s.meta.cycleNotes||{},old=notes[month]?.text||'';
      if(expectedText!==undefined&&old!==expectedText)throw new Error('특이사항이 다른 작업에서 변경됐어요. 입력 내용을 복사한 뒤 다시 열어 주세요.');
      s.meta.cycleNotes={...notes,[month]:{text,updatedAt:new Date().toISOString()}};
    });
  }
  async restoreFullBackup(input){
    if(input?.schemaVersion!==1)throw new Error('지원하지 않는 가계부 백업 버전이에요.');
    const copy=validateCycleExtras(validateState(structuredClone(input)));
    // A backup's revision is never adopted as the live storage revision.
    await this.commit(s=>{for(const key of ['schemaVersion','transactions','cards','categories','budgets','imports','recurringExpenses','settings','meta'])s[key]=structuredClone(copy[key]);},{backup:true});
  }
  async setBudget(month,amount,categoryId=''){await this.commit(s=>{const i=s.budgets.findIndex(b=>b.month===month&&(b.categoryId||'')===categoryId);const row={id:i<0?uid('budget'):s.budgets[i].id,month,categoryId,amount:Math.max(0,Math.round(Number(amount)||0))};if(i<0)s.budgets.push(row);else s.budgets[i]=row;});}
  async upsertRecurringExpense(input,referenceDate=zonedDate(new Date(),this.state.settings.timeZone)){let result;await this.commit(s=>{const i=s.recurringExpenses.findIndex(rule=>rule.id===input.id),previous=i<0?null:s.recurringExpenses[i],paymentMethod=String(input.paymentMethod??previous?.paymentMethod??'cash'),cardId=paymentMethod==='card'?String(input.cardId??previous?.cardId??''):null;result={id:previous?.id||uid('fixed'),name:String(input.name||'').trim(),amount:Math.round(Number(input.amount)||0),categoryId:String(input.categoryId||'other'),day:Number(input.day),startMonth:String(previous?.startMonth||input.startMonth||referenceDate.slice(0,7)),memo:String(input.memo||'').trim(),paymentMethod,cardId,active:input.active!==false,generatedMonths:[...(previous?.generatedMonths||[])]};if(!result.name||result.amount<=0||!Number.isInteger(result.day)||result.day<1||result.day>31||!s.categories.some(category=>category.id===result.categoryId))throw new Error('고정지출 이름, 금액, 날짜와 카테고리를 확인해 주세요.');if(!['cash','account','card'].includes(paymentMethod)||paymentMethod==='card'&&!s.cards.some(card=>card.id===cardId))throw new Error('고정지출 결제수단과 카드를 확인해 주세요.');if(i<0)s.recurringExpenses.push(result);else s.recurringExpenses[i]=result;this.applyRecurringTransactions(s,referenceDate);});return result;}
  async removeRecurringExpense(id){await this.commit(s=>{const i=s.recurringExpenses.findIndex(rule=>rule.id===id);if(i<0)throw new Error('고정지출을 찾지 못했어요.');s.recurringExpenses.splice(i,1);});}
  applyRecurringTransactions(s,referenceDate){const due=recurringTransactionsDue(s,referenceDate);for(const tx of due){if(!s.transactions.some(existing=>existing.sourceId===tx.sourceId))s.transactions.unshift(tx);const rule=s.recurringExpenses.find(value=>value.id===tx.recurringExpenseId);if(rule&&!rule.generatedMonths.includes(tx.recurringMonth))rule.generatedMonths.push(tx.recurringMonth);}return due;}
  async materializeRecurringExpenses(referenceDate=zonedDate(new Date(),this.state.settings.timeZone)){const due=recurringTransactionsDue(this.state,referenceDate);if(!due.length)return[];let created=[];await this.commit(s=>{created=this.applyRecurringTransactions(s,referenceDate);});return created;}
  async setting(patch){await this.commit(s=>{s.settings={...s.settings,...patch,notion:patch.notion?{...s.settings.notion,...patch.notion}:s.settings.notion};});}
  async applyImport({transactions,categories=[],importRecord,settingsPatch,metaPatch}){if(transactions.some(tx=>tx.type==='income'))throw new Error('지원하지 않는 거래 유형이 포함되어 있어요.');await this.commit(s=>{const ids=new Set(s.categories.map(category=>category.id));for(const category of categories)if(!ids.has(category.id)){s.categories.push(structuredClone(category));ids.add(category.id);}s.transactions=[...transactions,...s.transactions];if(importRecord)s.imports.unshift(importRecord);if(settingsPatch)s.settings={...s.settings,...settingsPatch};if(metaPatch)s.meta={...s.meta,...metaPatch};},{backup:true});}
  async resetAll(){const expected=this.state.revision,next=defaultState();next.revision=expected+1;await this.storage.reset(next,expected);this.state=next;return next;}
}
