/* ===== SUPABASE ===== */
let sb=null,CURRENT_UID=null,USER=null,PROFILE=null;
function initSb(){if(!window.supabase||!CONFIG.SUPABASE_URL||CONFIG.SUPABASE_URL.includes('YOUR-'))return null;try{sb=supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_ANON_KEY);}catch(e){sb=null;}return sb;}
let saveTimer=null;
function cloudSave(){if(!sb||!CURRENT_UID)return;clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{try{
  const st=Object.assign({},S);await sb.from('progress').upsert({user_id:CURRENT_UID,state:st,updated_at:new Date().toISOString()});
  await sb.from('profiles').update({last_active:new Date().toISOString(),xp:S.xp,streak:streak(),lessons_done:Object.values(S.done).filter(v=>v>=0).length,days_done:Object.keys(S.done).length,dest_name:S.dest?S.dest.name:null,retention:retention().acc}).eq('id',CURRENT_UID);
  if(pendingEv.length){const rows=pendingEv.splice(0).map(e=>({user_id:CURRENT_UID,ts:new Date(e[0]).toISOString(),item_id:e[1],ok:!!e[2],kind:e[3],ms:e[4],ctx:e[5]}));await sb.from('events').insert(rows);}
  syncState='cloud';paintSync();}catch(e){syncState='local';paintSync();}},600);}
async function cloudLoad(){if(!sb||!CURRENT_UID)return;try{const {data}=await sb.from('progress').select('state').eq('user_id',CURRENT_UID).maybeSingle();
  if(data&&data.state&&(data.state.updatedAt||0)>(S.updatedAt||0)){S=Object.assign(S,data.state);if(!Array.isArray(S.ev))S.ev=[];try{localStorage.setItem(KEY+':'+CURRENT_UID,JSON.stringify(S));}catch(e){}}
  syncState='cloud';}catch(e){syncState='local';}}
function paintSync(){const el=document.getElementById('sync');if(el)el.textContent=syncState==='cloud'?'已同步雲端 · 手機與電腦共用進度':(sb?'離線中，進度先存在此裝置':'尚未連接資料庫，進度只存在此裝置');}
function paintHeader(){const s=document.getElementById('stStreak'),x=document.getElementById('stXp');if(s)s.innerHTML=(streak()>0?'<span class="flame">🔥</span>':'')+streak();if(x)x.textContent=S.xp;}

/* ===== AUTH (email + password; no email server needed) ===== */
function authScreen(msg,mode){currentScreen='auth';mode=mode||'login';
  h(`<div class="auth"><div class="logo">旅途英語<small>NIGHT FLIGHT · 10 MIN A DAY</small></div>
  <section class="card"><h2>${mode==='signup'?'建立帳號':'登入'}</h2><p class="q" style="margin-top:6px">${mode==='signup'?'設一組密碼（至少 6 碼）。進度會跨裝置同步。':'輸入 Email 與密碼。'}</p>
  <input class="input" id="em" type="email" placeholder="you@example.com" style="margin-top:14px" autocomplete="email">
  <input class="input" id="pw" type="password" placeholder="密碼" style="margin-top:10px" autocomplete="${mode==='signup'?'new-password':'current-password'}" onkeydown="if(event.key==='Enter')authGo('${mode}')">
  <div style="margin-top:10px"><button class="btn" id="goBtn" onclick="authGo('${mode}')">${mode==='signup'?'建立並開始':'登入'}</button></div>
  <p class="err" id="authErr" style="margin-top:8px">${msg||''}</p>
  <div class="row" style="margin-top:6px">${mode==='signup'?'<button class="btn quiet" onclick="authScreen(\'\',\'login\')">已有帳號？登入</button>':'<button class="btn quiet" onclick="authScreen(\'\',\'signup\')">還沒有帳號？建立</button><button class="btn quiet" onclick="forgot()">忘記密碼</button>'}</div></section>
  ${!sb?'<p class="tip">（尚未設定資料庫，先以訪客模式試用）</p><button class="btn ghost" onclick="guest()">訪客試用</button>':''}
  </div>`);}
async function authGo(mode){const em=document.getElementById('em').value.trim();const pw=document.getElementById('pw').value;const err=document.getElementById('authErr');
  if(!/^\S+@\S+\.\S+$/.test(em)){err.textContent='請輸入正確的 Email';return;}if(pw.length<6){err.textContent='密碼至少 6 碼';return;}
  document.getElementById('goBtn').disabled=true;err.textContent='';
  const r=mode==='signup'?await sb.auth.signUp({email:em,password:pw}):await sb.auth.signInWithPassword({email:em,password:pw});
  if(r.error){const m=r.error.message||'';err.textContent=/already registered|already exists/i.test(m)?'這個 Email 已有帳號，請直接登入':/Invalid login/i.test(m)?'Email 或密碼錯誤':'失敗：'+m;document.getElementById('goBtn').disabled=false;return;}
  if(!r.data.session){err.textContent='請到信箱確認後再登入';document.getElementById('goBtn').disabled=false;return;}
  await onSignedIn(r.data.session);}
