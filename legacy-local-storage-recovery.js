/* LEGACY — NOT LOADED BY THE PWA
 *
 * Preserved only as a historical reference for the old device-file / IndexedDB
 * recovery implementation. The live Card Ledger never imports this file.
 */

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
const LOCAL_DATA_FALLBACK_ID='fallback-data';
const LOCAL_DATA_VERSION=4;
const GITHUB_DATA_REPO='RDarshan226/card-ledger-pwa';
const GITHUB_DATA_PATH='card-ledger-data.json';
const GITHUB_DATA_BRANCH='main';
const GITHUB_TOKEN_KEY='card-ledger-github-token-v1';
let githubWritePromise=null;

function getGitHubToken(){
  try{return String(sessionStorage.getItem(GITHUB_TOKEN_KEY)||'').trim();}catch(e){return '';}
}
function setGitHubToken(token){
  try{if(token)sessionStorage.setItem(GITHUB_TOKEN_KEY,String(token).trim());else sessionStorage.removeItem(GITHUB_TOKEN_KEY);}catch(e){}
}
function clearGitHubToken(){setGitHubToken('');}
function githubApiHeaders(write=false){
  const h={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  const token=getGitHubToken();
  if(token)h.Authorization='Bearer '+token;
  if(write)h['Content-Type']='application/json';
  return h;
}
function decodeGitHubBase64(value){
  const raw=String(value||'').replace(/\\s/g,'');
  const bin=atob(raw);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function encodeGitHubBase64(value){
  const bytes=new TextEncoder().encode(String(value||''));
  let bin='';
  for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function githubDataApiUrl(){
  return 'https://api.github.com/repos/'+GITHUB_DATA_REPO+'/contents/'+encodeURIComponent(GITHUB_DATA_PATH)+'?ref='+encodeURIComponent(GITHUB_DATA_BRANCH);
}
async function fetchGitHubDataFile(){
  const res=await fetch(githubDataApiUrl(),{headers:githubApiHeaders(false),cache:'no-store'});
  if(res.status===404)return {data:null,sha:null,missing:true};
  if(!res.ok){
    let detail='GitHub data read failed ('+res.status+').';
    try{const j=await res.json();if(j&&j.message)detail+=' '+j.message;}catch(e){}
    throw new Error(detail);
  }
  const j=await res.json();
  const parsed=JSON.parse(decodeGitHubBase64(j.content||''));
  return {data:normaliseLocalData(parsed),sha:j.sha||null,missing:false};
}
async function requireGitHubToken(){
  let token=getGitHubToken();
  if(token)return token;
  token=window.prompt('Enter your GitHub fine-grained Personal Access Token. It is kept only for this browser session. The token must have Contents: Read and write access to '+GITHUB_DATA_REPO+'.','');
  if(!token)throw new Error('GitHub token is required to save transactions.');
  setGitHubToken(token.trim());
  return getGitHubToken();
}
async function writeGitHubData(data,commitMessage){
  if(githubWritePromise)return githubWritePromise;
  githubWritePromise=(async()=>{
    const token=await requireGitHubToken();
    const current=await fetchGitHubDataFile();
    const normal=normaliseLocalData(data);
    normal.updatedAt=new Date().toISOString();
    const body={message:commitMessage||'Update Card Ledger data',content:encodeGitHubBase64(JSON.stringify(normal,null,2)+'\n'),branch:GITHUB_DATA_BRANCH};
    if(current.sha)body.sha=current.sha;
    let res=await fetch('https://api.github.com/repos/'+GITHUB_DATA_REPO+'/contents/'+GITHUB_DATA_PATH,{method:'PUT',headers:githubApiHeaders(true),body:JSON.stringify(body)});
    if(!res.ok && res.status===422){
      // GitHub can reject a stale/missing SHA when the data file already exists.
      // Re-read the file and retry once with the current SHA.
      const fresh=await fetchGitHubDataFile();
      if(fresh.sha){
        body.sha=fresh.sha;
        res=await fetch('https://api.github.com/repos/'+GITHUB_DATA_REPO+'/contents/'+GITHUB_DATA_PATH,{method:'PUT',headers:githubApiHeaders(true),body:JSON.stringify(body)});
      }
    }
    if(!res.ok){
      let detail='GitHub data write failed ('+res.status+').';
      try{const j=await res.json();if(j&&j.message)detail+=' '+j.message;}catch(e){}
      throw new Error(detail);
    }
    return normal;
  })();
  try{return await githubWritePromise;}finally{githubWritePromise=null;}
}
async function saveGitHubEntry(payload){
  const current=await fetchGitHubDataFile();
  const data=current.data?normaliseLocalData(current.data):buildUnifiedLocalData();
  if(typeof cards!=='undefined'&&Array.isArray(cards)&&cards.length)data.cards=cloneJson(cards,[]);
  const remoteEntries=Array.isArray(data.entries)?data.entries:[];
  const cardEntries=flattenCardEntries(data.cards);
  const merged=[];
  const seen=new Set();
  [...remoteEntries,...cardEntries].forEach(e=>{if(e&&e.id&&!seen.has(String(e.id))){seen.add(String(e.id));merged.push(cloneJson(e,e));}});
  if(!seen.has(String(payload.id)))merged.push(cloneJson(payload,payload));
  data.entries=merged;
  const card=data.cards.find(c=>c&&(c.id===payload.cardId||c.name===payload.card));
  if(card){
    card.entries=Array.isArray(card.entries)?card.entries:[];
    if(!card.entries.some(e=>e&&String(e.id)===String(payload.id)))card.entries.push(cloneJson(payload,payload));
  }
  data.entries=flattenCardEntries(data.cards).concat(data.entries.filter(e=>e&&!flattenCardEntries(data.cards).some(x=>String(x.id)===String(e.id))));
  const saved=await writeGitHubData(data,'Card Ledger: add transaction');
  await applyLocalDataState(saved);
  window.__localDataUsingFallback=false;
  window.__localDataRecoveryRequired=false;
  window.__localDataRecoveryReason='';
  return saved;
}
let localDataDbPromise;
let chatUpdates={version:LOCAL_DATA_VERSION,entries:[],cashback:[]};
window.__localDataRecoveryRequired=false;
window.__localDataRecoveryReason='';

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
async function readLocalDataFallback(){
  const db=await openLocalDataDB();
  return await new Promise((resolve,reject)=>{
    const r=db.transaction(LOCAL_DATA_STORE,'readonly').objectStore(LOCAL_DATA_STORE).get(LOCAL_DATA_FALLBACK_ID);
    r.onsuccess=()=>resolve(r.result?normaliseLocalData(r.result):null);
    r.onerror=()=>reject(r.error);
  });
}
async function writeLocalDataFallback(data){
  const db=await openLocalDataDB();
  const normal=normaliseLocalData(data);
  normal.updatedAt=new Date().toISOString();
  await new Promise((resolve,reject)=>{
    const r=db.transaction(LOCAL_DATA_STORE,'readwrite').objectStore(LOCAL_DATA_STORE).put(normal,LOCAL_DATA_FALLBACK_ID);
    r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error);
  });
  chatUpdates=normal;
  return normal;
}
async function readLocalDataFile(){
  // GitHub is the single source of truth. Do not fall back to browser files,
  // IndexedDB, or the old local-recovery flow.
  const remote=await fetchGitHubDataFile();
  if(remote.data)return remote.data;
  if(typeof cards!=='undefined'&&Array.isArray(cards)&&cards.length)return buildUnifiedLocalData();
  throw new Error('GitHub Card Ledger data is unavailable.');
}
async function writeLocalDataFile(data){
  // GitHub is now the primary persistence target. Local file support remains
  // only as a fallback for older data/recovery flows.
  try{
    const saved=await writeGitHubData(data,'Card Ledger: save data');
    window.__localDataUsingFallback=false;
    return saved;
  }catch(e){
    if(getGitHubToken()) throw e;
  }
  const handle=await loadLocalDataHandle();
  if(!handle){
    const fallback=await readLocalDataFallback();
    if(fallback){
      const normal=await writeLocalDataFallback(data);
      window.__localDataUsingFallback=true;
      return normal;
    }
    throw new Error('No writable Card Ledger data file is selected. Please select the original JSON file again.');
  }
  if(!(await localFilePermission(handle,true))) throw new Error('Permission to write the selected Card Ledger file was not granted.');
  const normal=normaliseLocalData(data);
  normal.updatedAt=new Date().toISOString();
  const json=JSON.stringify(normal,null,2)+'\\n';
  if(typeof handle.createWritable!=='function') throw new Error('This browser cannot directly edit the selected JSON file. Please use a browser with file editing support.');
  const writable=await handle.createWritable();
  await writable.write(json);
  await writable.close();
  // Verify the browser actually persisted the new contents to the selected file.
  try{
    const verifyFile=await handle.getFile();
    const verifyText=await verifyFile.text();
    if(verifyText!==json) throw new Error('The selected Card Ledger file could not be verified after writing.');
  }catch(e){
    throw new Error(e&&e.message?e.message:'The selected Card Ledger file could not be verified after writing.');
  }
  chatUpdates=normal;
  window.__localDataUsingFallback=false;
  return normal;
}
async function downloadLocalDataSnapshot(data,message){
  try{
    const normal=normaliseLocalData(data);
    normal.updatedAt=new Date().toISOString();
    const blob=new Blob([JSON.stringify(normal,null,2)+'\\n'],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='card-ledger-data-latest.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1500);
    if(message) showToast(message);
    return true;
  }catch(e){
    if(message) showToast('Could not export the latest JSON file');
    return false;
  }
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
  try{
    if(await loadLocalDataHandle()) return true;
    return !!(await readLocalDataFallback());
  }catch(e){return false;}
}
async function saveUnifiedLocalData(){
  await writeLocalDataFile(buildUnifiedLocalData());
  return true;
}
function attachFlatEntriesToCards(localCards, flatEntries){
  const result=cloneJson(localCards,[]);
  const list=Array.isArray(flatEntries)?flatEntries:[];
  result.forEach(c=>{
    if(!Array.isArray(c.entries)) c.entries=[];
    const mine=list.filter(e=>e && (
      (e.cardId && c.id && String(e.cardId)===String(c.id)) ||
      (e.card && c.name && String(e.card).trim()===String(c.name).trim())
    ));
    const ids=new Set(c.entries.filter(Boolean).map(e=>String(e.id)));
    mine.forEach(e=>{if(e.id && !ids.has(String(e.id))) c.entries.push(cloneJson(e,e));});
  });
  return result;
}
async function applyLocalDataState(data){
  const d=normaliseLocalData(data);
  // Cards are the canonical session records. Older unified files may have
  // cards plus transactions only in the top-level entries mirror; reattach
  // those entries by cardId/card name so the Ledger is not empty.
  if(typeof cards!=='undefined' && Array.isArray(d.cards) && d.cards.length){
    cards=attachFlatEntriesToCards(d.cards,d.entries);
    // Make the normalized object itself canonical too. This is important on
    // Brave/Android fallback import: otherwise the imported transactions are
    // attached to the live cards only, while the fallback copy still contains
    // empty cards[].entries and becomes empty again after reopening.
    d.cards=cloneJson(cards,[]);
    d.entries=flattenCardEntries(cards);
  }
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
    window.__localDataRecoveryRequired=false;
    window.__localDataRecoveryReason='';
    return d;
  }catch(e){
    window.__localUnifiedDataLoaded=false;
    window.__localDataRecoveryRequired=true;
    window.__localDataRecoveryReason=e&&e.message?e.message:'The local Card Ledger data could not be opened.';
    return null;
  }
}
async function selectLocalDataFile(){
  if(window.showOpenFilePicker){
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
    if(!text.trim()) throw new Error('The selected file is empty.');
    try{
      const parsed=parseLedgerJson(text);
      if(!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error('JSON root must be an object.');
      const hasLedgerShape=Array.isArray(parsed.cards)||Array.isArray(parsed.entries)||Array.isArray(parsed.dueBills)||Array.isArray(parsed.cashback)||Array.isArray(parsed.cashbackLog)||Array.isArray(parsed.recurringPayments);
      if(!hasLedgerShape) throw new Error('This JSON does not contain Card Ledger data.');
      data=normaliseLocalData(parsed);
    }catch(e){
      throw new Error(e&&e.message?e.message:'The selected file is not valid Card Ledger JSON.');
    }
    await saveLocalDataHandle(handle);
    const hadCards=Array.isArray(data.cards)&&data.cards.length>0;
    await applyLocalDataState(data);
    if(!hadCards && typeof cards!=='undefined' && Array.isArray(cards) && cards.length){
      const current=buildUnifiedLocalData();
      data={...data,cards:current.cards};
    }
    data=normaliseLocalData(data);
    await writeLocalDataFile(data);
    if(typeof window.__reloadAfterLocalFileSelection==='function') await window.__reloadAfterLocalFileSelection();
    await refreshLocalDataStatus('✓ Unified local data file selected · '+handle.name);
    showToast('Unified Card Ledger data file selected');
    return data;
  }
  // Brave/other Chromium fallback: use the normal Android file picker and keep
  // the imported JSON in IndexedDB. The app remains fully usable and private;
  // use Backup Now to export the latest JSON back to a file.
  return await new Promise((resolve,reject)=>{
    const input=document.createElement('input');
    input.type='file'; input.accept='application/json,.json'; input.style.display='none';
    input.onchange=async()=>{
      try{
        const file=input.files&&input.files[0];
        if(!file) throw new Error('No data file selected.');
        const text=await file.text();
        let data;
        if(!text.trim()) throw new Error('The selected file is empty.');
        try{
          const parsed=JSON.parse(text);
          if(!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error('JSON root must be an object.');
          const hasLedgerShape=Array.isArray(parsed.cards)||Array.isArray(parsed.entries)||Array.isArray(parsed.dueBills)||Array.isArray(parsed.cashback)||Array.isArray(parsed.cashbackLog)||Array.isArray(parsed.recurringPayments);
          if(!hasLedgerShape) throw new Error('This JSON does not contain Card Ledger data.');
          data=normaliseLocalData(parsed);
        }catch(e){
          throw new Error(e&&e.message?e.message:'The selected file is not valid Card Ledger JSON.');
        }
        await clearLocalDataHandle();
        const hadCards=Array.isArray(data.cards)&&data.cards.length>0;
        await applyLocalDataState(data);
        if(!hadCards && typeof cards!=='undefined' && Array.isArray(cards) && cards.length){
          const current=buildUnifiedLocalData();
          data={...data,cards:current.cards};
        }
        data=normaliseLocalData(data);
        await writeLocalDataFallback(data);
        if(typeof window.__reloadAfterLocalFileSelection==='function') await window.__reloadAfterLocalFileSelection();
        await refreshLocalDataStatus('✓ Brave-compatible local data imported · '+file.name);
        showToast('Local data imported for Brave');
        resolve(data);
      }catch(e){reject(e);}
      finally{input.remove();}
    };
    document.body.appendChild(input);
    input.click();
  });
}
async function createLocalDataFile(){
  if(window.showSaveFilePicker){
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
  const data=buildUnifiedLocalData();
  await clearLocalDataHandle();
  await writeLocalDataFallback(data);
  await refreshLocalDataStatus('✓ Brave-compatible local storage active');
  showToast('Brave-compatible local storage created · use Backup Now to export');
  return data;
}
async function refreshLocalDataStatus(message){
  const el=document.getElementById('githubStatus');
  if(!el)return;
  try{
    const h=await loadLocalDataHandle();
    el.className='github-status '+(h?'connected':'');
    const fallback=await readLocalDataFallback();
    el.textContent=message||(h?'✓ Unified local data file · '+(h.name||'Card Ledger data'):(fallback?'✓ Brave-compatible local storage':'○ No local data file selected'));
  }catch(e){el.textContent=message||'○ No local data file selected';}
}
async function connectGitHub(){
  try{
    await requireGitHubToken();
    const remote=await fetchGitHubDataFile();
    if(remote.data){
      await applyLocalDataState(remote.data);
      window.__localDataRecoveryRequired=false;
      window.__localDataRecoveryReason='';
      return remote.data;
    }
    const seed=buildUnifiedLocalData();
    await writeGitHubData(seed,'Card Ledger: initialize data file');
    await applyLocalDataState(seed);
    return seed;
  }catch(e){throw e;}
}
async function disconnectGitHub(){
  clearGitHubToken();
  await refreshLocalDataStatus('○ GitHub data connection cleared');
  showToast('GitHub token cleared from this browser session');
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
function parseLedgerJson(text){
  const raw=String(text||'').replace(/^\\uFEFF/,'').trimStart();
  if(!raw) throw new Error('The selected Card Ledger data file is empty.');
  try{return JSON.parse(raw);}catch(firstError){
    const end=findFirstJsonValueEnd(raw);
    if(end>0){
      const first=raw.slice(0,end);
      try{
        const parsed=JSON.parse(first);
        // Some older exported files contain a second JSON value appended after
        // the valid ledger object. Keep the valid first object instead of
        // failing with "Unexpected non-whitespace character after JSON".
        return parsed;
      }catch(e){}
    }
    throw firstError;
  }
}

function findFirstJsonValueEnd(text){
  const s=String(text||'').replace(/^\\uFEFF/,'').trimStart();
  if(!s) return -1;
  const offset=text.indexOf(s);
  let depth=0,inString=false,escaped=false;
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(inString){
      if(escaped) escaped=false;
      else if(ch==='\\\\') escaped=true;
      else if(ch==='"') inString=false;
      continue;
    }
    if(ch==='"'){inString=true;continue;}
    if(ch==='{'||ch==='['){depth++;continue;}
    if(ch==='}'||ch===']'){
      depth--;
      if(depth===0) return offset+i+1;
      if(depth<0) return -1;
    }
  }
  return -1;
}

async function saveEntryToChosenLocalFile(payload){
  return await saveGitHubEntry(payload);
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
  const savedHandle=await loadLocalDataHandle();
  await refreshLocalDataStatus(savedHandle?'✓ Updated original file · '+savedHandle.name:'✓ Saved to local storage');
  return true;
}

async function getGitHubDataStatus(){
  try{
    const remote=await fetchGitHubDataFile();
    return {connected:!!getGitHubToken(),exists:!remote.missing,entries:remote.data&&Array.isArray(remote.data.entries)?remote.data.entries.length:0};
  }catch(e){return {connected:false,exists:false,error:e&&e.message?e.message:'GitHub unavailable'};}
}
window.getGitHubDataStatus=getGitHubDataStatus;
window.clearGitHubToken=clearGitHubToken;
