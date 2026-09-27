/* Card Ledger PWA — SECURITY CORE
 * Protected module. Do not modify for GUI, card-data, rewards, version, or styling changes.
 * Owns the Chat AES key and binary/base64 helpers used by encrypted CL1 payloads.
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
async function getChatCryptoKey(){
  if(!window.crypto || !window.crypto.subtle) throw new Error('Web Crypto is unavailable. Open the PWA over HTTPS.');
  let saved=null;
  try{ saved=await window.storage.get(CHAT_KEY_STORAGE_KEY, false); }catch(e){
    throw new Error('The saved Chat encryption key could not be opened with the current recovery key. Import the recovery package that was exported after Chat/GitHub encryption was enabled.');
  }
  if(saved && saved.value){
    try{
      const jwk=JSON.parse(saved.value);
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
  await window.storage.set(CHAT_KEY_STORAGE_KEY,JSON.stringify(jwk));
  return key;
}