async function forgot(){const em=(document.getElementById('em')||{}).value||'';const err=document.getElementById('authErr');if(!/^\S+@\S+\.\S+$/.test(em.trim())){err.textContent='先在上面填 Email，再按忘記密碼';return;}
  const {error}=await sb.auth.resetPasswordForEmail(em.trim(),{redirectTo:location.href.split('#')[0]});err.textContent=error?'寄送失敗：'+error.message:'重設信已寄出，請到信箱點連結後回來設定新密碼';}
function resetScreen(){currentScreen='reset';h(`<div class="auth"><div class="logo">旅途英語<small>NEW PASSWORD</small></div><section class="card"><h2>設定新密碼</h2><input class="input" id="pw" type="password" placeholder="新密碼（至少 6 碼）" style="margin-top:14px"><div style="margin-top:10px"><button class="btn" onclick="doReset()">儲存</button></div><p class="err" id="authErr"></p></section></div>`);}
async function doReset(){const pw=document.getElementById('pw').value;const err=document.getElementById('authErr');if(pw.length<6){err.textContent='密碼至少 6 碼';return;}const {error}=await sb.auth.updateUser({password:pw});if(error){err.textContent=error.message;return;}const {data}=await sb.auth.getSession();history.replaceState(null,'',location.pathname);await onSignedIn(data.session);}
async function signOut(){if(sb)await sb.auth.signOut();CURRENT_UID=null;USER=null;PROFILE=null;S={day:0,done:{},srs:{},ev:[],xp:0,autoplay:true,sound:true,dest:null,updatedAt:0,v:3};authScreen();}
function guest(){CURRENT_UID='guest';USER=null;loadLocal('guest');rebuildAll();PROFILE=JSON.parse(localStorage.getItem('te-guest-profile')||'null');if(!PROFILE)onboard();else home();}
async function onSignedIn(session){USER=session.user;CURRENT_UID=USER.id;loadLocal(CURRENT_UID);await cloudLoad();rebuildAll();
  try{const {data}=await sb.from('profiles').select('*').eq('id',CURRENT_UID).maybeSingle();PROFILE=data;}catch(e){PROFILE=null;}
  if(!PROFILE||!PROFILE.name){onboard();}else home();}

/* ===== ONBOARDING ===== */
let OB={};
function onboard(step){step=step||0;currentScreen='onboard';
  if(step===0)h(`<div class="auth"><div class="logo">歡迎登機<small>STEP 1 / 3</small></div><section class="card"><h2>怎麼稱呼你？</h2><input class="input" id="obName" placeholder="你的名字或暱稱" style="margin-top:14px" value="${esc(OB.name||'')}"><div style="margin-top:12px"><button class="btn" onclick="OB.name=document.getElementById('obName').value.trim()||'旅人';onboard(1)">下一步</button></div></section></div>`);
  else if(step===1)h(`<div class="auth"><div class="logo">你的起點<small>STEP 2 / 3</small></div><section class="card"><h2>目前英文程度？</h2><div class="opts" style="margin-top:14px">${[['beginner','初級','看得懂簡單句子，開口困難'],['elementary','初中級','會基本對話，旅遊常卡住'],['intermediate','中級','日常溝通可以，想更自然']].map(o=>`<button class="opt" onclick="OB.level='${o[0]}';onboard(2)"><b>${o[1]}</b><div class="q">${o[2]}</div></button>`).join('')}</div></section></div>`);
  else if(step===2)h(`<div class="auth"><div class="logo">目的地<small>STEP 3 / 3</small></div><section class="card"><h2>最近要去哪裡？</h2><p class="q" style="margin-top:6px">可以先跳過，之後在「目的地」分頁設定。</p><div class="chips">${Object.keys(DEST_PACKS).slice(0,12).map(k=>`<button class="chip" onclick="OB.dest='${k}';finishOnboard()">${esc(DEST_PACKS[k].name)}</button>`).join('')}</div><div style="margin-top:14px"><button class="btn ghost" onclick="finishOnboard()">先跳過</button></div></section></div>`);}
async function finishOnboard(){PROFILE={id:CURRENT_UID,name:OB.name||'旅人',level:OB.level||'beginner',email:USER?USER.email:null};
  if(OB.dest){const p=DEST_PACKS[OB.dest];S.dest={slug:OB.dest,name:p.name,tips:p.tips||[],items:destItems(p,OB.dest),createdAt:Date.now()};rebuildAll();}
  if(sb&&USER){try{await sb.from('profiles').upsert({id:CURRENT_UID,email:USER.email,name:PROFILE.name,level:PROFILE.level,created_at:new Date().toISOString(),last_active:new Date().toISOString()});}catch(e){}}
  else localStorage.setItem('te-guest-profile',JSON.stringify(PROFILE));
  save();home();}

