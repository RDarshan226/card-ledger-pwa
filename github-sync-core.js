/* Card Ledger PWA — GITHUB SYNC CORE
 * Protected module. Do not modify for GUI changes.
 * Owns GitHub token persistence, encrypted-feed access and encrypted payload upload.
 */
const CHAT_UPDATES_URL = './chat-updates.json';
const CHAT_KEY_STORAGE_KEY = 'card-ledger-chat-aes-key-v1';
const GITHUB_TOKEN_STORAGE_KEY = 'card-ledger-github-token-v1';
const GITHUB_REPO = 'RDarshan226/card-ledger-pwa';
const GITHUB_PATH = 'chat-updates.json';
const GITHUB_API_BASE = 'https://api.github.com';
let chatUpdates = { version: 2, entries: [], cashback: [] };

// Compatibility aliases retained for older encrypted-feed code paths.
function B64(bytes){
  const a=bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out='';
  for(let i=0;i<a.length;i++) out+=String.fromCharCode(a[i]);
  return btoa(out);
}
function b64(bytes){ return B64(bytes); }

function bytesToUtf8B64(text){
  const bytes=new TextEncoder().encode(text);
  let s='';
  for(let i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64ToUtf8(str){
  const s=atob(String(str).replace(/\s/g,''));
  const bytes=new Uint8Array(s.length);
  for(let i=0;i<s.length;i++) bytes[i]=s.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
async function getGitHubToken(){
  try{
    const saved=await window.storage.get(GITHUB_TOKEN_STORAGE_KEY,false);
    return saved&&saved.value ? saved.value : '';
  }catch(e){ return ''; }
}
async function setGitHubToken(token){
  await window.storage.set(GITHUB_TOKEN_STORAGE_KEY,token);
}
async function clearGitHubToken(){
  try{ await window.storage.remove(GITHUB_TOKEN_STORAGE_KEY); }catch(e){}
}
async function githubApi(path, options={}){
  const token=options.token||await getGitHubToken();
  if(!token) throw new Error('GitHub is not connected');
  const headers={
    'Accept':'application/vnd.github+json',
    'Authorization':'Bearer '+token,
    'X-GitHub-Api-Version':'2022-11-28',
    ...(options.headers||{})
  };
  const res=await fetch(GITHUB_API_BASE+path,{...options,headers});
  if(!res.ok){
    let detail='';
    try{ const body=await res.json(); detail=body.message||''; }catch(e){}
    const err=new Error(detail||('GitHub request failed ('+res.status+')'));
    err.status=res.status;
    throw err;
  }
  return res;
}
async function getGitHubChatFile(token){
  const res=await githubApi('/repos/'+GITHUB_REPO+'/contents/'+GITHUB_PATH+'?ref=main',{token});
  const data=await res.json();
  if(!data.content || !data.sha) throw new Error('GitHub returned an invalid chat feed');
  return {sha:data.sha, data:JSON.parse(b64ToUtf8(data.content))};
}
function normaliseChatFeed(data){
  return {
    version:2,
    entries:Array.isArray(data&&data.entries)?data.entries:[],
    cashback:Array.isArray(data&&data.cashback)?data.cashback:[]
  };
}
async function refreshGitHubStatus(message){
  const el=document.getElementById('githubStatus');
  if(!el) return;
  const token=await getGitHubToken();
  if(!token){
    el.className='github-status';
    el.textContent=message||'○ Not connected · encrypted transactions will stay local until you connect GitHub';
    return;
  }
  el.className='github-status connected';
  el.textContent=message||'✓ GitHub connected · upload target: '+GITHUB_REPO+'/'+GITHUB_PATH;
}
async function connectGitHub(){
  const existing=await getGitHubToken();
  const promptText='Paste a GitHub fine-grained Personal Access Token with access ONLY to this repository and Contents: Read and write.\n\nDo not use a broad/classic token. The token is stored encrypted in this PWA and is not uploaded to ChatGPT.';
  const token=prompt(promptText,existing?'':'');
  if(token===null) return;
  const clean=token.trim();
  if(!clean){ showToast('No GitHub token entered'); return; }
  try{
    await getGitHubChatFile(clean);
    await setGitHubToken(clean);
    await refreshGitHubStatus();
    showToast('GitHub connected');
  }catch(e){
    await refreshGitHubStatus();
    showToast(e.message||'Could not connect GitHub');
  }
}
async function disconnectGitHub(){
  if(!confirm('Disconnect GitHub from this device? Your encrypted ledger data will remain on the device and in GitHub.')) return;
  await clearGitHubToken();
  await refreshGitHubStatus();
  showToast('GitHub disconnected');
}
async function uploadEncryptedPayload(token){
  const clean=String(token||'').trim();
  if(!clean) throw new Error('Nothing encrypted to upload');
  let lastError=null;
  for(let attempt=0; attempt<2; attempt++){
    try{
      const current=await getGitHubChatFile(await getGitHubToken());
      const feed=normaliseChatFeed(current.data);
      if(feed.entries.some(x=>x&&x.payload===clean)){
        await refreshGitHubStatus('✓ Already uploaded · GitHub feed already contains this transaction');
        return {already:true};
      }
      feed.entries.push({payload:clean});
      const content=JSON.stringify(feed,null,2)+'\n';
      const body={
        message:'Add encrypted Card Ledger transaction',
        content:bytesToUtf8B64(content),
        sha:current.sha,
        branch:'main'
      };
      const res=await githubApi('/repos/'+GITHUB_REPO+'/contents/'+GITHUB_PATH,{
        method:'PUT',
        body:JSON.stringify(body),
        headers:{'Content-Type':'application/json'}
      });
      if(!res.ok) throw new Error('GitHub upload failed');
      // Round-trip verification: only report success after the exact GitHub
      // copy can be decrypted with the current encryption key.
      const verify=await getGitHubChatFile(await getGitHubToken());
      const verifiedEntries=Array.isArray(verify.data&&verify.data.entries)?verify.data.entries:[];
      const remoteEntry=verifiedEntries.find(x=>x&&x.payload===clean);
      if(!remoteEntry) throw new Error('GitHub accepted the upload, but the encrypted transaction could not be found in the GitHub feed.');
      try{
        if(typeof decryptChatPayload==='function') await decryptChatPayload(clean);
        else{
          const ps=clean.split('.');
          if(ps.length!==3) throw new Error('Invalid encrypted payload');
          const ivRaw=atob(ps[1]),ctRaw=atob(ps[2]);
          const iv=new Uint8Array(ivRaw.length),ct=new Uint8Array(ctRaw.length);
          for(let i=0;i<ivRaw.length;i++) iv[i]=ivRaw.charCodeAt(i);
          for(let i=0;i<ctRaw.length;i++) ct[i]=ctRaw.charCodeAt(i);
          await crypto.subtle.decrypt({name:'AES-GCM',iv},await getChatCryptoKey(),ct);
        }
      }catch(e){
        throw new Error('GitHub accepted the encrypted transaction, but this device could not decrypt the uploaded copy with the current key. The key used for encryption and the selected key do not match.');
      }
      await refreshGitHubStatus('✓ Uploaded & verified · GitHub copy decrypts with the current key');
      return {already:false,verified:true};
    }catch(e){
      lastError=e;
      if(e.status===409 && attempt===0) continue;
      break;
    }
  }
  throw lastError||new Error('GitHub upload failed');
}

 
