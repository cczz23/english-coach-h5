(function(){
const KEY='ec_state_v4',V3='ec_state_v3',V2='ec_state_v2',V1='ec_state_v1';
const UNDO_MAX=5;
let WORDS=[],state,cur=null,stage='A';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hl=s=>esc(s).replace(/\[\[(.+?)\]\]/g,'<mark>$1</mark>');
const blank=()=>({v:4,mode:'all',items:{},recent:[],log:[],undo:[]});
function ensureItem(r){const o={status:r.status??null,seen:r.seen||0,needed:!!r.needed};if(r.updated!=null)o.updated=r.updated;if(r.important!==undefined)o.important=r.important;return o}
function withUndo(s){if(!Array.isArray(s.undo))s.undo=[];if(s.mode!=='review'&&s.mode!=='all')s.mode='all';return s}
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
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
const rec=id=>state.items[id]||(state.items[id]={status:null,seen:0,needed:false});
/** Weights: weak > reinforce > unseen > dropped(0). Both reinforce & weak resurface. */
function weight(w){const r=state.items[w.id]||{};if(r.status==='dropped')return 0;
 if(r.status==='weak'){let x=6+Math.min(r.seen||0,5)*0.5;if(w.domain!=='life')x+=1;if(w.important_suggest)x+=1;return x}
 if(r.status==='reinforce'){let x=3.5+Math.min(r.seen||0,5)*0.25;if(w.domain!=='life')x+=0.5;return x}
 return 2+(w.important_suggest?0.5:0);}
function pickNext(){
 const rv=state.mode==='review';const pool=WORDS.filter(w=>{if(weight(w)<=0)return false;if(!rv)return true;const st=(state.items[w.id]||{}).status;return st==='weak'||st==='reinforce'});if(!pool.length)return null;
 const k=Math.min(4,pool.length-1);const recent=k>0?state.recent.slice(-k):[];
 let cand=pool.filter(w=>!recent.includes(w.id));if(!cand.length)cand=pool;
 if(cand.length>1&&cur){const c2=cand.filter(w=>w.id!==cur.id);if(c2.length)cand=c2}
 const tot=cand.reduce((a,w)=>a+weight(w),0);let x=Math.random()*tot;
 for(const w of cand){x-=weight(w);if(x<0)return w}return cand[cand.length-1];}
function log(action,extra){state.log.push(Object.assign({id:cur&&cur.id,term:cur&&cur.term,action,ts:Date.now(),seen:cur?rec(cur.id).seen:0},extra||{}))}
function undoBtn(){const b=$('[data-testid=undo]');if(!b)return;const n=(state.undo||[]).length;b.disabled=!n;b.setAttribute('aria-disabled',n? 'false':'true');b.textContent=n?`恢复上一个`:`恢复上一个`}
function stats(){const v=Object.values(state.items);const c=s=>v.filter(r=>r.status===s).length;const nNeeded=v.filter(r=>r.needed).length;
 $('#stats').innerHTML=`已放掉 <b data-testid="n-dropped">${c('dropped')}</b> · 再巩固 <b data-testid="n-reinforce">${c('reinforce')}</b> · 还不熟 <b data-testid="n-weak">${c('weak')}</b> · 特别需要 <b data-testid="n-needed">${nNeeded}</b> · 总数 <b data-testid="n-total">${WORDS.length}</b>`;
 const lab={skip_drop:'跳过',reveal:'看释义',drop:'放掉',reinforce:'巩固',weak:'不熟',keep:'再看',needed_on:'特别需要',needed_off:'取消特别需要',undo:'撤销'};
 $('#history').innerHTML=state.log.slice(-8).reverse().map(l=>`<span>${esc(l.term||'—')} · ${lab[l.action]||esc(l.action)}</span>`).join('');
 undoBtn();}
function next(){cur=pickNext();stage='A';if(cur){state.recent.push(cur.id);state.recent=state.recent.slice(-10);rec(cur.id).seen++;save()}render();}
function modeBtns(){for(const m of ['all','review']){const b=$(`[data-testid=mode-${m}]`);if(!b)continue;const on=state.mode===m;b.setAttribute('aria-pressed',on?'true':'false');b.classList.toggle('on',on)}}
function setMode(m){if(m!=='all'&&m!=='review')return;if(state.mode===m){modeBtns();return}state.mode=m;cur=null;
 state.log.push({action:'mode_'+m,id:null,term:null,ts:Date.now(),seen:0});save();next()}
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
function head(){const r=rec(cur.id);const n=r.seen;return `<div class="stage" data-testid="stage">STAGE ${stage}</div><div class="term" data-testid="term" data-id="${cur.id}">${esc(cur.term)}${r.needed?'<span class="needed-dot" data-testid="needed-dot" title="特别需要">★</span>':''}</div>
<div class="meta">${esc(cur.pos)} · <span data-testid="ipa">${esc(cur.ipa)}</span><span class="dom" data-testid="track">${({business:"商务",advanced:"高级",life:"生活"})[cur.track]||cur.domain}</span>${n>1?`<span class="badge" data-testid="seen-hint">已见过 ${n} 次</span>`:''}</div>`}
function neededBtn(){const on=!!rec(cur.id).needed;return `<button type="button" class="needed-toggle${on?' on':''}" data-testid="needed" aria-pressed="${on?'true':'false'}"><span class="star">${on?'★':'☆'}</span> 特别需要</button>`}
function bindNeeded(){const b=$('[data-testid=needed]');if(b)b.onclick=e=>{e.preventDefault();e.stopPropagation();toggleNeeded()}}
function render(){stats();modeBtns();const app=$('#app');
 if(!cur&&state.mode==='review'){app.innerHTML=`<div class="card empty" data-testid="empty-review"><h2>📭 复习队列为空</h2><p>还没有标为「再巩固」或「还不熟」的词。</p><button class="primary" data-testid="back-all">回到全部</button></div>`;
  $('[data-testid=back-all]').onclick=()=>setMode('all');return;}
 if(!cur){app.innerHTML=`<div class="card empty" data-testid="empty"><h2>🎉 全部放掉了！</h2><p>队列已空，历史记录仍保留。</p><button class="ghost" data-testid="reset">重新练习全部</button></div>`;
  $('[data-testid=reset]').onclick=()=>{Object.values(state.items).forEach(r=>{if(r.status==='dropped')r.status=null});state.undo=[];state.log.push({id:null,term:null,action:'reset',ts:Date.now(),seen:0});save();next()};return;}
 if(stage==='A'){app.innerHTML=`<div class="card" data-testid="card-a">${head()}<ul data-testid="examples-a">${cur.examples_stage_a.map(e=>`<li>${hl(e)}</li>`).join('')}</ul>
 <div class="actions row2 row"><button class="ghost" data-testid="skip">跳过</button><button class="primary" data-testid="reveal">查看释义</button></div></div>`;
  $('[data-testid=skip]').onclick=()=>act('skip_drop','dropped');
  $('[data-testid=reveal]').onclick=()=>{stage='B';log('reveal');save();render()};
 }else{app.innerHTML=`<div class="card" data-testid="card-b">${head()}<div class="gloss" data-testid="gloss">${esc(cur.gloss_zh)}</div>
 <ul data-testid="examples-b">${cur.examples_stage_b.map(e=>`<li>${hl(e)}</li>`).join('')}</ul>
 ${neededBtn()}
 <div class="actions row status-row"><button class="drop" data-testid="drop">先放掉</button><button class="reinforce" data-testid="reinforce">再巩固</button><button class="weak" data-testid="weak">还不熟</button></div></div>`;
  $('[data-testid=drop]').onclick=()=>act('drop','dropped');
  $('[data-testid=reinforce]').onclick=()=>act('reinforce','reinforce');
  $('[data-testid=weak]').onclick=()=>act('weak','weak');
  bindNeeded();}}
load();
const ub=$('[data-testid=undo]');if(ub)ub.onclick=()=>undo();
for(const m of ['all','review']){const b=$(`[data-testid=mode-${m}]`);if(b)b.onclick=()=>setMode(m)}
fetch('words.json').then(r=>r.json()).then(w=>{WORDS=w;window.__ec={words:WORDS,state:()=>state,weight,pickNext,undo,setMode,get mode(){return state.mode}};next()});
})();
