/* Card Ledger PWA — UNIFIED LOCAL DATA FILE CORE
 * One user-selected JSON file is the primary private data source.
 * It stores cards, transactions, repayments, fees, dues/statements,
 * cashback/charges and recurring payments together.
 *
 * GitHub remains the app/code distribution channel. Private user data
 * is never uploaded to GitHub by this module.
 */
const LOCAL_DATA_DB='card-ledger-local-file-v1';
const LOCAL_DATA_STORE='handles';
const LOCAL_DATA_ID='primary';
const LOCAL_DATA_VERSION=4;
let localDataDbPromise;
let chatUpdates={version:LOCAL_DATA_VERSION,entries:[],cashback:[]};

function openLocalDataDB(){
  if(localDataDbPromise) return localDataDbPromise;
  localDataDbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(LOCAL_DATA_DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(LOCAL_DATA_STORE))req.result.createObjectStore(LOCAL_DATA_STORE);};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return localDataDbPromise;
}
async function saveLocalDataHandle(handle){
  const db=await openLocalDataDB();
  return await new Promise((resolve,reject)=>{
    const r=db.transaction(LOCAL_DATA_STORE,'readwrite').objectStore(LOCAL_DATA_STORE).put(handle,LOCAL_DATA_ID);
    r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error);
  });
}
async function loadLocalDataHandle(){
  const db=await openLocalDataDB();
  return await new Promise((resolve,reject)=>{
    const r=db.transaction(LOCAL_DATA_STORE,'readonly').objectStore(LOCAL_DATA_STORE).get(LOCAL_DATA_ID);
    r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);
  });
}
async function clearLocalDataHandle(){
  const db=await openLocalDataDB();
  return await new Promise((resolve,reject)=>{
    const r=db.transaction(LOCAL_DATA_STORE,'readwrite').objectStore(LOCAL_DATA_STORE).delete(LOCAL_DATA_ID);
    r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error);
  });
}
async function localFilePermission(handle,request=false){
  if(!handle)return false;
  if(typeof handle.queryPermission!=='function')return true;
  try{
    let s=await handle.queryPermission({mode:'readwrite'});
    if(s==='granted')return true;
    if(request&&typeof handle.requestPermission==='function'){
      s=await handle.requestPermission({mode:'readwrite'});
      return s==='granted';
    }
  }catch(e){}
  return false;
}
function cloneJson(v,fallback){
  try{return JSON.parse(JSON.stringify(v));}catch(e){return fallback;}
}
function flattenCardEntries(cards){
  const out=[];
  (Array.isArray(cards)?cards:[]).forEach(c=>{
    (Array.isArray(c&&c.entries)?c.entries:[]).forEach(e=>{
      if(!e||!e.id)return;
      out.push({...cloneJson(e,e),cardId:c.id,card:c.name});
    });
  });
  return out;
}
function normaliseLocalData(data){
  const d=data&&typeof data==='object'?data:{};
  const cards=Array.isArray(d.cards)?d.cards:[];
  const entries=Array.isArray(d.entries)?d.entries:[];
  const cashback=Array.isArray(d.cashback)?d.cashback:(Array.isArray(d.cashbackLog)?d.cashbackLog:[]);
  const dueBills=Array.isArray(d.dueBills)?d.dueBills:[];
  const recurringPayments=Array.isArray(d.recurringPayments)?d.recurringPayments:[];
  const deletedEntryIds=Array.isArray(d.deletedEntryIds)?d.deletedEntryIds:[];
  const removedCardNames=Array.isArray(d.removedCardNames)?d.removedCardNames:[];
  return {
    version:LOCAL_DATA_VERSION,
    app:'Card Ledger PWA',
    updatedAt:d.updatedAt||new Date().toISOString(),
    cards:cloneJson(cards,[]),
    // Compatibility mirror. cards[].entries is the canonical transaction store.
    entries:entries.length?cloneJson(entries,[]):flattenCardEntries(cards),
    cashback:cloneJson(cashback,[]),
    dueBills:cloneJson(dueBills,[]),
    recurringPayments:cloneJson(recurringPayments,[]),
    deletedEntryIds:[...new Set(deletedEntryIds.map(String))],
    removedCardNames:[...new Set(removedCardNames.map(String))]
  };
}
async function readLocalDataFile(){
  const handle=await loadLocalDataHandle();
  if(!handle) throw new Error('No Card Ledger data file selected. Choose a local JSON file first.');
  if(!(await localFilePermission(handle,true))) throw new Error('Permission to access the selected Card Ledger file was not granted.');
  const file=await handle.getFile();
  const text=await file.text();
  if(!text.trim())return normaliseLocalData(null);
  try{return normaliseLocalData(JSON.parse(text));}
  catch(e){throw new Error('The selected Card Ledger data file is not valid JSON.');}
}
async function writeLocalDataFile(data){
  const handle=await loadLocalDataHandle();
  if(!handle) throw new Error('No Card Ledger data file selected.');
  if(!(await localFilePermission(handle,true))) throw new Error('Permission to write the selected Card Ledger file was not granted.');
  const normal=normaliseLocalData(data);
  normal.updatedAt=new Date().toISOString();
  const writable=await handle.createWritable();
  await writable.write(JSON.stringify(normal,null,2)+'\n');
  await writable.close();
  chatUpdates=normal;
  return normal;
}
function buildUnifiedLocalData(){
  return normaliseLocalData({
    version:LOCAL_DATA_VERSION,
    cards:typeof cards!=='undefined'&&Array.isArray(cards)?cards:[],
    dueBills:typeof dueBills!=='undefined'&&Array.isArray(dueBills)?dueBills:[],
    cashback:typeof cashbackLog!=='undefined'&&Array.isArray(cashbackLog)?cashbackLog:[],
    recurringPayments:typeof recurringPayments!=='undefined'&&Array.isArray(recurringPayments)?recurringPayments:[],
    deletedEntryIds:typeof deletedEntryIds!=='undefined'?[...deletedEntryIds]:[],
    removedCardNames:typeof removedCardNames!=='undefined'?[...removedCardNames]:[]
  });
}
async function hasLocalDataFile(){
  try{return !!(await loadLocalDataHandle());}catch(e){return false;}
}
async function saveUnifiedLocalData(){
  if(!(await hasLocalDataFile())) return false;
  await writeLocalDataFile(buildUnifiedLocalData());
  return true;
}
async function applyLocalDataState(data){
  const d=normaliseLocalData(data);
  // Existing v3 files may contain only flat entries/cashback. Keep those feeds
  // available for the normal merge path; cards remain canonical once present.
  if(typeof cards!=='undefined' && Array.isArray(d.cards) && d.cards.length) cards=cloneJson(d.cards,[]);
  if(typeof dueBills!=='undefined' && Array.isArray(d.dueBills)) dueBills=cloneJson(d.dueBills,[]);
  if(typeof cashbackLog!=='undefined' && Array.isArray(d.cashback)) cashbackLog=cloneJson(d.cashback,[]);
  if(typeof recurringPayments!=='undefined' && Array.isArray(d.recurringPayments)) recurringPayments=cloneJson(d.recurringPayments,[]);
  if(typeof deletedEntryIds!=='undefined') deletedEntryIds=new Set(d.deletedEntryIds.map(String));
  if(typeof removedCardNames!=='undefined') removedCardNames=new Set(d.removedCardNames);
  chatUpdates=d;
  window.chatUpdatesForSecurity=d.entries;
  window.__chatFeedSource='local-file';
  window.__localUnifiedDataLoaded=Array.isArray(d.cards)&&d.cards.length>0;
  return d;
}
async function loadLocalDataState(){
  try{
    const d=await readLocalDataFile();
    await applyLocalDataState(d);
    return d;
  }catch(e){
    window.__localUnifiedDataLoaded=false;
    return null;
  }
}
async function selectLocalDataFile(){
  if(!window.showOpenFilePicker) throw new Error('This browser does not support direct local-file access. Open the PWA in Chrome/Edge on a supported device.');
  const picked=await window.showOpenFilePicker({
    multiple:false,
    types:[{description:'Card Ledger data',accept:{'application/json':['.json']}}],
    excludeAcceptAllOption:false
  });
  const handle=picked&&picked[0];
  if(!handle)throw new Error('No data file selected.');
  if(!(await localFilePermission(handle,true)))throw new Error('Permission to access the selected data file was not granted.');
  const file=await handle.getFile();
  const text=await file.text();
  let data;
  if(!text.trim()) data=normaliseLocalData(null);
  else{try{data=normaliseLocalData(JSON.parse(text));}catch(e){throw new Error('The selected file is not valid Card Ledger JSON.');}}
  await saveLocalDataHandle(handle);
  // Import the file into the live app immediately. If it is an old v3
  // transaction-only file, the existing card master remains available and
  // its flat entries are merged by the normal Ledger migration path.
  await applyLocalDataState(data);
  if(!data.cards.length && typeof cards!=='undefined' && Array.isArray(cards) && cards.length){
    data=buildUnifiedLocalData();
  }else{
    data=normaliseLocalData(data);
  }
  await writeLocalDataFile(data);
  if(typeof window.applyLocalDataState==='function') await window.applyLocalDataState(data);
  await refreshLocalDataStatus('✓ Unified local data file selected · '+handle.name);
  showToast('Unified Card Ledger data file selected');
  return data;
}
async function createLocalDataFile(){
  if(!window.showSaveFilePicker)throw new Error('This browser does not support direct local-file access. Open the PWA in Chrome/Edge on a supported device.');
  const handle=await window.showSaveFilePicker({
    suggestedName:'card-ledger-data.json',
    types:[{description:'Card Ledger data',accept:{'application/json':['.json']}}]
  });
  if(!handle)throw new Error('No data file selected.');
  if(!(await localFilePermission(handle,true)))throw new Error('Permission to write the selected data file was not granted.');
  await saveLocalDataHandle(handle);
  const data=buildUnifiedLocalData();
  await writeLocalDataFile(data);
  await refreshLocalDataStatus('✓ Unified local data file created · '+handle.name);
  showToast('Unified Card Ledger data file created');
  return data;
}
async function refreshLocalDataStatus(message){
  const el=document.getElementById('githubStatus');
  if(!el)return;
  try{
    const h=await loadLocalDataHandle();
    el.className='github-status '+(h?'connected':'');
    el.textContent=message||(h?'✓ Unified local data file · '+(h.name||'Card Ledger data'):'○ No local data file selected');
  }catch(e){el.textContent=message||'○ No local data file selected';}
}
async function connectGitHub(){return selectLocalDataFile().catch(e=>showToast(e.message||'Could not select local data file'));}
async function disconnectGitHub(){
  await clearLocalDataHandle();
  chatUpdates=normaliseLocalData(null);
  window.__localUnifiedDataLoaded=false;
  await refreshLocalDataStatus('○ Local data file disconnected');
  showToast('Local data file disconnected');
}
async function uploadEncryptedPayload(payload){
  const p=typeof payload==='string'?JSON.parse(payload):payload;
  const data=await readLocalDataFile();
  if(p&&p.id&&data.entries.some(x=>x&&x.id===p.id))return {already:true};
  data.entries.push(p);
  await writeLocalDataFile(data);
  return {already:false,local:true};
}
async function loadChatUpdates(){
  try{
    chatUpdates=await readLocalDataFile();
    window.chatUpdatesForSecurity=chatUpdates.entries;
    window.__chatFeedSource='local-file';
    return chatUpdates;
  }catch(e){
    chatUpdates=normaliseLocalData(null);
    window.__chatFeedSource='none';
    return chatUpdates;
  }
}
async function saveTransactionToLocalFile(payload){
  const data=await readLocalDataFile();
  // New transaction is inserted into the canonical card record when the card
  // is known; flat entries remains a compatibility mirror.
  if(typeof cards!=='undefined' && Array.isArray(cards)){
    const card=cards.find(c=>c && (c.id===payload.cardId || c.name===payload.card));
    if(card){
      card.entries=Array.isArray(card.entries)?card.entries:[];
      if(!card.entries.some(e=>e&&e.id===payload.id)) card.entries.push(payload);
    }
  }
  if(!data.entries.some(x=>x&&x.id===payload.id)) data.entries.push(payload);
  if(typeof cards!=='undefined' && Array.isArray(cards)) data.cards=cloneJson(cards,[]);
  data.entries=flattenCardEntries(data.cards).concat(data.entries.filter(e=>!flattenCardEntries(data.cards).some(x=>x.id===e.id)));
  if(typeof dueBills!=='undefined') data.dueBills=dueBills;
  if(typeof cashbackLog!=='undefined') data.cashback=cashbackLog;
  if(typeof recurringPayments!=='undefined') data.recurringPayments=recurringPayments;
  await writeLocalDataFile(data);
  await refreshLocalDataStatus('✓ Saved locally · '+(await loadLocalDataHandle()).name);
  return true;
}