/* ===== HOME ===== */
function ring(pct,label,sub){const r=54,c=2*Math.PI*r;return `<div class="ring"><svg viewBox="0 0 132 132"><defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5FB4FF"/><stop offset="1" stop-color="#F5C451"/></linearGradient></defs><circle class="bg" cx="66" cy="66" r="${r}"/><circle class="fg" cx="66" cy="66" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-pct)}"/></svg><div class="lbl"><b>${label}</b><span>${sub}</span></div></div>`;}
function home(){currentScreen='home';paintHeader();const t=todayStr();const doneToday=has(t);
  const li=Math.min(S.day,LESSONS.length-1);const L=LESSONS[li];const due=dueItems().length;const finished=S.day>=LESSONS.length;const P=plan();
  const destN=S.dest?S.dest.items.length:0;const lv=levelOf(S.xp);const lvPct=lv.next?(S.xp-lv.from)/(lv.next-lv.from):1;
  const name=PROFILE?PROFILE.name:'旅人';const hour=new Date().getHours();const greet=hour<11?'早安':hour<18?'午安':'晚安';
  let top;
  const heroHead=`<div class="eyebrow gold">${greet}，${esc(name)}</div>`;
  if(doneToday){top=`<section class="card hero">${heroHead}<div class="herorow">${ring(1,'✓','DONE')}<div><h1 style="margin:0">今天完成了</h1><p class="q" style="margin-top:6px">明天的複習與新課已排好。</p><div class="level" style="margin-top:10px">${esc(lv.name)} · ${S.xp} XP</div></div></div>
    <div style="margin-top:18px" class="row">${S.done[t]>=0?`<button class="btn ghost" onclick="startLesson(${S.done[t]},true)">再練今天的課</button>`:''}${due?`<button class="btn ghost" onclick="startReviewOnly()">複習 ${due} 題</button>`:''}${destN?`<button class="btn coral" onclick="startDestDrill()">目的地衝刺</button>`:''}</div></section>`;}
  else if(P.mode==='consolidate'){top=`<section class="card hero">${heroHead}<div class="eyebrow coral" style="margin-top:8px">系統調整 · 鞏固日</div><h1>今天不學新的，把舊的記牢</h1><p class="q" style="margin-top:10px">${esc(P.reason)}</p>
    <div class="plan"><div><span>到期複習</span><span>${Math.min(due,P.reviewCap)} 題</span></div><div><span>弱點重學</span><span>最常錯的 6 個</span></div><div><span>重測</span><span>6 題</span></div></div>
    <div style="margin-top:18px"><button class="btn coral" onclick="startConsolidate()">開始鞏固訓練</button></div></section>`;}
  else if(finished){top=`<section class="card hero">${heroHead}<h1>全部 56 課完成</h1><p class="q" style="margin-top:10px">只剩複習，保持手感。今天到期 ${due} 題。</p><div style="margin-top:18px" class="row"><button class="btn" onclick="startReviewOnly()" ${due?'':'disabled'}>開始複習</button>${destN?`<button class="btn coral" onclick="startDestDrill()">目的地衝刺</button>`:''}</div></section>`;}
  else{const steps=4+(due?1:0)+(destN?1:0);top=`<section class="card hero">${heroHead}<div class="herorow">${ring(0,String(li+1).padStart(2,'0'),'LESSON')}<div style="flex:1;min-width:0"><h1 style="margin:0;font-size:26px">${esc(L.t)}</h1><div class="level" style="margin-top:10px">${esc(lv.name)}${lv.next?' · 距下一級 '+(lv.next-S.xp)+' XP':''}</div><div class="lvbar"><i style="width:${Math.round(lvPct*100)}%"></i></div></div></div>
    <div class="plan">
      <div><span>情境對話</span><span>先聽一遍</span></div>
      ${due?`<div><span>複習到期的字</span><span>${Math.min(due,P.reviewCap)} 題</span></div>`:''}
      ${destN?`<div><span>目的地加強 · ${esc(S.dest.name)}</span><span>4 題</span></div>`:''}
      <div><span>新單字</span><span>6 個</span></div>
      <div><span>常用句</span><span>3 句</span></div>
      <div><span>小測驗（錯題立刻重考）</span><span>6 題</span></div>
    </div>
    <div style="margin-top:18px"><button class="btn" onclick="startLesson(${li},false)">起飛 · 今天的 10 分鐘</button></div></section>`;}
  h(`${top}
  <div class="grid3"><div class="mini"><b>${Object.keys(S.srs).length}</b><span>已學單字與句子</span></div><div class="mini"><b>${P.acc===null?'—':Math.round(P.acc*100)+'%'}</b><span>7 天記憶率</span></div><div class="mini"><b>${due}</b><span>今日到期</span></div></div>
  ${!S.dest?`<section class="card" style="border-style:dashed;background:transparent;box-shadow:none"><h2>要去哪個國家？</h2><p class="q" style="margin-top:6px">設定目的地後，每天自動加練該國專屬單字與句子。</p><div style="margin-top:12px"><button class="btn ghost" onclick="destScreen()">設定目的地</button></div></section>`:''}
  <section class="card"><h2>航線圖</h2><div class="lessons" style="margin-top:8px">${LESSONS.map((L,i)=>{const st=i<S.day?'done':(i===S.day?'now':'locked');
    return `<button class="lesson ${st}" ${st==='locked'?'disabled':''} onclick="startLesson(${i},true)"><span class="n">${String(i+1).padStart(2,'0')}</span><span class="t">${esc(L.t)}</span><span class="s">${st==='done'?'✓ 完成':st==='now'?'今天':'—'}</span></button>`;}).join('')}</div></section>
  <section class="card"><h2>設定</h2>
    <div class="toggle" style="margin-top:8px"><span>翻到單字時自動朗讀</span><button class="sw ${S.autoplay?'on':''}" onclick="S.autoplay=!S.autoplay;save();home()" aria-label="自動朗讀"><i></i></button></div>
    <div class="toggle"><span>答題音效</span><button class="sw ${S.sound?'on':''}" onclick="S.sound=!S.sound;save();home()" aria-label="音效"><i></i></button></div>
    <div class="toggle"><span>試聽發音</span><button class="speak" style="margin:0" onclick="say('Hello, welcome aboard.')">${SPK} Hello</button></div>
    <div class="toggle"><span>安裝到手機主畫面</span><button class="btn sm ghost" onclick="installScreen()">怎麼裝</button></div>
    <div class="toggle"><span>邀請朋友一起學</span><button class="btn sm ghost" onclick="shareScreen()">分享</button></div>
    <div class="toggle"><span>${USER?esc(USER.email):'訪客模式'}</span><button class="btn sm quiet" onclick="signOut()">登出</button></div>
  </section>
  <p class="sync" id="sync"></p>`,'home');paintSync();}

