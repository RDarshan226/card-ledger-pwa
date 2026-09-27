/* Card Ledger PWA — KEY FILE SECURITY CORE
 * The Card Ledger encryption key is supplied by a user-selected local text file.
 * The file handle may be persisted so the PWA can reopen the file, but the file
 * contents/key are never stored in IndexedDB, localStorage, GitHub, or a vault.
 */ 
const KEY_FILE_DB='card-ledger-key-file-v1';
const KEY_FILE_STORE='handles';
const KEY_FILE_ID='primary';
let keyFileDbPromise;
let sessionKeyText='';
let sessionKeyFileName='';

function openKeyFileDB(){
  if(keyFileDbPromise) return keyFileDbPromise;
  keyFileDbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(KEY_FILE_DB,1);
    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(KEY_FILE_STORE)) req.result.createObjectStore(KEY_FILE_STORE); };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return keyFileDbPromise;
}
async function saveKeyFileHandle(handle){
  const db=await openKeyFileDB();
  return await new Promise((resolve,reject)=>{
    const r=db.transaction(KEY_FILE_STORE,'readwrite').objectStore(KEY_FILE_STORE).put(handle,KEY_FILE_ID);
    r.onsuccess=()=>resolve(true); r.onerror=()=>reject(r.error);
  });
}
async function loadKeyFileHandle(){
  const db=await openKeyFileDB();
  return await new Promise((resolve,reject)=>{
    const r=db.transaction(KEY_FILE_STORE,'readonly').objectStore(KEY_FILE_STORE).get(KEY_FILE_ID);
    r.onsuccess=()=>resolve(r.result||null); r.onerror=()=>reject(r.error);
  });
}
async function removeKeyFileHandle(){
  const db=await openKeyFileDB();
  return await new Promise((resolve,reject)=>{
    const r=db.transaction(KEY_FILE_STORE,'readwrite').objectStore(KEY_FILE_STORE).delete(KEY_FILE_ID);
    r.onsuccess=()=>resolve(true); r.onerror=()=>reject(r.error);
  });
}
async function keyFilePermission(handle,request=false){
  if(!handle) return false;
  if(typeof handle.queryPermission!=='function') return true;
  const opts={mode:'read'};
  try{
    let state=await handle.queryPermission(opts);
    if(state==='granted') return true;
    if(request && typeof handle.requestPermission==='function'){
      state=await handle.requestPermission(opts);
      return state==='granted';
    }
  }catch(e){}
  return false;
}
async function selectChatKeyFile(){
  // Preferred path: File System Access API (Chrome/compatible desktop browsers).
  if(window.showOpenFilePicker){
    const picked=await window.showOpenFilePicker({
      multiple:false,
      types:[{description:'Card Ledger key text file',accept:{'text/plain':['.txt']}}],
      excludeAcceptAllOption:false
    });
    const handle=picked&&picked[0];
    if(!handle) throw new Error('No key file selected');
    const ok=await keyFilePermission(handle,true);
    if(!ok) throw new Error('Permission to read the key file was not granted');
    const file=await handle.getFile();
    const text=await file.text();
    if(!String(text).trim()) throw new Error('The selected key file is empty');
    await saveKeyFileHandle(handle);
    sessionKeyText=String(text).trim();
    sessionKeyFileName=handle.name;
    return {name:handle.name,bytes:text.length,persistent:true};
  }

  // Brave/Android fallback: normal file input. The key text is held only in
  // memory for the current session; it is never written to storage or GitHub.
  return await new Promise((resolve,reject)=>{
    const input=document.createElement('input');
    input.type='file';
    input.accept='.txt,text/plain';
    input.style.display='none';
    let settled=false;
    const finish=(fn,value)=>{if(settled)return;settled=true;input.remove();fn(value);};
    input.onchange=async()=>{
      try{
        const file=input.files&&input.files[0];
        if(!file){finish(reject,new Error('No key file selected'));return;}
        const text=await file.text();
        if(!String(text).trim()){finish(reject,new Error('The selected key file is empty'));return;}
        sessionKeyText=text.trim();
        sessionKeyFileName=file.name;
        finish(resolve,{name:file.name,bytes:text.length,persistent:false});
      }catch(e){finish(reject,e);}
    };
    document.body.appendChild(input);
    input.click();
  });
}
async function clearChatKeyFile(){
  sessionKeyText='';
  sessionKeyFileName='';
  await removeKeyFileHandle();
  return true;
}
async function getKeyFileStatus(){
  if(sessionKeyText) return {selected:true,name:sessionKeyFileName||'Selected key file',persistent:false,permission:'granted'};
  const handle=await loadKeyFileHandle();
  if(!handle) return {selected:false,name:'',persistent:false,permission:'none'};
  if(handle.kind!=='file') return {selected:false,name:'',persistent:false,permission:'none'};
  const granted=await keyFilePermission(handle,false);
  return {selected:true,name:handle.name||'Selected key file',persistent:true,permission:granted?'granted':'denied'};
}
async function readChatKeyText(){
  if(sessionKeyText) return sessionKeyText;
  const handle=await loadKeyFileHandle();
  if(!handle) throw new Error('No encryption key file is selected. Open Secure and select your .txt key file.');
  if(handle.kind!=='file') throw new Error('The saved encryption key handle is not a file');
  if(!(await keyFilePermission(handle,false))) throw new Error('Key file permission is not currently available. Open Secure and select the key file again.');
  const file=await handle.getFile();
  const text=await file.text();
  if(!String(text).trim()) throw new Error('The encryption key file is empty');
  return text.trim();
}
async function keyFromText(text){
  const clean=String(text||'').trim();
  // Accept an exported AES-GCM JWK in a text file so an existing raw key can
  // be carried forward without ever storing the key inside the PWA.
  try{
    const parsed=JSON.parse(clean);
    if(parsed && parsed.kty==='oct' && parsed.k){
      return await crypto.subtle.importKey('jwk',parsed,{name:'AES-GCM'},true,['encrypt','decrypt']);
    }
  }catch(e){}
  // A 32-byte AES key may also be supplied as 64 hexadecimal characters.
  if(/^[0-9a-fA-F]{64}$/.test(clean)){
    const raw=new Uint8Array(32);
    for(let i=0;i<32;i++) raw[i]=parseInt(clean.slice(i*2,i*2+2),16);
    return await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},true,['encrypt','decrypt']);
  }
  // Otherwise the text itself is the user-controlled secret; SHA-256 derives
  // the fixed 256-bit AES-GCM key without persisting the derived key.
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(clean));
  return await crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},true,['encrypt','decrypt']);
}
async function getChatCryptoKey(){
  if(!window.crypto || !window.crypto.subtle) throw new Error('Web Crypto is unavailable. Open the PWA over HTTPS.');
  return await keyFromText(await readChatKeyText());
}
window.cardLedgerKeyFile={
  select:selectChatKeyFile,
  clear:clearChatKeyFile,
  getHandle:loadKeyFileHandle,
  getStatus:getKeyFileStatus,
  readText:readChatKeyText,
  getKey:getChatCryptoKey
};
