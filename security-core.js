/* Card Ledger PWA — SECURITY CORE
 * Protected security module. Credential persistence is intentionally isolated
 * from the main encrypted ledger database so app/UI updates cannot couple
 * Chat/GitHub credentials to ordinary ledger-storage reads.
 */
function bytesToB64(bytes){
  let s='';
  for(let i=0;i<bytes.length;i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64ToBytes(str){
  const s=atob(str);
  const out=new Uint8Array(s.length);
  for(let i=0;i<s.length;i++) out[i]=s.charCodeAt(i);
  return out;
}

const CREDENTIAL_DB='card-ledger-credentials-v1';
const CREDENTIAL_STORE='credentials';
const CHAT_CREDENTIAL='chatJwk';
const GITHUB_CREDENTIAL='githubToken';
let credentialDbPromise;

function openCredentialDB(){
  if(credentialDbPromise) return credentialDbPromise;
  credentialDbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(CREDENTIAL_DB,1);
    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(CREDENTIAL_STORE)) req.result.createObjectStore(CREDENTIAL_STORE); };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return credentialDbPromise;
}
async function credentialGet(key){
  const db=await openCredentialDB();
  return await new Promise((resolve,reject)=>{
    const r=db.transaction(CREDENTIAL_STORE,'readonly').objectStore(CREDENTIAL_STORE).get(key);
    r.onsuccess=()=>resolve(r.result==null?null:r.result);
    r.onerror=()=>reject(r.error);
  });
}
async function credentialSet(key,value){
  const db=await openCredentialDB();
  return await new Promise((resolve,reject)=>{
    const r=db.transaction(CREDENTIAL_STORE,'readwrite').objectStore(CREDENTIAL_STORE).put(value,key);
    r.onsuccess=()=>resolve(true);
    r.onerror=()=>reject(r.error);
  });
}
async function credentialRemove(key){
  const db=await openCredentialDB();
  return await new Promise((resolve,reject)=>{
    const r=db.transaction(CREDENTIAL_STORE,'readwrite').objectStore(CREDENTIAL_STORE).delete(key);
    r.onsuccess=()=>resolve(true);
    r.onerror=()=>reject(r.error);
  });
}

window.cardLedgerCredentialVault={
  async getChatJwk(){ return await credentialGet(CHAT_CREDENTIAL); },
  async setChatJwk(jwk){ return await credentialSet(CHAT_CREDENTIAL,jwk); },
  async removeChatJwk(){ return await credentialRemove(CHAT_CREDENTIAL); },
  async getGitHubToken(){ return await credentialGet(GITHUB_CREDENTIAL); },
  async setGitHubToken(token){ return await credentialSet(GITHUB_CREDENTIAL,token); },
  async removeGitHubToken(){ return await credentialRemove(GITHUB_CREDENTIAL); }
};

async function getChatCryptoKey(){
  if(!window.crypto || !window.crypto.subtle) throw new Error('Web Crypto is unavailable. Open the PWA over HTTPS.');
  let jwk=null;
  try{ jwk=await window.cardLedgerCredentialVault.getChatJwk(); }catch(e){}
  // One-time migration from the legacy encrypted storage location.
  if(!jwk){
    try{
      const saved=await window.storage.get(CHAT_KEY_STORAGE_KEY,false);
      if(saved&&saved.value){
        jwk=JSON.parse(saved.value);
        await window.cardLedgerCredentialVault.setChatJwk(jwk);
      }
    }catch(e){}
  }
  if(jwk){
    try{
      return await crypto.subtle.importKey('jwk',jwk,{name:'AES-GCM'},true,['encrypt','decrypt']);
    }catch(e){
      throw new Error('The saved Chat encryption key is invalid. Import a current Card Ledger recovery package.');
    }
  }
  // IMPORTANT: never silently create a replacement key when encrypted GitHub
  // data already exists. A replacement key would make the existing feed
  // permanently unreadable and is the main cause of recurring key mismatches.
  const existingFeed=Array.isArray(chatUpdates.entries)?chatUpdates.entries:[];
  if(existingFeed.some(x=>x&&typeof x.payload==='string'&&x.payload.startsWith('CL1.'))){
    throw new Error('No saved Chat encryption key is available, but encrypted GitHub transactions already exist. The app will not create a new key. Import the recovery package containing the original Chat key.');
  }
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  const jwk=await crypto.subtle.exportKey('jwk',key);
  await window.cardLedgerCredentialVault.setChatJwk(jwk);
  return key;
}