/* ===== SESSION ===== */
let sess=null;
function startLesson(li,practice){const P=plan();const due=practice?[]:dueItems().slice(0,P.reviewCap);
  sess={li,practice,review:due,words:items(li),wi:0,si:0,prodEarly:P.prodEarly,dest:(!practice&&S.dest)?pickDest(4):[]};stepScene();}
function startReviewOnly(){const P=plan();sess={li:null,practice:true,review:dueItems().slice(0,14),words:[],reviewOnly:true,prodEarly:P.prodEarly};stepReview();}
function startDestDrill(){sess={li:null,practice:true,review:[],words:[],destOnly:true,dest:pickDest(8)};stepDest();}
function pickDest(k){if(!S.dest)return [];const ids=S.dest.items.map(x=>x.id);const t=todayStr();
  return ids.sort((a,b)=>{const ra=S.srs[a],rb=S.srs[b];const da=ra?(ra.due<=t?0:2):1,dbb=rb?(rb.due<=t?0:2):1;if(da!==dbb)return da-dbb;return (ra?ra.n:0)-(rb?rb.n:0);}).slice(0,k);}
function startConsolidate(){const P=plan();const weak=weakest(6).map(x=>x.id);const due=dueItems().slice(0,P.reviewCap);
  sess={li:null,practice:false,consolidate:true,review:due,weak,words:weak.map(id=>ALL[id]),wi:0,si:0,prodEarly:false,dest:[]};stepReview();}
function stepScene(){currentScreen='scene';const L=LESSONS[sess.li];const ss=sess.words.filter(x=>x.type==='s');
  h(`${stepbar('情境對話',0.05)}
  <section class="card"><div class="eyebrow gold">${esc(L.t)}</div><h2 style="margin-top:6px">先聽一遍，不用懂全部</h2>
    <div class="scene">${ss.map((s,i)=>`<div class="line ${i%2?'b':''}"><span class="who">${i%2?'B':'A'}</span><div class="bubble"><b>${esc(s.en)}</b><span>${esc(s.zh)}</span></div></div>`).join('')}</div>
    <button class="speak gold" onclick="playScene()">${SPK} 播放整段</button></section>
  <p class="tip">今天的 6 個單字都藏在這些句子的情境裡</p>
  <button class="btn" onclick="stepReview()">開始</button>`);
  if(S.autoplay)setTimeout(playScene,300);}
function playScene(){if(!('speechSynthesis' in window))return;speechSynthesis.cancel();sess.words.filter(x=>x.type==='s').forEach(s=>{const u=new SpeechSynthesisUtterance(s.en);u.lang='en-US';if(voice)u.voice=voice;u.rate=0.85;speechSynthesis.speak(u);});}
function stepReview(){currentScreen='review';if(!sess.review.length){afterReview();return;}
  const qs=sess.review.map(id=>makeQ(ALL[id],'review',sess.prodEarly));runQuiz('複習',qs,'review',(results)=>{results.forEach(r=>grade(r.id,r.ok));save();sess.reviewResults=results;afterReview();});}
