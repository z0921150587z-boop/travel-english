/* ===== STATE ===== */
const KEY='travel-english-v3';
const INTERVALS=[1,3,7,14,30,60,120];
const LEVELS=[[0,'新手旅客'],[300,'背包客'],[900,'探險家'],[2000,'環球旅人'],[4000,'領航員'],[7000,'傳奇旅人']];
let S={day:0,done:{},srs:{},ev:[],xp:0,autoplay:true,sound:true,dest:null,updatedAt:0,v:3};
let syncState='local';let pendingEv=[];
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function addDays(ds,n){const d=new Date(ds+'T00:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function loadLocal(uid){try{const r=localStorage.getItem(KEY+':'+uid);if(r){const o=JSON.parse(r);if(o&&typeof o.day==='number')S=Object.assign(S,o);}}catch(e){}
  if(!Array.isArray(S.ev))S.ev=[];if(typeof S.xp!=='number')S.xp=0;}
function save(){S.updatedAt=Date.now();if(S.ev.length>2500)S.ev=S.ev.slice(-2500);
  try{localStorage.setItem(KEY+':'+(CURRENT_UID||'anon'),JSON.stringify(S));}catch(e){}
  if(typeof cloudSave==='function')cloudSave();}
function levelOf(xp){let cur=LEVELS[0],next=null;for(let i=0;i<LEVELS.length;i++){if(xp>=LEVELS[i][0])cur=LEVELS[i];else{next=LEVELS[i];break;}}return {name:cur[1],from:cur[0],next:next?next[0]:null,nextName:next?next[1]:null};}
function has(d){return S.done[d]!==undefined;}
function streak(){let n=0,d=todayStr();if(!has(d)){d=addDays(d,-1);if(!has(d))return 0;}while(has(d)){n++;d=addDays(d,-1);}return n;}

/* ===== ITEMS ===== */
function items(li){const L=LESSONS[li],out=[];L.w.forEach((w,i)=>out.push({id:li+'w'+i,type:'w',en:w[0],zh:w[1],ex:w[2],exzh:w[3],src:'lesson',li}));L.s.forEach((s,i)=>out.push({id:li+'s'+i,type:'s',en:s[0],zh:s[1],src:'lesson',li}));return out;}
let ALL={};
function rebuildAll(){ALL={};LESSONS.forEach((L,li)=>items(li).forEach(it=>ALL[it.id]=it));if(S.dest&&S.dest.items)S.dest.items.forEach(it=>ALL[it.id]=it);}
function destItems(pack,slug){const out=[];(pack.w||[]).forEach((w,i)=>out.push({id:'d_'+slug+'_w'+i,type:'w',en:w[0],zh:w[1],ex:w[2]||'',exzh:w[3]||'',src:'dest'}));(pack.s||[]).forEach((s,i)=>out.push({id:'d_'+slug+'_s'+i,type:'s',en:s[0],zh:s[1],src:'dest'}));return out;}
function dueItems(){const t=todayStr();return Object.keys(S.srs).filter(id=>S.srs[id].due<=t&&ALL[id]).sort((a,b)=>{const da=ALL[a].src==='dest'?0:1,dbb=ALL[b].src==='dest'?0:1;if(da!==dbb)return da-dbb;return S.srs[a].due<S.srs[b].due?-1:1;});}
function stageOf(id){const r=S.srs[id];return r?r.n:0;}
function grade(id,ok){const r=S.srs[id]||{n:0,due:todayStr(),seen:0,miss:0};r.seen=(r.seen||0)+1;
  if(ok){r.n=Math.min(r.n+1,INTERVALS.length);r.due=addDays(todayStr(),INTERVALS[r.n-1]||1);}else{r.miss=(r.miss||0)+1;r.n=0;r.due=addDays(todayStr(),1);}S.srs[id]=r;}
function logEv(id,ok,kind,ms,ctx){const e=[Date.now(),id,ok?1:0,kind,Math.min(ms,60000),ctx];S.ev.push(e);pendingEv.push(e);}

/* ===== ANALYTICS ===== */
function evSince(days){const from=Date.now()-days*86400000;return S.ev.filter(e=>e[0]>=from);}
function accuracy(evs){if(!evs.length)return null;return evs.filter(e=>e[2]).length/evs.length;}
function retention(){const evs=evSince(30).filter(e=>e[5]==='review');return {acc:accuracy(evs),n:evs.length};}
function avgMs(){const evs=evSince(14);if(!evs.length)return null;return evs.reduce((a,e)=>a+e[4],0)/evs.length;}
function dstr(ts){const dd=new Date(ts);return dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0')+'-'+String(dd.getDate()).padStart(2,'0');}
function dayStats(n){const out=[];for(let i=n-1;i>=0;i--){const d=addDays(todayStr(),-i);const evs=S.ev.filter(e=>dstr(e[0])===d);out.push({d,n:evs.length,acc:accuracy(evs)});}return out;}
function strengthDist(){const c=[0,0,0,0,0];Object.keys(S.srs).forEach(id=>{if(!ALL[id])return;const n=S.srs[id].n;c[n<=0?0:n===1?1:n===2?2:n<=4?3:4]++;});return c;}
function weakest(k){return Object.keys(S.srs).filter(id=>ALL[id]&&(S.srs[id].seen||0)>=2).map(id=>({id,rate:(S.srs[id].miss||0)/(S.srs[id].seen||1),miss:S.srs[id].miss||0})).filter(x=>x.miss>0).sort((a,b)=>b.rate-a.rate||b.miss-a.miss).slice(0,k);}
function dueForecast(){const out=[];for(let i=0;i<7;i++){const d=addDays(todayStr(),i);out.push({d,n:Object.keys(S.srs).filter(id=>ALL[id]&&(i===0?S.srs[id].due<=d:S.srs[id].due===d)).length});}return out;}
function plan(){const r7=evSince(7).filter(e=>e[5]==='review');const acc=accuracy(r7);const st=streak();const due=dueItems().length;
  let mode='normal',reviewCap=8,reason='',prodEarly=false;
  if(r7.length>=15&&acc!==null&&acc<0.65){mode='consolidate';reviewCap=14;reason=`近 7 天複習正確率 ${Math.round(acc*100)}%，低於 65%：今天暫停新課，改做鞏固訓練（複習 + 弱點重學），先把舊的記牢。`;}
  else if(due>=20){reviewCap=14;reason=`到期複習累積 ${due} 題：今天複習加量到 14 題，新課照常。`;}
  else if(r7.length>=15&&acc>=0.9&&st>=3){prodEarly=true;reviewCap=6;reason=`近 7 天正確率 ${Math.round(acc*100)}%、連續 ${st} 天：提早進入拼字與造句題型，複習減到 6 題。`;}
  else if(r7.length<15){reason='資料還不夠（需要 15 題以上的複習紀錄）；目前用標準配置，系統每天會重新評估。';}
  else reason=`近 7 天複習正確率 ${Math.round(acc*100)}%，配置正常：8 題複習 + 一課新內容。`;
  return {mode,reviewCap,reason,prodEarly,acc,n:r7.length};}

/* ===== TTS ===== */
let voice=null;
function pickVoice(){if(!('speechSynthesis' in window))return;const vs=speechSynthesis.getVoices();const pref=['Samantha','Google US English','Microsoft Aria','Microsoft Jenny','Alex','Karen','Daniel'];
  voice=null;for(const p of pref){const v=vs.find(v=>v.name.includes(p));if(v){voice=v;break;}}
  if(!voice)voice=vs.find(v=>v.lang==='en-US')||vs.find(v=>v.lang&&v.lang.startsWith('en'))||null;}
if('speechSynthesis' in window){pickVoice();speechSynthesis.onvoiceschanged=pickVoice;}
function say(t,rate){if(!('speechSynthesis' in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='en-US';if(voice)u.voice=voice;u.rate=rate||0.85;speechSynthesis.speak(u);}
const SPK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

/* ===== SOUND (WebAudio, no files) ===== */
let AC=null;
function tone(f,d,type,gain,when){if(!S.sound)return;try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();const o=AC.createOscillator(),g=AC.createGain();o.type=type||'sine';o.frequency.value=f;g.gain.value=0;o.connect(g);g.connect(AC.destination);const t=AC.currentTime+(when||0);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain||0.12,t+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+d);o.start(t);o.stop(t+d+0.05);}catch(e){}}
function sfx(kind){if(kind==='ok'){tone(660,0.12,'sine',0.1);tone(990,0.18,'sine',0.1,0.09);}else if(kind==='no'){tone(200,0.25,'triangle',0.12);}else if(kind==='done'){[523,659,784,1047].forEach((f,i)=>tone(f,0.35,'sine',0.1,i*0.12));}else if(kind==='tap'){tone(880,0.05,'sine',0.05);}}

/* ===== STARS + CONFETTI ===== */
function stars(){const c=document.getElementById('stars');if(!c)return;const ctx=c.getContext('2d');const dpr=Math.min(2,window.devicePixelRatio||1);let pts=[];
  function size(){c.width=innerWidth*dpr;c.height=innerHeight*dpr;pts=[];for(let i=0;i<90;i++)pts.push({x:Math.random()*c.width,y:Math.random()*c.height*0.7,r:(Math.random()*1.4+0.4)*dpr,p:Math.random()*6.28,s:Math.random()*0.02+0.005});}
  size();addEventListener('resize',size);
  const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  function draw(t){ctx.clearRect(0,0,c.width,c.height);pts.forEach(p=>{const a=reduce?0.7:0.45+0.45*Math.sin(t*p.s+p.p);ctx.globalAlpha=a;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.28);ctx.fill();});ctx.globalAlpha=1;if(!reduce)requestAnimationFrame(draw);}
  draw(0);}
function confetti(){if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;let c=document.getElementById('confetti');if(!c){c=document.createElement('canvas');c.id='confetti';document.body.appendChild(c);}
  const ctx=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;const cols=['#F5C451','#FF7A59','#5FB4FF','#3DD68C','#FFFFFF'];
  const ps=Array.from({length:120},()=>({x:innerWidth/2+(Math.random()-0.5)*120,y:innerHeight*0.35,vx:(Math.random()-0.5)*14,vy:-Math.random()*14-4,g:0.35,r:Math.random()*6+3,c:cols[Math.floor(Math.random()*cols.length)],a:Math.random()*6.28,va:(Math.random()-0.5)*0.3}));
  let f=0;function step(){ctx.clearRect(0,0,c.width,c.height);ps.forEach(p=>{p.vy+=p.g;p.x+=p.vx;p.y+=p.vy;p.vx*=0.99;p.a+=p.va;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.fillStyle=p.c;ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r*0.6);ctx.restore();});if(++f<110)requestAnimationFrame(step);else ctx.clearRect(0,0,c.width,c.height);}
  step();setTimeout(()=>{f=999;ctx.clearRect(0,0,c.width,c.height);c.remove();},3500);}

