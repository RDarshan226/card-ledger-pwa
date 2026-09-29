/* Card Ledger PWA — GitHub-only data core.
 * User ledger data is stored in card-ledger-data.json in the repository.
 */
const GITHUB_DATA_REPO='RDarshan226/card-ledger-pwa';
const GITHUB_DATA_PATH='card-ledger-data.json';
const GITHUB_DATA_BRANCH='main';
const GITHUB_TOKEN_KEY='card-ledger-github-token-v1';
const LEDGER_DATA_VERSION=4;
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
  return {data:normaliseLedgerData(parsed),sha:j.sha||null,missing:false};
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
    const normal=normaliseLedgerData(data);
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
  const data=current.data?normaliseLedgerData(current.data):buildUnifiedLedgerData();
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
  await applyLedgerDataState(saved);
  window.__githubDataUsingFallback=false;
  window.__githubDataRecoveryRequired=false;
  window.__githubDataRecoveryReason='';
  return saved;
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

function normaliseLedgerData(data){
  const d=data&&typeof data==='object'?data:{};
  const cards=Array.isArray(d.cards)?d.cards:[];
  const entries=Array.isArray(d.entries)?d.entries:[];
  const cashback=Array.isArray(d.cashback)?d.cashback:(Array.isArray(d.cashbackLog)?d.cashbackLog:[]);
  const dueBills=Array.isArray(d.dueBills)?d.dueBills:[];
  const recurringPayments=Array.isArray(d.recurringPayments)?d.recurringPayments:[];
  const deletedEntryIds=Array.isArray(d.deletedEntryIds)?d.deletedEntryIds:[];
  const removedCardNames=Array.isArray(d.removedCardNames)?d.removedCardNames:[];
  return {
    version:LEDGER_DATA_VERSION,
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

async function applyLedgerDataState(data){
  const d=normaliseLedgerData(data);
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
  window.__chatFeedSource='github';
  window.__githubUnifiedDataLoaded=Array.isArray(d.cards)&&d.cards.length>0;
  return d;
}

function buildUnifiedLedgerData(){
  return normaliseLedgerData({
    version:LEDGER_DATA_VERSION,
    cards:typeof cards!=='undefined'&&Array.isArray(cards)?cards:[],
    dueBills:typeof dueBills!=='undefined'&&Array.isArray(dueBills)?dueBills:[],
    cashback:typeof cashbackLog!=='undefined'&&Array.isArray(cashbackLog)?cashbackLog:[],
    recurringPayments:typeof recurringPayments!=='undefined'&&Array.isArray(recurringPayments)?recurringPayments:[],
    deletedEntryIds:typeof deletedEntryIds!=='undefined'?[...deletedEntryIds]:[],
    removedCardNames:typeof removedCardNames!=='undefined'?[...removedCardNames]:[]
  });
}

async function connectGitHub(){
  try{
    await requireGitHubToken();
    const remote=await fetchGitHubDataFile();
    if(remote.data){
      await applyLedgerDataState(remote.data);
      window.__githubDataRecoveryRequired=false;
      window.__githubDataRecoveryReason='';
      return remote.data;
    }
    const seed=buildUnifiedLedgerData();
    await writeGitHubData(seed,'Card Ledger: initialize data file');
    await applyLedgerDataState(seed);
    return seed;
  }catch(e){throw e;}
}

async function disconnectGitHub(){
  clearGitHubToken();
  const el=document.getElementById('githubStatus');
  if(el)el.textContent='○ GitHub data connection cleared';
  showToast('GitHub token cleared from this browser session');
}

async function getGitHubDataStatus(){
  try{
    const remote=await fetchGitHubDataFile();
    return {connected:!!getGitHubToken(),exists:!remote.missing,entries:remote.data&&Array.isArray(remote.data.entries)?remote.data.entries.length:0};
  }catch(e){return {connected:false,exists:false,error:e&&e.message?e.message:'GitHub unavailable'};}
}

async function readGitHubData(){
  const remote=await fetchGitHubDataFile();
  if(!remote.data) throw new Error('GitHub Card Ledger data file was not found.');
  return remote.data;
}
async function saveUnifiedLedgerData(){
  const saved=await writeGitHubData(buildUnifiedLedgerData(),'Card Ledger: save data');
  await applyLedgerDataState(saved);
  return true;
}
async function saveEntryToGitHub(payload){
  return await saveGitHubEntry(payload);
}
async function loadChatUpdates(){
  const data=await readGitHubData();
  await applyLedgerDataState(data);
  window.__chatFeedSource='github';
  return data;
}
window.__githubDataRecoveryRequired=false;
window.__githubDataRecoveryReason='';
window.__githubDataUsingFallback=false;