function afterReview(){if(sess.reviewOnly){finish(sess.reviewResults||[],[]);return;}if(sess.dest&&sess.dest.length){stepDest();return;}stepWords();}
function stepDest(){currentScreen='dest-drill';const ids=sess.dest;const fresh=ids.filter(id=>!S.srs[id]);
  const qs=ids.map(id=>makeQ(ALL[id],S.srs[id]?'review':'new',false));
  if(fresh.length&&!sess.destShown){sess.destShown=true;
    h(`${stepbar('目的地加強 · '+S.dest.name,0.2)}<section class="card"><div class="eyebrow coral">${esc(S.dest.name)} 專屬</div>
      ${fresh.slice(0,4).map(id=>{const x=ALL[id];return `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-family:var(--display);font-size:20px;font-weight:700;color:#fff">${esc(x.en)}</b><button class="speak" style="margin:0;padding:6px 12px;font-size:13px" onclick="say('${js(x.en)}')">${SPK}</button></div><div class="q">${esc(x.zh)}${x.ex?' · '+esc(x.ex):''}</div></div>`;}).join('')}
      </section><p class="tip">先看一眼，馬上考</p><button class="btn coral" onclick="stepDest()">開始</button>`);return;}
  runQuiz('目的地 '+S.dest.name,qs,'dest',(results)=>{results.forEach(r=>grade(r.id,r.ok));save();if(sess.destOnly){finish(results,[]);}else{sess.destResults=results;stepWords();}});}
function stepWords(){currentScreen='words';const ws=sess.words.filter(x=>x.type==='w');if(!ws.length){stepSents();return;}const w=ws[sess.wi];const n=ws.length;
  const title=sess.consolidate?'弱點重學':esc(LESSONS[sess.li].t);
  h(`${stepbar((sess.consolidate?'重學 ':'新單字 ')+(sess.wi+1)+'/'+n,(sess.wi+1)/n)}
  <section class="card"><div class="eyebrow gold">${title}</div>
    <div class="word pop">${esc(w.en)}</div><div class="zh">${esc(w.zh)}</div>
    <button class="speak" onclick="say('${js(w.en)}')">${SPK} 聽發音</button>
    ${w.ex?`<div class="ex"><b>${esc(w.ex)}</b>${esc(w.exzh)} <button class="speak plain" style="margin:8px 0 0;padding:6px 12px;font-size:13px" onclick="say('${js(w.ex)}',0.8)">${SPK} 整句</button></div>`:''}
  </section>
  <p class="tip">大聲唸 2 次，想一個畫面把它記住</p>
  <div class="row">${sess.wi>0?`<button class="btn ghost" onclick="sess.wi--;stepWords()">上一個</button>`:''}<button class="btn" onclick="${sess.wi<n-1?'sess.wi++;stepWords()':'stepSents()'}">${sess.wi<n-1?'下一個':(sess.words.some(x=>x.type==='s')?'學句子':'小測驗')}</button></div>`);
  if(S.autoplay)setTimeout(()=>say(w.en),250);}
function stepSents(){currentScreen='sents';const ss=sess.words.filter(x=>x.type==='s');if(!ss.length){stepQuiz();return;}const s=ss[sess.si];const n=ss.length;
  h(`${stepbar('常用句 '+(sess.si+1)+'/'+n,(sess.si+1)/n)}
  <section class="card"><div class="eyebrow gold">先聽，再跟著唸</div>
    <div class="word sent pop">${esc(s.en)}</div><div class="zh hidden-zh" id="zh">${esc(s.zh)}</div>
    <div class="row" style="margin-top:16px"><button class="speak" style="margin:0" onclick="say('${js(s.en)}',0.75)">${SPK} 慢速</button><button class="speak" style="margin:0" onclick="say('${js(s.en)}',1)">${SPK} 正常</button><button class="speak plain" style="margin:0" onclick="document.getElementById('zh').classList.toggle('hidden-zh')">中文</button></div>
  </section>
  <p class="tip">先猜中文意思，再點「中文」核對</p>
  <div class="row">${sess.si>0?`<button class="btn ghost" onclick="sess.si--;stepSents()">上一句</button>`:''}<button class="btn" onclick="${sess.si<n-1?'sess.si++;stepSents()':'stepQuiz()'}">${sess.si<n-1?'下一句':'小測驗'}</button></div>`);
  if(S.autoplay)setTimeout(()=>say(s.en,0.8),250);}
function stepQuiz(){currentScreen='quiz';const pool=shuffle(sess.words).slice(0,6);const ctx=sess.consolidate?'review':'new';
  const qs=pool.map(it=>makeQ(it,ctx,false));
  runQuiz(sess.consolidate?'重測':'小測驗',qs,ctx,(results)=>{const t=todayStr();
    if(sess.consolidate){results.forEach(r=>grade(r.id,r.ok));if(!has(t))S.done[t]=-1;S.xp+=30;save();}
    else if(!sess.practice){sess.words.forEach(it=>{const r=results.find(x=>x.id===it.id);grade(it.id,r?r.ok:true);});if(!has(t)){S.done[t]=sess.li;if(sess.li===S.day)S.day++;S.xp+=50;}save();}
    else{results.forEach(r=>{if(!r.ok)grade(r.id,false);});save();}
    finish([...(sess.reviewResults||[]),...(sess.destResults||[])],results);});}
function finish(rev,quiz){currentScreen='done';const all=[...rev,...quiz];const ok=all.filter(x=>x.ok).length;const wrong=all.filter(x=>!x.ok).map(x=>ALL[x.id]);paintHeader();const lv=levelOf(S.xp);
  const title=sess.reviewOnly?'複習完成':sess.destOnly?'目的地衝刺完成':sess.consolidate?'鞏固訓練完成':'第 '+(sess.li+1)+' 課完成';
  h(`<section class="card hero done" style="text-align:center"><div class="eyebrow gold">${title}</div>
    <div class="big pop" style="margin:14px 0 4px">${ok}<small> / ${all.length}</small></div><div class="q">答對題數 · 🔥 連續 ${streak()} 天 · <span class="xp">${S.xp} XP · ${esc(lv.name)}</span></div>
    ${!sess.practice&&!sess.consolidate?`<div style="margin-top:16px;display:flex;justify-content:center"><div class="stamp got pop" style="width:100px">${stampInner(sess.li)}</div></div><div class="q" style="margin-top:8px">護照多一枚印章</div>`:''}
    ${wrong.length?`<div style="text-align:left;margin-top:20px;border-top:1px solid var(--line);padding-top:12px"><div class="eyebrow">明天會再考這些</div>${wrong.map(w=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)"><b style="font-family:var(--display);font-size:17px;font-weight:500;color:#fff">${esc(w.en)}</b><span style="color:var(--muted)">${esc(w.zh)}</span></div>`).join('')}</div>`:`<p class="q" style="margin-top:16px">全對。答對的字會拉長複習間隔（1→3→7→14→30→60 天）。</p>`}
  </section>
  <div class="row"><button class="btn ghost" onclick="dataScreen()">看數據</button><button class="btn" onclick="home()">回首頁</button></div>`);
  sfx('done');if(!sess.practice)confetti();}

