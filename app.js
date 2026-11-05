(function(){
const KEY='ec_state_v3',V2='ec_state_v2',V1='ec_state_v1';
let WORDS=[],state,cur=null,stage='A';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hl=s=>esc(s).replace(/\[\[(.+?)\]\]/g,'<mark>$1</mark>');
const blank=()=>({v:3,items:{},recent:[],log:[]});
/** v1 → v3: mastered→dropped; shaky/unknown→weak (safer: treat as shortfall). */
function migrateV1(){let o;try{o=JSON.parse(localStorage.getItem(V1))}catch(e){}if(!o||!o.marks)return null;
 const s=blank();for(const[id,r]of Object.entries(o.marks)){const st=r.status==='mastered'?'dropped':(r.status==='shaky'||r.status==='unknown')?'weak':null;s.items[id]={status:st,seen:r.seen||0,important:r.important??null}}
 s.log=(o.log||[]).map(l=>({id:l.id,term:l.t,action:'v1_'+l.s,ts:l.ts||null,seen:(o.marks[l.id]||{}).seen||0,migrated:true}));
 s.migratedFrom='v1';s.migratedAt=Date.now();s.migratedKeepTo='weak';return s;}
/**
 * v2 → v3: old keep → weak (safer default: ambiguous "还要再看" treated as shortfall).
 * Log entries keep historical action tags (incl. "keep"); only items.status is remapped.
 */
function migrateV2(){let o;try{o=JSON.parse(localStorage.getItem(V2))}catch(e){}if(!o||!o.items)return null;
 const s={v:3,items:{},recent:o.recent||[],log:Array.isArray(o.log)?o.log.slice():[]};
 for(const[id,r]of Object.entries(o.items)){const st=r.status==='keep'?'weak':r.status;s.items[id]={...r,status:st}}
 s.migratedFrom=o.migratedFrom?o.migratedFrom+'+v2':'v2';s.migratedAt=Date.now();s.migratedKeepTo='weak';
 if(o.migratedAt)s.prevMigratedAt=o.migratedAt;return s;}
function load(){try{state=JSON.parse(localStorage.getItem(KEY))}catch(e){}
 if(state&&state.items&&state.v===3)return;
 state=migrateV2()||migrateV1()||blank();save()}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
const rec=id=>state.items[id]||(state.items[id]={status:null,seen:0});
/** Weights: weak > reinforce > unseen > dropped(0). Both reinforce & weak resurface. */
function weight(w){const r=state.items[w.id]||{};if(r.status==='dropped')return 0;
 if(r.status==='weak'){let x=6+Math.min(r.seen||0,5)*0.5;if(w.domain!=='life')x+=1;if(w.important_suggest)x+=1;return x}
 if(r.status==='reinforce'){let x=3.5+Math.min(r.seen||0,5)*0.25;if(w.domain!=='life')x+=0.5;return x}
 return 2+(w.important_suggest?0.5:0);}
function pickNext(){
 const pool=WORDS.filter(w=>weight(w)>0);if(!pool.length)return null;
 const k=Math.min(4,pool.length-1);const recent=k>0?state.recent.slice(-k):[];
 let cand=pool.filter(w=>!recent.includes(w.id));if(!cand.length)cand=pool;
 if(cand.length>1&&cur){const c2=cand.filter(w=>w.id!==cur.id);if(c2.length)cand=c2}
 const tot=cand.reduce((a,w)=>a+weight(w),0);let x=Math.random()*tot;
 for(const w of cand){x-=weight(w);if(x<0)return w}return cand[cand.length-1];}
function log(action){state.log.push({id:cur.id,term:cur.term,action,ts:Date.now(),seen:rec(cur.id).seen})}
function stats(){const v=Object.values(state.items);const c=s=>v.filter(r=>r.status===s).length;
 $('#stats').innerHTML=`已放掉 <b data-testid="n-dropped">${c('dropped')}</b> · 再巩固 <b data-testid="n-reinforce">${c('reinforce')}</b> · 还不熟 <b data-testid="n-weak">${c('weak')}</b> · 总数 <b data-testid="n-total">${WORDS.length}</b>`;
 const lab={skip_drop:'跳过',reveal:'看释义',drop:'放掉',reinforce:'巩固',weak:'不熟',keep:'再看'};
 $('#history').innerHTML=state.log.slice(-8).reverse().map(l=>`<span>${esc(l.term)} · ${lab[l.action]||esc(l.action)}</span>`).join('');}
function next(){cur=pickNext();stage='A';if(cur){state.recent.push(cur.id);state.recent=state.recent.slice(-10);rec(cur.id).seen++;save()}render();}
function act(action,status){const r=rec(cur.id);r.status=status;r.updated=Date.now();log(action);save();next();}
function head(){const n=rec(cur.id).seen;return `<div class="stage" data-testid="stage">STAGE ${stage}</div><div class="term" data-testid="term" data-id="${cur.id}">${esc(cur.term)}</div>
<div class="meta">${esc(cur.pos)} · <span data-testid="ipa">${esc(cur.ipa)}</span><span class="dom" data-testid="track">${({business:"商务",advanced:"高级",life:"生活"})[cur.track]||cur.domain}</span>${n>1?`<span class="badge" data-testid="seen-hint">已见过 ${n} 次</span>`:''}</div>`}
function render(){stats();const app=$('#app');
 if(!cur){app.innerHTML=`<div class="card empty" data-testid="empty"><h2>🎉 全部放掉了！</h2><p>队列已空，历史记录仍保留。</p><button class="ghost" data-testid="reset">重新练习全部</button></div>`;
  $('[data-testid=reset]').onclick=()=>{Object.values(state.items).forEach(r=>{if(r.status==='dropped')r.status=null});state.log.push({id:null,term:null,action:'reset',ts:Date.now(),seen:0});save();next()};return;}
 if(stage==='A'){app.innerHTML=`<div class="card" data-testid="card-a">${head()}<ul data-testid="examples-a">${cur.examples_stage_a.map(e=>`<li>${hl(e)}</li>`).join('')}</ul>
 <div class="actions row2 row"><button class="ghost" data-testid="skip">跳过</button><button class="primary" data-testid="reveal">查看释义</button></div></div>`;
  $('[data-testid=skip]').onclick=()=>act('skip_drop','dropped');
  $('[data-testid=reveal]').onclick=()=>{stage='B';log('reveal');save();render()};
 }else{app.innerHTML=`<div class="card" data-testid="card-b">${head()}<div class="gloss" data-testid="gloss">${esc(cur.gloss_zh)}</div>
 <ul data-testid="examples-b">${cur.examples_stage_b.map(e=>`<li>${hl(e)}</li>`).join('')}</ul>
 <div class="actions row"><button class="drop" data-testid="drop">先放掉</button><button class="reinforce" data-testid="reinforce">再巩固</button><button class="weak" data-testid="weak">还不熟</button></div></div>`;
  $('[data-testid=drop]').onclick=()=>act('drop','dropped');
  $('[data-testid=reinforce]').onclick=()=>act('reinforce','reinforce');
  $('[data-testid=weak]').onclick=()=>act('weak','weak');}}
load();
fetch('words.json').then(r=>r.json()).then(w=>{WORDS=w;window.__ec={words:WORDS,state:()=>state,weight,pickNext};next()});
})();
