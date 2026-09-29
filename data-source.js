/* Card Ledger PWA — read-only published data source.
 * No authentication or repository-write/connection-management code exists here.
 * The PWA reads the published JSON files served with it. Chat is the only writer.
 * Chat is the only writer.
 */
const LEDGER_DATA_VERSION=4;
const LEDGER_DATA_FILE='./card-ledger-data.json';

async function readLedgerData(){
  const res=await fetch(LEDGER_DATA_FILE+'?ts='+Date.now(),{cache:'no-store',headers:{'Accept':'application/json'}});
  if(!res.ok){
    const detail='Published ledger data could not be loaded ('+res.status+').';
    window.__dataLoadFailed=true; window.__dataLoadError=detail;
    throw new Error(detail);
  }
  const raw=await res.json();
  window.__dataLoadFailed=false; window.__dataLoadError='';
  return normaliseLedgerData(raw);
}
function cloneData(v,f){try{return JSON.parse(JSON.stringify(v));}catch(e){return f;}}
function flattenDataCardEntries(list){
  const out=[];
  (Array.isArray(list)?list:[]).forEach(c=>(Array.isArray(c&&c.entries)?c.entries:[]).forEach(e=>{
    if(e&&e.id)out.push({...cloneData(e,e),cardId:c.id,card:c.name});
  }));
  return out;
}
function normaliseLedgerData(data){
  const d=data&&typeof data==='object'?data:{};
  const cards=Array.isArray(d.cards)?d.cards:[];
  const entries=Array.isArray(d.entries)?d.entries:[];
  return {
    version:LEDGER_DATA_VERSION,app:'Card Ledger PWA',updatedAt:d.updatedAt||'',
    cards:cloneData(cards,[]),entries:entries.length?cloneData(entries,[]):flattenDataCardEntries(cards),
    cashback:cloneData(Array.isArray(d.cashback)?d.cashback:(Array.isArray(d.cashbackLog)?d.cashbackLog:[]),[]),
    dueBills:cloneData(Array.isArray(d.dueBills)?d.dueBills:[],[]),
    recurringPayments:cloneData(Array.isArray(d.recurringPayments)?d.recurringPayments:[],[]),
    deletedEntryIds:[...new Set((Array.isArray(d.deletedEntryIds)?d.deletedEntryIds:[]).map(String))],
    removedCardNames:[...new Set((Array.isArray(d.removedCardNames)?d.removedCardNames:[]).map(String))]
  };
}
function attachDataEntriesToCards(localCards,flatEntries){
  const result=cloneData(localCards,[]), list=Array.isArray(flatEntries)?flatEntries:[];
  result.forEach(c=>{
    if(!Array.isArray(c.entries))c.entries=[];
    const ids=new Set(c.entries.filter(Boolean).map(e=>String(e.id)));
    list.filter(e=>e&&((e.cardId&&c.id&&String(e.cardId)===String(c.id))||(e.card&&c.name&&String(e.card).trim()===String(c.name).trim()))).forEach(e=>{
      if(e.id&&!ids.has(String(e.id))){c.entries.push(cloneData(e,e));ids.add(String(e.id));}
    });
  });
  return result;
}
async function applyLedgerDataState(data){
  const d=normaliseLedgerData(data);
  if(typeof cards!=='undefined'&&Array.isArray(d.cards)&&d.cards.length){
    cards=attachDataEntriesToCards(d.cards,d.entries);
    d.cards=cloneData(cards,[]); d.entries=flattenDataCardEntries(cards);
  }
  if(typeof dueBills!=='undefined'&&Array.isArray(d.dueBills))dueBills=cloneData(d.dueBills,[]);
  if(typeof cashbackLog!=='undefined'&&Array.isArray(d.cashback))cashbackLog=cloneData(d.cashback,[]);
  if(typeof recurringPayments!=='undefined'&&Array.isArray(d.recurringPayments))recurringPayments=cloneData(d.recurringPayments,[]);
  if(typeof deletedEntryIds!=='undefined')deletedEntryIds=new Set(d.deletedEntryIds.map(String));
  if(typeof removedCardNames!=='undefined')removedCardNames=new Set(d.removedCardNames);
  if(typeof chatUpdates!=='undefined')chatUpdates=d;
  window.chatUpdatesForSecurity=d.entries; window.__dataFeedSource='data-file';
  window.__ledgerDataLoaded=Array.isArray(d.cards)&&d.cards.length>0; return d;
}
function getLedgerDataStatus(){
  return {readOnly:true,sourceFile:LEDGER_DATA_FILE,loaded:!!window.__ledgerDataLoaded,entries:(window.chatUpdatesForSecurity||[]).length};
}
window.__dataLoadFailed=false; window.__dataLoadError=''; window.__dataUsingFallback=false;