/* ===== DESTINATION ===== */
function findPack(q){q=q.trim().toLowerCase();if(!q)return null;for(const k in DEST_PACKS){if(DEST_PACKS[k].match.some(m=>q===m||q.includes(m)||m.includes(q)))return k;}return null;}
function setDest(slug){const pack=DEST_PACKS[slug];S.dest={slug,name:pack.name,tips:pack.tips||[],items:destItems(pack,slug),createdAt:Date.now()};rebuildAll();save();destScreen();}
function clearDest(){if(S.dest){S.dest.items.forEach(it=>{delete S.srs[it.id];});}S.dest=null;rebuildAll();save();destScreen();}
function destSubmit(){const v=document.getElementById('destIn').value;const k=findPack(v);const g=document.getElementById('gen');if(k)setDest(k);else g.textContent='目前沒有「'+v.trim()+'」的單字包。先從下方 '+Object.keys(DEST_PACKS).length+' 國選最接近的，或告訴我們要新增哪個國家。';}
function destScreen(){currentScreen='dest';
  const cur=S.dest?`<section class="card hero"><div class="eyebrow coral">目前目的地</div><h1>${esc(S.dest.name)}</h1>
    ${S.dest.tips.map(t=>`<p class="q" style="margin-top:8px">${esc(t)}</p>`).join('')}
    <div style="margin-top:14px">${S.dest.items.map(it=>{const st=stageOf(it.id);return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)"><div><b style="font-family:var(--display);font-size:17px;font-weight:500;color:#fff">${esc(it.en)}</b><div class="q">${esc(it.zh)}</div></div><div style="display:flex;gap:8px;align-items:center"><span class="strength" style="width:40px;margin:0;height:6px"><i style="width:${st*100/7}%;background:var(--gold)"></i></span><button class="speak" style="margin:0;padding:6px 10px" onclick="say('${js(it.en)}')">${SPK}</button></div></div>`;}).join('')}</div>
    <div class="row" style="margin-top:16px"><button class="btn coral" onclick="startDestDrill()">現在衝刺 8 題</button><button class="btn quiet" onclick="clearDest()">移除目的地</button></div></section>`:'';
  h(`${cur}
  <section class="card"><h2>${S.dest?'換一個國家':'你最近要去哪裡？'}</h2><p class="q" style="margin-top:6px">輸入國家或城市，或直接點選。設定後每天課程自動加一段「目的地加強」，這些字進入同一套記憶排程。</p>
    <div class="field"><input id="destIn" placeholder="例如：日本、Bali、Italy…" onkeydown="if(event.key==='Enter')destSubmit()"><button class="btn sm" onclick="destSubmit()">設定</button></div>
    <p class="q" id="gen" style="margin-top:8px"></p>
    <div class="chips">${Object.keys(DEST_PACKS).map(k=>`<button class="chip ${S.dest&&S.dest.slug===k?'on':''}" onclick="setDest('${k}')">${esc(DEST_PACKS[k].name)}</button>`).join('')}</div></section>`,'dest');}

/* ===== DATA ===== */
function dataScreen(){currentScreen='data';const P=plan();const R=retention();const ms=avgMs();const days=dayStats(14);const dist=strengthDist();const tot=dist.reduce((a,b)=>a+b,0)||1;const weak=weakest(8);const fc=dueForecast();const maxFc=Math.max(1,...fc.map(x=>x.n));
  const labels=['新學','記過 1 次','記過 2 次','穩定','長期記住'];const cols=['var(--s1)','var(--s2)','var(--s3)','var(--s4)','var(--s5)'];
  h(`<section class="card hero"><div class="eyebrow gold">飛行紀錄</div><h1>你的記憶狀況</h1>
    <div class="grid3" style="margin-top:14px"><div class="mini inner"><b>${R.acc===null?'—':Math.round(R.acc*100)+'%'}</b><span>30 天記憶率</span></div><div class="mini inner"><b>${ms===null?'—':(ms/1000).toFixed(1)+'s'}</b><span>平均反應</span></div><div class="mini inner"><b>${Object.keys(S.done).length}</b><span>學習天數</span></div></div>
    <div class="adjust ${P.mode==='consolidate'?'warn':''}"><b>系統評估</b>：${esc(P.reason)}</div></section>
  <section class="card"><h2>近 14 天正確率</h2><p class="q">每根柱子是一天；紅色代表低於 65%，灰色是沒有作答</p>
    <div class="bars">${days.map(d=>d.acc===null?`<div class="bar empty" style="height:2px" data-t="${d.d.slice(5)} 無作答" tabindex="0"></div>`:`<div class="bar ${d.acc<0.65?'low':''}" style="height:${Math.max(4,Math.round(d.acc*100))}%" data-t="${d.d.slice(5)} ${Math.round(d.acc*100)}% · ${d.n} 題" tabindex="0"></div>`).join('')}</div>
    <div class="axis"><span>${days[0].d.slice(5)}</span><span>今天</span></div></section>
  <section class="card"><h2>記憶強度分布</h2><p class="q">共 ${tot} 個項目；答對一次往右移一格，答錯回到最左</p>
    <div class="strength">${dist.map((n,i)=>n?`<i style="width:${n*100/tot}%;background:${cols[i]}" title="${labels[i]} ${n}"></i>`:'').join('')}</div>
    <div class="legend">${dist.map((n,i)=>`<span><i style="background:${cols[i]}"></i>${labels[i]} ${n}</span>`).join('')}</div></section>
  <section class="card"><h2>未來 7 天到期複習</h2>
    <div class="bars" style="height:70px">${fc.map(x=>`<div class="bar gold" style="height:${Math.max(4,Math.round(x.n/maxFc*100))}%" data-t="${x.d.slice(5)} · ${x.n} 題" tabindex="0"></div>`).join('')}</div>
    <div class="axis"><span>今天</span><span>+6 天</span></div></section>
  <section class="card"><h2>最常錯的字</h2><p class="q">錯誤率 = 答錯次數 ÷ 作答次數；這些會被排進鞏固日</p><div style="margin-top:8px">${weak.length?weak.map(w=>`<div class="weak"><div><b>${esc(ALL[w.id].en)}</b> <span class="q">${esc(ALL[w.id].zh)}</span></div><span class="pct">${Math.round(w.rate*100)}% 錯</span></div>`).join(''):'<p class="q">還沒有足夠資料</p>'}</div></section>
  <section class="card"><h3>記憶法是怎麼運作的</h3><p class="q" style="margin-top:6px">每個字有一個強度等級。答對就把下次出現的時間拉長（1→3→7→14→30→60→120 天），答錯就歸零、明天重考。題型也跟著等級升級：先認得（選擇題）→ 聽得懂（聽力）→ 用得出來（拼字、排句）。答錯的題目在同一輪結束前會立刻重考一次。</p></section>`,'data');}

/* ===== PASSPORT ===== */
function stampInner(li){const L=LESSONS[li];const zh=L.t.split(' ')[0];const en=L.t.split(' ').slice(1).join(' ');return `<span style="font-size:9px;letter-spacing:.1em">${String(li+1).padStart(2,'0')}</span><b>${esc(en)}</b><span style="font-size:10px">${esc(zh)}</span>`;}
function passportScreen(){currentScreen='passport';const got=new Set(Object.values(S.done).filter(v=>v>=0));const dates=Object.keys(S.done).sort();const lv=levelOf(S.xp);
  h(`<section class="card hero"><div class="eyebrow gold">旅途護照 · ${esc(PROFILE?PROFILE.name:'旅人')}</div><h1>${got.size} 枚印章</h1><div class="level" style="margin-top:8px">${esc(lv.name)} · ${S.xp} XP${lv.next?' · 距「'+esc(lv.nextName)+'」還差 '+(lv.next-S.xp):''}</div>
    <div class="stamps">${LESSONS.map((L,i)=>got.has(i)?`<div class="stamp got">${stampInner(i)}</div>`:`<div class="stamp">${String(i+1).padStart(2,'0')}</div>`).join('')}</div></section>
  <section class="card"><h2>飛行日誌</h2><div style="margin-top:8px">${dates.length?dates.slice(-30).reverse().map(d=>`<div class="weak"><span>${d}</span><span class="q">${S.done[d]>=0?'第 '+(S.done[d]+1)+' 課 · '+esc(LESSONS[S.done[d]].t):'鞏固日'}</span></div>`).join(''):'<p class="q">今天起飛第一課吧</p>'}</div></section>`,'passport');}

/* ===== INSTALL ===== */
function installScreen(){currentScreen='install';const ios=/iPhone|iPad/.test(navigator.userAgent);
  h(`<section class="card"><div class="eyebrow gold">安裝到手機</div><h1>像 App 一樣打開</h1><p class="q" style="margin-top:6px">加到主畫面後會全螢幕開啟、有自己的圖示，登入一次後記住。</p>
    <h3 style="margin-top:16px">iPhone（Safari）</h3><ol class="ol"><li>用 Safari 開啟這個網址</li><li>點下方「分享」（方框加箭頭）</li><li>選「加入主畫面」→「新增」</li></ol>
    <h3 style="margin-top:16px">Android（Chrome）</h3><ol class="ol"><li>用 Chrome 開啟網址</li><li>右上角「⋮」→「安裝應用程式」或「加到主畫面」</li></ol>
    <p class="q" style="margin-top:14px">${ios?'你正在 iPhone 上，照上面步驟做即可。':''}</p></section>
  <button class="btn ghost" onclick="home()">回首頁</button>`,'home');}

/* ===== SHARE ===== */
function appUrl(){return location.origin+location.pathname.replace(/[^/]*$/,'');}
function shareScreen(){currentScreen='share';const u=appUrl();
  h(`<section class="card hero" style="text-align:center"><div class="eyebrow gold">邀請朋友</div><h1>掃碼或傳連結</h1><p class="q" style="margin-top:6px">對方打開 → 建立帳號 → 就能每天學。進度各自獨立。</p>
    <div id="qr" style="display:inline-block;background:#fff;padding:12px;border-radius:14px;margin-top:16px"></div>
    <p class="q" style="margin-top:12px;word-break:break-all;font-family:var(--mono);font-size:13px">${esc(u)}</p>
    <div class="row" style="margin-top:14px"><button class="btn" onclick="navigator.share?navigator.share({title:'旅途英語',text:'每天 10 分鐘的旅遊英語',url:'${js(u)}'}):copyUrl()">傳給朋友</button><button class="btn ghost" onclick="copyUrl()">複製連結</button></div>
    <p class="q" id="copied" style="margin-top:8px"></p></section>
  <section class="card"><h3>朋友怎麼裝到手機</h3><p class="q" style="margin-top:6px">iPhone：Safari 開啟連結 → 分享 → 加入主畫面。Android：Chrome 開啟 → ⋮ → 安裝應用程式。</p></section>
  <button class="btn ghost" onclick="home()">回首頁</button>`,'home');
  try{new QRCode(document.getElementById('qr'),{text:u,width:180,height:180,colorDark:'#0B1026',colorLight:'#ffffff'});}catch(e){}}
function copyUrl(){const u=appUrl();(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>{document.getElementById('copied').textContent='已複製連結';},()=>{prompt('複製這個連結',u);});}

/* ===== BOOT ===== */
(async function boot(){stars();rebuildAll();initSb();
  if('serviceWorker' in navigator){try{navigator.serviceWorker.register('./sw.js');}catch(e){}}
  if(!sb){authScreen();return;}
  const {data}=await sb.auth.getSession();
  if(location.hash.includes('type=recovery')){resetScreen();return;}
  if(data&&data.session)await onSignedIn(data.session);else authScreen();
  sb.auth.onAuthStateChange((ev,session)=>{if(ev==='SIGNED_OUT'){CURRENT_UID=null;}if(ev==='PASSWORD_RECOVERY'){resetScreen();}});
})();
