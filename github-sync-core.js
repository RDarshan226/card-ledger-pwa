/* Card Ledger PWA — LOCAL DATA FILE CORE
 * Transactions are stored as plain JSON in a user-selected local file.
 * No encryption, decryption, GitHub upload, or remote feed is used.
 */
const LOCAL_DATA_DB='card-ledger-local-file-v1';
const LOCAL_DATA_STORE='handles';
const LOCAL_DATA_ID='primary';
let localDataDbPromise;
let chatUpdates={version:3,entries:[],cashback:[]};

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
function normaliseLocalData(data){
  return {version:3,entries:Array.isArray(data&&data.entries)?data.entries:[],cashback:Array.isArray(data&&data.cashback)?data.cashback:[]};
}
async function readLocalDataFile(){
  const handle=await loadLocalDataHandle();
  if(!handle) throw new Error('No Card Ledger data file selected. Choose a local JSON file first.');
  if(!(await localFilePermission(handle,true))) throw new Error('Permission to access the selected Card Ledger file was not granted.');
  const file=await handle.getFile();
  const text=await file.text();
  if(!text.trim())return normaliseLocalData(null);
  try{return normaliseLocalData(JSON.parse(text));}
  catch(e){throw new Error('The selected Card Ledger file is not valid JSON.');}
}
async function writeLocalDataFile(data){
  const handle=await loadLocalDataHandle();
  if(!handle) throw new Error('No Card Ledger data file selected.');
  if(!(await localFilePermission(handle,true))) throw new Error('Permission to write the selected Card Ledger file was not granted.');
  const writable=await handle.createWritable();
  await writable.write(JSON.stringify(normaliseLocalData(data),null,2)+'\n');
  await writable.close();
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
  if(!(await localFilePermission(handle,true)))throw new Error('Permission to access the selected file was not granted.');
  const file=await handle.getFile();
  const text=await file.text();
  let data;
  if(!text.trim())data=normaliseLocalData(null);
  else{try{data=normaliseLocalData(JSON.parse(text));}catch(e){throw new Error('The selected file is not valid Card Ledger JSON.');}}
  await saveLocalDataHandle(handle);
  await writeLocalDataFile(data);
  chatUpdates=data;
  await refreshLocalDataStatus('✓ Local data file selected · '+handle.name);
  showToast('Card Ledger data file selected');
  return data;
}
async function createLocalDataFile(){
  if(!window.showSaveFilePicker)throw new Error('This browser does not support direct local-file access. Open the PWA in Chrome/Edge on a supported device.');
  const handle=await window.showSaveFilePicker({
    suggestedName:'card-ledger-data.json',
    types:[{description:'Card Ledger data',accept:{'application/json':['.json']}}]
  });
  if(!handle)throw new Error('No data file selected.');
  if(!(await localFilePermission(handle,true)))throw new Error('Permission to access the selected file was not granted.');
  await saveLocalDataHandle(handle);
  const data=normaliseLocalData(null);
  await writeLocalDataFile(data);
  chatUpdates=data;
  await refreshLocalDataStatus('✓ Local data file created · '+handle.name);
  showToast('Card Ledger data file created');
  return data;
}
async function refreshLocalDataStatus(message){
  const el=document.getElementById('githubStatus');
  if(!el)return;
  try{
    const h=await loadLocalDataHandle();
    el.className='github-status '+(h?'connected':'');
    el.textContent=message||(h?'✓ Local data file selected · '+(h.name||'Card Ledger data'):'○ No local data file selected');
  }catch(e){el.textContent=message||'○ No local data file selected';}
}
async function connectGitHub(){return selectLocalDataFile().catch(e=>showToast(e.message||'Could not select data file'));}
async function disconnectGitHub(){
  await clearLocalDataHandle();
  chatUpdates=normaliseLocalData(null);
  await refreshLocalDataStatus('○ Local data file disconnected');
  showToast('Local data file disconnected');
}
async function uploadEncryptedPayload(payload){
  const p=typeof payload==='string'?JSON.parse(payload):payload;
  const data=await readLocalDataFile();
  if(p&&p.id&&data.entries.some(x=>x&&x.id===p.id))return {already:true};
  data.entries.push(p);
  await writeLocalDataFile(data);
  chatUpdates=data;
  await refreshLocalDataStatus('✓ Saved locally · '+(await loadLocalDataHandle()).name);
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
  if(!data.entries.some(x=>x&&x.id===payload.id))data.entries.push(payload);
  await writeLocalDataFile(data);
  chatUpdates=data;
  await refreshLocalDataStatus('✓ Transaction saved · '+(await loadLocalDataHandle()).name);
  return true;
}