/* ===== UI helpers ===== */
const view=document.getElementById('view');
let currentScreen='home';
function h(html,tab){view.innerHTML=html;window.scrollTo({top:0});document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.dataset.tab===tab));const tb=document.getElementById('tabs');if(tb)tb.style.display=tab?'':'none';}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}
function js(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function norm(s){return s.toLowerCase().replace(/[^a-z0-9' ]/g,' ').replace(/\s+/g,' ').trim();}
function stepbar(label,frac){return `<div class="stepbar"><span class="eyebrow">${label}</span><div class="progress"><i style="width:${Math.round(frac*100)}%"></i></div><button class="btn quiet" style="width:auto;padding:4px 8px" onclick="home()">離開</button></div>`;}

/* ===== QUESTION BUILDER ===== */
function makeQ(it,ctx,prodEarly,force){const pool=Object.values(ALL).filter(x=>x.type===it.type&&x.id!==it.id);const d=shuffle(pool).slice(0,3);
  let n=stageOf(it.id);if(prodEarly)n+=1;let kind;
  if(ctx==='new')kind=it.type==='w'?['en2zh','zh2en','listen'][Math.floor(Math.random()*3)]:['listen','en2zh'][Math.floor(Math.random()*2)];
  else if(n<=1)kind=Math.random()<0.5?'en2zh':'zh2en';else if(n===2)kind='listen';else kind=it.type==='w'?'type':'build';
  if(force)kind=force;
  const base={id:it.id,kind,item:it};
  if(kind==='zh2en')return Object.assign(base,{prompt:it.zh,answer:it.en,opts:shuffle([it.en,...d.map(x=>x.en)]),optEn:true});
  if(kind==='listen')return Object.assign(base,{answer:it.zh,opts:shuffle([it.zh,...d.map(x=>x.zh)]),optEn:false,speak:it.en});
  if(kind==='type')return Object.assign(base,{prompt:it.zh,answer:it.en,speak:it.en});
  if(kind==='build'){const words=it.en.split(' ');return Object.assign(base,{prompt:it.zh,answer:it.en,words,bank:shuffle(words.map((w,i)=>({w,i}))),speak:it.en});}
  return Object.assign(base,{prompt:it.en,answer:it.zh,opts:shuffle([it.zh,...d.map(x=>x.zh)]),optEn:false,speak:it.en});}

function runQuiz(label,qs,ctx,onDone){let i=0;const results=[];const retry=[];let t0=Date.now();
  const finishQ=(q,ok)=>{const ms=Date.now()-t0;const first=!q.isRetry;
    if(first){results.push({id:q.id,ok});logEv(q.id,ok,q.kind,ms,ctx);if(!ok)retry.push(Object.assign(makeQ(q.item,ctx,false,q.kind==='type'||q.kind==='build'?q.kind:'zh2en'),{isRetry:true}));}
    if(ok)S.xp+=first?(q.kind==='type'||q.kind==='build'?15:10):5;sfx(ok?'ok':'no');paintHeader();};
  const render=()=>{const q=qs[i];const n=qs.length;t0=Date.now();
    const head=q.kind==='listen'?`<div class="q">聽一聽，選出意思</div><button class="speak gold" style="margin:6px 0 16px;font-size:18px;padding:12px 20px" onclick="say('${js(q.speak)}',0.85)">${SPK} 播放</button>`
      :q.kind==='zh2en'?`<div class="q">這句英文怎麼說？</div><div class="qword zhq">${esc(q.prompt)}</div>`
      :q.kind==='type'?`<div class="q">拼出英文${q.isRetry?'（再試一次）':''}</div><div class="qword zhq">${esc(q.prompt)}</div>`
      :q.kind==='build'?`<div class="q">把單字排成正確的句子</div><div class="qword zhq" style="font-size:22px">${esc(q.prompt)}</div>`
      :`<div class="q">這是什麼意思？</div><div class="qword">${esc(q.prompt)}</div>`;
    let body='';
    if(q.kind==='type')body=`<input class="typein" id="ti" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="輸入英文…"><div class="row" style="margin-top:10px"><button class="btn sm ghost" onclick="say('${js(q.speak)}',0.8)">${SPK} 提示：聽發音</button><button class="btn sm" id="chk">確認</button></div>`;
    else if(q.kind==='build')body=`<div class="tiles" id="ans"></div><div class="tiles bank" id="bank" style="margin-top:10px">${q.bank.map((b,k)=>`<button class="tile" data-k="${k}">${esc(b.w)}</button>`).join('')}</div><div class="row" style="margin-top:10px"><button class="btn sm ghost" id="undo">退回一個</button><button class="btn sm" id="chk">確認</button></div>`;
    else body=`<div class="opts">${q.opts.map((o,k)=>`<button class="opt ${q.optEn?'en':''}" data-k="${k}">${esc(o)}</button>`).join('')}</div>`;
    h(`${stepbar(label+' '+(i+1)+'/'+n,i/n)}
    <section class="card">${q.isRetry?'<div class="eyebrow coral">錯題重考</div>':''}${head}${body}<div class="feedback" id="fb" style="margin-top:14px"></div></section>
    <div class="dots">${qs.map((x,k)=>`<i class="${k<i?(x.res?'ok':'no'):k===i?'on':''}"></i>`).join('')}</div>`);
    if(q.kind==='listen')setTimeout(()=>say(q.speak,0.85),200);
    const settle=(ok)=>{q.res=ok;finishQ(q,ok);const fb=document.getElementById('fb');fb.className='feedback '+(ok?'ok':'no');
      fb.innerHTML=`<span>${ok?'正確！+'+(q.isRetry?5:(q.kind==='type'||q.kind==='build'?15:10))+' XP':'答案：'+esc(q.answer)}</span><button class="btn sm" id="next">${i<n-1?'下一題':'完成'}</button>`;
      if(q.kind!=='listen')say(q.item.en,0.9);
      document.getElementById('next').onclick=()=>{i++;if(i<n)render();else if(retry.length){qs.push(...retry.splice(0));render();}else onDone(results);};
      document.getElementById('next').focus();};
    if(q.kind==='type'){const ti=document.getElementById('ti');ti.focus();const go=()=>{if(ti.disabled)return;const ok=norm(ti.value)===norm(q.answer);ti.disabled=true;ti.classList.add(ok?'right':'wrong');if(!ok)ti.value=ti.value+'  →  '+q.answer;settle(ok);};document.getElementById('chk').onclick=go;ti.onkeydown=e=>{if(e.key==='Enter')go();};}
    else if(q.kind==='build'){const ans=document.getElementById('ans');const picked=[];const bank=document.getElementById('bank');
      bank.querySelectorAll('.tile').forEach(b=>b.onclick=()=>{sfx('tap');b.classList.add('used');picked.push(+b.dataset.k);const t=document.createElement('button');t.className='tile';t.textContent=q.bank[+b.dataset.k].w;t.onclick=()=>{t.remove();picked.splice(picked.indexOf(+b.dataset.k),1);b.classList.remove('used');};ans.appendChild(t);});
      document.getElementById('undo').onclick=()=>{const last=ans.lastElementChild;if(last)last.click();};
      document.getElementById('chk').onclick=()=>{if(ans.dataset.done)return;ans.dataset.done=1;const got=picked.map(k=>q.bank[k].w).join(' ');const ok=norm(got)===norm(q.answer);ans.style.borderColor=ok?'var(--good)':'var(--bad)';ans.style.background=ok?'var(--good-soft)':'var(--bad-soft)';bank.querySelectorAll('.tile').forEach(x=>x.disabled=true);ans.querySelectorAll('.tile').forEach(x=>x.disabled=true);settle(ok);};}
    else view.querySelectorAll('.opt').forEach(b=>b.addEventListener('click',()=>{const ok=q.opts[+b.dataset.k]===q.answer;
      view.querySelectorAll('.opt').forEach(x=>{x.disabled=true;if(q.opts[+x.dataset.k]===q.answer)x.classList.add('right');});if(!ok)b.classList.add('wrong');settle(ok);}));};
  render();}
