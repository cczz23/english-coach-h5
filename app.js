(function(){
const KEY='ec_state_v4',V3='ec_state_v3',V2='ec_state_v2',V1='ec_state_v1';
const UNDO_MAX=5;
let WORDS=[],state,cur=null,stage='A';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hl=s=>esc(s).replace(/\[\[(.+?)\]\]/g,'<mark>$1</mark>');
const Q=()=>window.ECQueue;
const blank=()=>({v:4,mode:'all',mix:Q().MIX_DEFAULT,items:{},recent:[],log:[],undo:[]});
function ensureItem(r){const o={status:r.status??null,seen:r.seen||0,needed:!!r.needed};if(r.updated!=null)o.updated=r.updated;if(r.important!==undefined)o.important=r.important;return o}
function withUndo(s){
 if(!Array.isArray(s.undo))s.undo=[];
 s.mix=Q().resolveMix(s);
 s.mode=Q().modeFromMix(s.mix);
 return s;
}
/** v1 → v4: mastered→dropped; shaky/unknown→weak (safer: treat as shortfall). */
function migrateV1(){let o;try{o=JSON.parse(localStorage.getItem(V1))}catch(e){}if(!o||!o.marks)return null;
 const s=blank();for(const[id,r]of Object.entries(o.marks)){const st=r.status==='mastered'?'dropped':(r.status==='shaky'||r.status==='unknown')?'weak':null;s.items[id]={status:st,seen:r.seen||0,needed:false,important:r.important??null}}
 s.log=(o.log||[]).map(l=>({id:l.id,term:l.t,action:'v1_'+l.s,ts:l.ts||null,seen:(o.marks[l.id]||{}).seen||0,migrated:true}));
 s.migratedFrom='v1';s.migratedAt=Date.now();s.migratedKeepTo='weak';return s;}
/**
 * v2 → v4: old keep → weak (safer default: ambiguous "还要再看" treated as shortfall).
 * Log entries keep historical action tags (incl. "keep"); only items.status is remapped.
 */
function migrateV2(){let o;try{o=JSON.parse(localStorage.getItem(V2))}catch(e){}if(!o||!o.items)return null;
 const s={v:4,items:{},recent:o.recent||[],log:Array.isArray(o.log)?o.log.slice():[],undo:[]};
 for(const[id,r]of Object.entries(o.items)){const st=r.status==='keep'?'weak':r.status;s.items[id]={...ensureItem(r),status:st,needed:false}}
 s.migratedFrom=o.migratedFrom?o.migratedFrom+'+v2':'v2';s.migratedAt=Date.now();s.migratedKeepTo='weak';
 if(o.migratedAt)s.prevMigratedAt=o.migratedAt;return s;}
/** v3 → v4: add needed default false + undo stack; preserve status/log/recent. */
function migrateV3(){let o;try{o=JSON.parse(localStorage.getItem(V3))}catch(e){}if(!o||!o.items||o.v!==3)return null;
 const s={v:4,items:{},recent:o.recent||[],log:Array.isArray(o.log)?o.log.slice():[],undo:[]};
 for(const[id,r]of Object.entries(o.items))s.items[id]=ensureItem(r);
 s.migratedFrom=o.migratedFrom?o.migratedFrom+'+v3':'v3';s.migratedAt=Date.now();
 if(o.migratedKeepTo)s.migratedKeepTo=o.migratedKeepTo;if(o.migratedAt)s.prevMigratedAt=o.migratedAt;return s;}
function load(){try{state=JSON.parse(localStorage.getItem(KEY))}catch(e){}
 if(state&&state.items&&state.v===4){for(const id of Object.keys(state.items))state.items[id]=ensureItem(state.items[id]);withUndo(state);return}
 state=withUndo(migrateV3()||migrateV2()||migrateV1()||blank());save()}
let allowSync=false,syncTimer=null,chain=Promise.resolve();
const SYNC_DEBOUNCE_MS=650;
function syncApi(){return window.ECSync||null}
function setSyncStatus(text){
 const t=text||'';
 document.querySelectorAll('[data-sync-status]').forEach(el=>{
  el.textContent=t;
  el.classList.toggle('is-fail',t.indexOf('同步失败')===0||t.indexOf('请先填写')===0);
 });
}
function syncFail(err){const api=syncApi();setSyncStatus(api&&api.failText?api.failText(err):'同步失败 · 网络')}
function save(){localStorage.setItem(KEY,JSON.stringify(state));if(allowSync)scheduleSync()}
/** Debounce 650ms (within 500–800). Failures only update the status line. */
function scheduleSync(){
 if(!allowSync)return;const api=syncApi();if(!api)return;
 const cfg=api.loadConfig(localStorage);if(!api.isConfigured(cfg))return;
 clearTimeout(syncTimer);
 syncTimer=setTimeout(()=>{chain=chain.then(()=>runPush()).catch(()=>{})},SYNC_DEBOUNCE_MS)}
async function runPush(){
 if(!allowSync)return;const api=syncApi();if(!api)return;
 const cfg=api.loadConfig(localStorage);if(!api.isConfigured(cfg))return;
 const snapshot=JSON.parse(JSON.stringify(state));
 setSyncStatus('同步中');
 try{
  const result=await api.pushState(fetch,cfg,snapshot);
  if(!result.ok){syncFail(result);return}
  if(api.canonical(state)!==api.canonical(snapshot))return runPush();
  setSyncStatus('已同步');
 }catch(e){syncFail(e)}
}
let pullGen=0,wordsReady=false;
async function pullRemote(){
 const api=syncApi();const gen=++pullGen;
 if(!api){allowSync=true;return}
 const cfg=api.loadConfig(localStorage);
 if(!api.isConfigured(cfg)){allowSync=true;setSyncStatus('');return}
 allowSync=false;setSyncStatus('同步中');
 try{
  const result=await api.fetchRemote(fetch,cfg);
  if(gen!==pullGen)return;
  if(!result.ok){syncFail(result);return}
  if(result.state){
   const prevMode=state.mode,prevMix=state.mix;
   state=api.mergeState(state,result.state);
   withUndo(state);
   for(const id of Object.keys(state.items))state.items[id]=ensureItem(state.items[id]);
   localStorage.setItem(KEY,JSON.stringify(state));
   const changed=api.canonical(state)!==api.canonical(result.state);
   if(wordsReady&&(prevMode!==state.mode||prevMix!==state.mix))next();
   else if(wordsReady)render();
   allowSync=true;
   if(changed)scheduleSync();else setSyncStatus('已同步');
   return;
  }
  setSyncStatus('已同步');
 }catch(e){if(gen===pullGen)syncFail(e)}
 finally{if(gen===pullGen)allowSync=true}
}
function bindSettings(){
 const panel=$('[data-testid=settings]');if(!panel)return;
 const envInput=$('[data-testid=sync-env]');
 const keyInput=$('[data-testid=sync-publishable]');
 const docInput=$('[data-testid=sync-doc-id]');
 const api=()=>syncApi();
 function readForm(){
  const prev=api().loadConfig(localStorage);
  return {
   envId:(envInput.value||prev.envId).trim(),
   publishableKey:keyInput.value.trim()||prev.publishableKey,
   docId:docInput.value.trim()
  };
 }
 const open=()=>{
  const cfg=api().loadConfig(localStorage);
  envInput.value=cfg.envId||'';
  docInput.value=cfg.docId||'';
  keyInput.value='';
  keyInput.placeholder=cfg.publishableKey?'已保存（留空则不修改）':'Publishable Key';
  panel.hidden=false;
 };
 $('[data-testid=settings-open]').onclick=open;
 $('[data-testid=settings-close]').onclick=()=>{panel.hidden=true};
 $('[data-testid=settings-form]').onsubmit=e=>{
  e.preventDefault();
  const cfg=readForm();
  if(!cfg.envId&&!cfg.publishableKey&&!cfg.docId){api().clearConfig(localStorage);setSyncStatus('');panel.hidden=true;return}
  api().saveConfig(localStorage,cfg);
  keyInput.value='';
  panel.hidden=true;
  if(api().isConfigured(api().loadConfig(localStorage)))pullRemote();
  else setSyncStatus('');
 };
 $('[data-testid=sync-clear]').onclick=()=>{
  api().clearConfig(localStorage);
  envInput.value='';keyInput.value='';docInput.value='';
  keyInput.placeholder='Publishable Key';
  setSyncStatus('');panel.hidden=true;
 };
 let creating=false;
 const createBtn=$('[data-testid=sync-create]');
 const createLabel=createBtn?createBtn.textContent:'创建或绑定';
 createBtn.onclick=async(e)=>{
  if(e)e.preventDefault();
  if(creating)return;
  const cfg=readForm();
  if(!api().hasKeys(cfg)){setSyncStatus('请先填写环境 ID 和 Publishable Key');return}
  creating=true;createBtn.disabled=true;createBtn.textContent='创建中…';setSyncStatus('同步中');
  const snap=api().canonical(state);
  try{
   const created=await api().createRemote(fetch,cfg,state);
   if(!created.ok||!created.docId){syncFail(created);return}
   docInput.value=created.docId;
   api().saveConfig(localStorage,{envId:cfg.envId,publishableKey:cfg.publishableKey,docId:created.docId});
   keyInput.value='';
   keyInput.placeholder='已保存（留空则不修改）';
   allowSync=true;
   if(api().canonical(state)!==snap)scheduleSync();else setSyncStatus('已同步');
  }catch(err){syncFail(err)}
  finally{creating=false;createBtn.disabled=false;createBtn.textContent=createLabel}
 };
}
const rec=id=>state.items[id]||(state.items[id]={status:null,seen:0,needed:false});
function rng(){return(window.__ec&&typeof window.__ec.rng==='function')?window.__ec.rng():Math.random()}
/** Weights: weak > reinforce > unseen > dropped(0). Both reinforce & weak resurface. */
function weight(w){const r=state.items[w.id]||{};if(r.status==='dropped')return 0;
 if(r.status==='weak'){let x=6+Math.min(r.seen||0,5)*0.5;if(w.domain!=='life')x+=1;if(w.important_suggest)x+=1;return x}
 if(r.status==='reinforce'){let x=3.5+Math.min(r.seen||0,5)*0.25;if(w.domain!=='life')x+=0.5;return x}
 return 2+(w.important_suggest?0.5:0);}
function pickNext(){return Q().pickNext(WORDS,state,weight,rng,cur&&cur.id)}
function log(action,extra){state.log.push(Object.assign({id:cur&&cur.id,term:cur&&cur.term,action,ts:Date.now(),seen:cur?rec(cur.id).seen:0},extra||{}))}
function undoBtn(){const b=$('[data-testid=undo]');if(!b)return;const n=(state.undo||[]).length;b.disabled=!n;b.setAttribute('aria-disabled',n? 'false':'true');b.textContent=n?`恢复上一个`:`恢复上一个`}
function stats(){const v=Object.values(state.items);const c=s=>v.filter(r=>r.status===s).length;const nNeeded=v.filter(r=>r.needed).length;
 $('#stats').innerHTML=`已放掉 <b data-testid="n-dropped">${c('dropped')}</b> · 再巩固 <b data-testid="n-reinforce">${c('reinforce')}</b> · 还不熟 <b data-testid="n-weak">${c('weak')}</b> · 特别需要 <b data-testid="n-needed">${nNeeded}</b> · 总数 <b data-testid="n-total">${WORDS.length}</b>`;
 const lab={skip_drop:'跳过',reveal:'看释义',drop:'放掉',reinforce:'巩固',weak:'不熟',keep:'再看',needed_on:'特别需要',needed_off:'取消特别需要',undo:'撤销',mix:'混排'};
 $('#history').innerHTML=state.log.slice(-8).reverse().map(l=>`<span>${esc(l.term||'—')} · ${lab[l.action]||esc(l.action)}</span>`).join('');
 undoBtn();}
function paintMix(mix){
 const m=Q().clampMix(mix);
 const pct=Math.round(m*100);
 const fresh=100-pct;
 const range=$('[data-testid=mix]');
 if(range){
  range.value=String(pct);
  range.setAttribute('aria-valuenow',String(pct));
  range.setAttribute('aria-valuetext',`新词 ${fresh}% · 复习 ${pct}%`);
 }
 const lab=$('[data-testid=mix-label]');
 if(lab)lab.textContent=`新词 ${fresh}% · 复习 ${pct}%`;
 const nBtn=$('[data-testid=mode-new]');
 const rBtn=$('[data-testid=mode-review]');
 if(nBtn){const on=m<=0;nBtn.classList.toggle('on',on);nBtn.setAttribute('aria-pressed',on?'true':'false')}
 if(rBtn){const on=m>=1;rBtn.classList.toggle('on',on);rBtn.setAttribute('aria-pressed',on?'true':'false')}
}
function setMix(m){
 const mix=Q().clampMix(m);
 const prev=Q().resolveMix(state);
 if(mix===prev){paintMix(mix);return}
 const prevMode=state.mode;
 state.mix=mix;
 state.mode=Q().modeFromMix(mix);
 const ts=Date.now();
 if(prevMode!==state.mode)state.log.push({action:state.mode==='review'?'mode_review':'mode_all',id:null,term:null,ts,seen:0});
 state.log.push({action:'mix',mix,id:null,term:null,ts,seen:0});
 cur=null;save();next();
}
function setMode(m){if(m==='review')setMix(1);else if(m==='all')setMix(Q().MIX_DEFAULT)}
function next(){cur=pickNext();stage='A';if(cur){state.recent.push(cur.id);state.recent=state.recent.slice(-10);rec(cur.id).seen++;save()}render();}
function pushUndo(entry){withUndo(state);state.undo.push(entry);while(state.undo.length>UNDO_MAX)state.undo.shift()}
/** Terminal actions that advance the queue — push undo snapshot then advance. */
function act(action,status){
 const id=cur.id,term=cur.term,r=rec(id);
 const entry={id,term,prevStatus:r.status??null,prevUpdated:r.updated,action,recentBefore:state.recent.slice(),needed:!!r.needed};
 r.status=status;r.updated=Date.now();log(action);
 const nw=pickNext();let advanced=null;
 if(nw){const existed=!!state.items[nw.id];const prevSeen=existed?(state.items[nw.id].seen||0):0;
  advanced={id:nw.id,prevSeen,existed};state.recent.push(nw.id);state.recent=state.recent.slice(-10);rec(nw.id).seen++}
 entry.advanced=advanced;pushUndo(entry);cur=nw;stage='A';save();render()}
function undo(){
 withUndo(state);if(!state.undo.length)return;
 const entry=state.undo.pop();
 if(entry.advanced){const a=entry.advanced;const ar=state.items[a.id];if(ar){ar.seen=a.prevSeen}}
 state.recent=entry.recentBefore.slice();
 const r=rec(entry.id);r.status=entry.prevStatus;if(entry.prevUpdated!==undefined)r.updated=entry.prevUpdated;else delete r.updated;
 state.log.push({id:entry.id,term:entry.term,action:'undo',ts:Date.now(),seen:r.seen,undone:entry.action});
 cur=WORDS.find(w=>w.id===entry.id)||null;stage='A';save();render()}
function toggleNeeded(){const r=rec(cur.id);r.needed=!r.needed;r.updated=Date.now();log(r.needed?'needed_on':'needed_off');save();render()}
/** 说 = he'd say it; 读写 = recognize it, say something plainer. */
function usageMark(u,testid){
 const id=testid||'usage';
 if(u==='speak')return `<span class="usage usage-speak" data-testid="${id}" title="开口会说">说</span>`;
 if(u==='rw')return `<span class="usage usage-rw" data-testid="${id}" title="读写认得出，开口换个说法">读写</span>`;
 return '';
}
function sayInsteadLine(w){
 if(!w||w.usage!=='rw'||!Array.isArray(w.sayInstead))return '';
 const alts=w.sayInstead.map(s=>String(s||'').trim()).filter(Boolean).slice(0,2);
 if(!alts.length)return '';
 return `<div class="say-instead" data-testid="say-instead"><span class="say-instead-h">想说时用：</span>${esc(alts.join(' / '))}</div>`;
}
function head(){const r=rec(cur.id);const n=r.seen;return `<div class="stage" data-testid="stage">STAGE ${stage}</div><div class="term" data-testid="term" data-id="${cur.id}">${esc(cur.term)}${r.needed?'<span class="needed-dot" data-testid="needed-dot" title="特别需要">★</span>':''}</div>
<div class="meta">${esc(cur.pos)} · <span data-testid="ipa">${esc(cur.ipa)}</span><span class="dom" data-testid="track">${({business:"商务",advanced:"高级",life:"生活"})[cur.track]||cur.domain}</span>${usageMark(cur.usage)}${n>1?`<span class="badge" data-testid="seen-hint">已见过 ${n} 次</span>`:''}</div>`}
function neededBtn(){const on=!!rec(cur.id).needed;return `<button type="button" class="needed-toggle${on?' on':''}" data-testid="needed" aria-pressed="${on?'true':'false'}"><span class="star">${on?'★':'☆'}</span> 特别需要</button>`}
function bindNeeded(){const b=$('[data-testid=needed]');if(b)b.onclick=e=>{e.preventDefault();e.stopPropagation();toggleNeeded()}}
/** Stage B (and Stage A) show at most 5 examples. Shorter lists stay as written. */
const EX_MAX=5;
function exList(list){return (list||[]).slice(0,EX_MAX).map(e=>`<li>${hl(e)}</li>`).join('')}
/** Optional 易混对比: 1–3 vs-notes on Stage B after 释义. Hidden when missing/empty. */
function contrastBlock(w){
 const list=Array.isArray(w&&w.contrast)?w.contrast.filter(c=>c&&c.vs&&String(c.note_zh||'').trim()):[];
 if(!list.length)return '';
 return `<div class="contrast" data-testid="contrast"><div class="contrast-h">易混对比</div><ul data-testid="contrast-list">${list.map(c=>`<li><span class="vs">vs ${esc(c.vs)}</span> — ${esc(c.note_zh)}</li>`).join('')}</ul></div>`}
function closeList(){const p=$('[data-testid=weak-list]');if(p)p.hidden=true}
function openFromList(id){
 closeList();
 const w=WORDS.find(x=>x.id===id);
 if(!w)return;
 if(cur&&cur.id===id){stage='A';render();return}
 cur=w;stage='A';
 state.recent.push(id);state.recent=state.recent.slice(-10);rec(id).seen++;
 save();render();
}
function openList(){
 const p=$('[data-testid=weak-list]');
 const body=$('[data-testid=weak-list-body]');
 if(!p||!body)return;
 const g=Q().listGroups(WORDS,state.items);
 if(!g.weak.length&&!g.reinforce.length){
  body.innerHTML=`<div class="empty-list" data-testid="weak-list-empty">还没有标为「还不熟」或「再巩固」的词。</div>`;
 }else{
  const row=r=>`<button type="button" class="weak-row" data-testid="weak-row" data-id="${esc(r.id)}"><span class="weak-row-term">${esc(r.term)}${usageMark(r.usage,'weak-usage')}${r.needed?'<span class="needed-dot" title="特别需要">★</span>':''}</span><span class="weak-row-gloss">${esc(r.gloss_zh)}</span></button>`;
  let html='';
  if(g.weak.length)html+=`<div class="weak-h" data-testid="weak-group-weak">还不熟</div>${g.weak.map(row).join('')}`;
  if(g.reinforce.length)html+=`<div class="weak-h" data-testid="weak-group-reinforce">再巩固</div>${g.reinforce.map(row).join('')}`;
  body.innerHTML=html;
  body.querySelectorAll('[data-testid=weak-row]').forEach(btn=>{
   btn.onclick=()=>openFromList(btn.getAttribute('data-id'));
  });
 }
 p.hidden=false;
}
function render(){stats();paintMix(state.mix);const app=$('#app');
 if(!cur&&state.mix>=1){app.innerHTML=`<div class="card empty" data-testid="empty-review"><h2>📭 复习队列为空</h2><p>还没有标为「再巩固」或「还不熟」的词。</p><button class="primary" data-testid="back-all">回到全部</button></div>`;
  $('[data-testid=back-all]').onclick=()=>setMode('all');return;}
 if(!cur&&state.mix<=0){app.innerHTML=`<div class="card empty" data-testid="empty-new"><h2>没有新词了</h2><p>未标记的词已经抽完。可以把滑条往「复习」拉，或打开生疏列表。</p><button class="primary" data-testid="go-review">去复习</button></div>`;
  $('[data-testid=go-review]').onclick=()=>setMix(1);return;}
 if(!cur){app.innerHTML=`<div class="card empty" data-testid="empty"><h2>🎉 全部放掉了！</h2><p>队列已空，历史记录仍保留。</p><button class="ghost" data-testid="reset">重新练习全部</button></div>`;
  $('[data-testid=reset]').onclick=()=>{Object.values(state.items).forEach(r=>{if(r.status==='dropped')r.status=null});state.undo=[];state.log.push({id:null,term:null,action:'reset',ts:Date.now(),seen:0});save();next()};return;}
 if(stage==='A'){app.innerHTML=`<div class="card" data-testid="card-a">${head()}<ul data-testid="examples-a">${exList(cur.examples_stage_a)}</ul>
 <div class="actions row2 row"><button class="ghost" data-testid="skip">跳过</button><button class="primary" data-testid="reveal">查看释义</button></div></div>`;
  $('[data-testid=skip]').onclick=()=>act('skip_drop','dropped');
  $('[data-testid=reveal]').onclick=()=>{stage='B';log('reveal');save();render()};
 }else{app.innerHTML=`<div class="card" data-testid="card-b">${head()}<div class="gloss" data-testid="gloss">${esc(cur.gloss_zh)}</div>
 ${sayInsteadLine(cur)}
 ${contrastBlock(cur)}
 <ul data-testid="examples-b">${exList(cur.examples_stage_b)}</ul>
 ${neededBtn()}
 <div class="actions row status-row"><button class="drop" data-testid="drop">先放掉</button><button class="reinforce" data-testid="reinforce">再巩固</button><button class="weak" data-testid="weak">还不熟</button></div></div>`;
  $('[data-testid=drop]').onclick=()=>act('drop','dropped');
  $('[data-testid=reinforce]').onclick=()=>act('reinforce','reinforce');
  $('[data-testid=weak]').onclick=()=>act('weak','weak');
  bindNeeded();}}
function bindMix(){
 const mixEl=$('[data-testid=mix]');
 if(mixEl){
  mixEl.addEventListener('input',()=>paintMix(Number(mixEl.value)/100));
  mixEl.addEventListener('change',()=>setMix(Number(mixEl.value)/100));
 }
 const nBtn=$('[data-testid=mode-new]');if(nBtn)nBtn.onclick=()=>setMix(0);
 const rBtn=$('[data-testid=mode-review]');if(rBtn)rBtn.onclick=()=>setMix(1);
 const openBtn=$('[data-testid=weak-list-open]');if(openBtn)openBtn.onclick=()=>openList();
 const closeBtn=$('[data-testid=weak-list-close]');if(closeBtn)closeBtn.onclick=()=>closeList();
}
load();
const ub=$('[data-testid=undo]');if(ub)ub.onclick=()=>undo();
bindMix();
bindSettings();
pullRemote();
fetch('words.json').then(r=>r.json()).then(w=>{WORDS=w;wordsReady=true;window.__ec={words:WORDS,state:()=>state,weight,pickNext,undo,setMode,setMix,listGroups:()=>Q().listGroups(WORDS,state.items),mergeState:window.ECSync&&window.ECSync.mergeState,get mode(){return state.mode},get mix(){return state.mix},rng:null};next()});
})();
