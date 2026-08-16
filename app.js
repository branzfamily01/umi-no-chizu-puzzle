(() => {
  'use strict';

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const DATA = window.GEO_DATA;
  const THEME = window.APP_THEME || {rewardEmoji:'🐚',celebrateEmoji:['✨','🫧','⭐','🐚','💫'],resultCreatures:['🐬']};
  if(THEME.colors){ Object.entries(THEME.colors).forEach(([k,v])=>document.documentElement.style.setProperty('--theme-'+k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),v)); }
  const STORAGE_KEY = 'umi-no-chizu-puzzle-v1';

  const state = {
    category: 'mountains',
    mode: 'shape',
    difficulty: 'normal',
    learnIndex: 0,
    queue: [],
    qIndex: 0,
    sessionCorrect: 0,
    sessionWrong: 0,
    sessionShells: 0,
    completedIds: new Set(),
    currentHadWrong: false,
    hintShown: false,
    nearPlayed: false,
    reviewMode: false,
  };

  const defaultProgress = () => ({
    shells: 0,
    totalCorrect: 0,
    dailyDate: new Date().toISOString().slice(0,10),
    dailyCorrect: 0,
    items: {},
    settings: { sound: true, voice: true, volume: 0.7 }
  });

  let progress = loadProgress();
  function loadProgress(){
    try{
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      const p = Object.assign(defaultProgress(), raw || {});
      p.settings = Object.assign(defaultProgress().settings, p.settings || {});
      const today = new Date().toISOString().slice(0,10);
      if(p.dailyDate !== today){ p.dailyDate = today; p.dailyCorrect = 0; }
      return p;
    }catch{ return defaultProgress(); }
  }
  function saveProgress(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); updateHome(); }

  class SoundEngine {
    constructor(){ this.ctx=null; }
    ensure(){
      if(!progress.settings.sound) return null;
      if(!this.ctx){
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if(Ctx) this.ctx = new Ctx();
      }
      if(this.ctx?.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    tone(freq=440, dur=.08, type='sine', vol=.12, delay=0){
      const ctx=this.ensure(); if(!ctx) return;
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.type=type; o.frequency.value=freq;
      const now=ctx.currentTime+delay;
      const gain=Math.max(.001, vol*(progress.settings.volume ?? .7));
      g.gain.setValueAtTime(.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now+.012);
      g.gain.exponentialRampToValueAtTime(.0001, now+dur);
      o.connect(g); g.connect(ctx.destination); o.start(now); o.stop(now+dur+.03);
    }
    click(){ this.tone(680,.045,'sine',.05); }
    pickup(){ this.tone(360,.055,'triangle',.06); this.tone(520,.07,'sine',.035,.035); }
    near(){ this.tone(820,.05,'sine',.035); this.tone(980,.05,'sine',.025,.055); }
    snap(){
      this.tone(180,.055,'triangle',.12);
      this.tone(520,.09,'sine',.09,.045);
      this.tone(780,.13,'sine',.07,.09);
    }
    correct(){
      [659,784,988].forEach((f,i)=>this.tone(f,.16,'sine',.075,i*.07));
      this.tone(1318,.22,'triangle',.045,.23);
    }
    wrong(){ this.tone(210,.12,'sawtooth',.06); this.tone(160,.16,'triangle',.055,.1); }
    clear(){ [523,659,784,1046,1318].forEach((f,i)=>this.tone(f,.19,'sine',.075,i*.075)); }
    bubble(){ this.tone(950,.055,'sine',.035); this.tone(1250,.07,'sine',.025,.04); }
  }
  const sound = new SoundEngine();

  function speak(text){
    if(!progress.settings.voice || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    u.lang='ja-JP'; u.rate=.88; u.pitch=1.08; u.volume=Math.max(.15, progress.settings.volume ?? .7);
    const voices=speechSynthesis.getVoices();
    const ja=voices.find(v=>/^ja/i.test(v.lang)); if(ja) u.voice=ja;
    speechSynthesis.speak(u);
  }

  const screens = {
    home: $('#homeScreen'), mode: $('#modeScreen'), game: $('#gameScreen')
  };
  function showScreen(name){
    Object.values(screens).forEach(s=>s.classList.remove('active'));
    screens[name].classList.add('active');
    window.scrollTo(0,0);
  }

  function categoryLabel(cat){ return cat==='mountains' ? '山地・山脈' : '川'; }
  function modeLabel(mode){ return ({learn:'学習モード',shape:'形パズル',label:'名前札パズル',test:'テスト'})[mode]; }

  function updateHome(){
    $('#shellCount').textContent = progress.shells;
    $('#shellCount2').textContent = progress.shells;
    $('#progressLabel').textContent = `${progress.dailyCorrect}問 正解`;
    $('#progressFill').style.width = `${Math.min(100, progress.dailyCorrect*10)}%`;
    const weak = getWeakItems();
    $('#reviewSub').textContent = weak.length ? `${weak.length}こ の苦手があるよ` : 'いまは苦手なし！';
    $('#todayText').textContent = weak.length ? `苦手を${Math.min(3,weak.length)}問だけ復習しよう！` : 'まずは3問だけやってみよう！';
  }

  function getItemStats(id){ return progress.items[id] || {attempts:0, correct:0, wrong:0, streak:0}; }
  function getWeakItems(){
    return [...DATA.mountains,...DATA.rivers].filter(i=>{
      const s=getItemStats(i.id); return s.wrong>0 && (s.correct/(s.attempts||1) < .85 || s.streak<2);
    }).sort((a,b)=>{
      const A=getItemStats(a.id),B=getItemStats(b.id); return (B.wrong-B.streak)-(A.wrong-A.streak);
    });
  }

  function chooseCategory(cat){
    sound.click(); state.category=cat; state.reviewMode=false;
    $('#modeCategorySmall').textContent=categoryLabel(cat);
    $('#modeIntroText').textContent = cat==='mountains'
      ? '山のつらなりを、県境を手がかりに覚えよう。'
      : '川がどこを流れるか、地図の形といっしょに覚えよう。';
    showScreen('mode');
  }

  $$('.big-action[data-category]').forEach(b=>b.addEventListener('click',()=>chooseCategory(b.dataset.category)));
  $('#reviewBtn').addEventListener('click',()=>{
    sound.click();
    const weak=getWeakItems();
    if(!weak.length){ toast('いまは苦手なし！すごい 🌟','correct'); return; }
    state.reviewMode=true; state.mode='test'; state.queue=shuffle(weak).slice(0,Math.min(7,weak.length));
    startPreparedGame();
  });

  $$('[data-back]').forEach(b=>b.addEventListener('click',()=>{
    sound.click(); const to=b.dataset.back; showScreen(to); if(to!=='game') stopSpeech();
  }));

  $$('.mode-card').forEach(b=>b.addEventListener('click',()=>{
    sound.click(); state.mode=b.dataset.mode; state.reviewMode=false; startGame();
  }));
  $$('#difficultyControl button').forEach(b=>b.addEventListener('click',()=>{
    sound.click(); state.difficulty=b.dataset.level;
    $$('#difficultyControl button').forEach(x=>x.classList.toggle('active',x===b));
  }));

  function startGame(){
    state.completedIds=new Set(); state.sessionCorrect=0; state.sessionWrong=0; state.sessionShells=0; state.qIndex=0; state.currentHadWrong=false; state.hintShown=false;
    const all=[...DATA[state.category]];
    if(state.mode==='learn'){
      state.queue=all; state.learnIndex=0; showScreen('game'); configureGameChrome(); renderLearn(); return;
    }
    const weakFirst=all.filter(i=>getItemStats(i.id).wrong>0);
    const rest=all.filter(i=>!weakFirst.includes(i));
    state.queue=[...shuffle(weakFirst),...shuffle(rest)].slice(0,Math.min(5,all.length));
    startPreparedGame();
  }
  function startPreparedGame(){
    state.completedIds=new Set(); state.sessionCorrect=0; state.sessionWrong=0; state.sessionShells=0; state.qIndex=0; state.currentHadWrong=false; state.hintShown=false;
    showScreen('game'); configureGameChrome(); renderQuestion();
  }

  function configureGameChrome(){
    $('#gameModeLabel').textContent=state.reviewMode?'にがて復習':modeLabel(state.mode);
    $('#gameCategoryLabel').textContent=state.reviewMode?'山地・川 ミックス':categoryLabel(state.category);
    $('#scoreNow').textContent='0'; $('#scoreTotal').textContent=state.mode==='learn'?state.queue.length:state.queue.length;
    const learn=state.mode==='learn';
    $('#learnPanel').hidden=!learn; $('#puzzleTray').hidden=learn;
    $('#hintBtn').style.display=learn?'none':'';
    $('#promptCard').style.display=learn?'none':'';
  }

  function currentItem(){ return state.queue[state.mode==='learn'?state.learnIndex:state.qIndex]; }

  const mountainPaths = [
    'M5 48 Q20 18 34 44 Q47 9 62 43 Q78 16 94 46 L94 56 L5 56 Z',
    'M3 52 Q18 35 28 46 Q40 14 54 48 Q66 22 78 43 Q88 32 98 50 L98 58 L3 58 Z',
    'M2 50 Q16 20 32 45 Q48 30 59 11 Q71 30 82 40 Q91 29 99 50 L99 58 L2 58 Z',
    'M4 54 Q16 40 25 18 Q35 42 46 30 Q58 6 70 38 Q82 25 97 52 L97 58 L4 58 Z'
  ];
  const riverPaths = [
    'M15 5 C45 10 20 27 50 31 S86 43 72 56',
    'M20 5 C10 18 44 19 38 33 S61 41 84 56',
    'M65 4 C40 13 76 24 45 31 S22 42 35 57',
    'M12 8 C36 6 25 26 55 28 S76 35 87 53',
    'M78 5 C52 14 70 25 42 33 S24 46 16 56'
  ];
  function shapeSvg(item, forPiece=false){
    if(isRiver(item)){
      const d=riverPaths[item.pattern%riverPaths.length];
      return `<svg viewBox="0 0 100 62" aria-hidden="true"><path class="river-halo" d="${d}"/><path class="river-path" d="${d}"/></svg>`;
    }
    const d=mountainPaths[item.pattern%mountainPaths.length];
    return `<svg viewBox="0 0 100 62" aria-hidden="true"><path class="mountain-path" d="${d}"/></svg>`;
  }
  function isRiver(item){ return DATA.rivers.some(x=>x.id===item.id); }

  function renderOverlay(opts={}){
    const layer=$('#overlayLayer'); layer.innerHTML='';
    const active=currentItem();
    const items=state.reviewMode?[...DATA.mountains,...DATA.rivers]:DATA[state.category];
    items.forEach(item=>{
      const completed=state.completedIds.has(item.id);
      const activeItem=active?.id===item.id;
      let visible=completed;
      if(state.mode==='learn'&&activeItem) visible=true;
      if(state.mode!=='learn'&&activeItem&&state.difficulty==='easy') visible=true;
      if(activeItem&&state.hintShown&&state.difficulty!=='hard') visible=true;
      if(!visible && !completed && !activeItem) return;
      const mark=document.createElement('div');
      mark.className=`geo-mark ${isRiver(item)?'river':'mountain'} ${visible?'visible':''} ${completed?'completed':''} ${activeItem&&state.hintShown?'active-hint':''}`;
      mark.style.left=`${item.x}%`; mark.style.top=`${item.y}%`; mark.style.rotate=`${item.rot||0}deg`;
      mark.innerHTML=shapeSvg(item)+(visible&&state.mode==='learn'?`<span class="geo-label">${item.name}</span>`:'');
      layer.appendChild(mark);
    });
  }

  function renderLearn(){
    const item=currentItem(); if(!item) return;
    $('#learnRegion').textContent=item.region; $('#learnName').textContent=item.name; $('#learnKana').textContent=item.kana; $('#learnNote').textContent=item.note;
    $('#learnIndex').textContent=`${state.learnIndex+1} / ${state.queue.length}`;
    $('#scoreNow').textContent=state.learnIndex+1;
    renderOverlay();
    setTimeout(()=>speak(item.kana),180);
  }
  $('#learnPrev').addEventListener('click',()=>{ sound.click(); state.learnIndex=(state.learnIndex-1+state.queue.length)%state.queue.length; renderLearn(); });
  $('#learnNext').addEventListener('click',()=>{ sound.bubble(); state.learnIndex=(state.learnIndex+1)%state.queue.length; renderLearn(); });
  $('#learnSpeak').addEventListener('click',()=>{ sound.click(); speak(currentItem().kana); });

  function renderQuestion(){
    if(state.qIndex>=state.queue.length){ finishSession(); return; }
    state.currentHadWrong=false; state.hintShown=false; state.nearPlayed=false; tapArmed=null;
    const item=currentItem();
    $('#scoreNow').textContent=state.sessionCorrect;
    $('#promptKicker').textContent = state.mode==='test' ? '問題' : state.mode==='label' ? '名前を正しい場所へ' : 'このパーツを地図へはめよう';
    $('#promptName').textContent=item.name; $('#promptKana').textContent=item.kana;
    $('#hintBtn').textContent = state.difficulty==='hard' ? '💡 文字ヒント' : '💡 ヒント';
    $('#hintBtn').disabled=false;
    renderOverlay(); renderPiece(item);
    if(state.mode==='test') setTimeout(()=>speak(`${item.kana}を おいてください`),120);
  }

  function renderPiece(item){
    const labelOnly=state.mode==='label'||state.mode==='test';
    const host=$('#pieceHost');
    host.innerHTML=`<div class="puzzle-piece ${labelOnly?'label-only':''}" id="activePiece" role="button" aria-label="${item.name}を地図へドラッグ">
      <div class="piece-shape">${shapeSvg(item,true)}</div>
      <div class="piece-text"><b>${item.name}</b><small>${item.kana}</small></div>
    </div>`;
    const piece=$('#activePiece');
    piece.addEventListener('pointerdown',startDrag,{passive:false});
  }

  let drag=null;
  let tapArmed=null;
  function startDrag(e){
    e.preventDefault(); sound.pickup();
    const original=e.currentTarget, item=currentItem();
    const ghost=original.cloneNode(true); ghost.removeAttribute('id'); ghost.classList.add('drag-ghost'); document.body.appendChild(ghost);
    drag={ghost,item,lastNear:false,startX:e.clientX,startY:e.clientY,moved:false}; moveGhost(e.clientX,e.clientY);
    document.addEventListener('pointermove',dragMove,{passive:false});
    document.addEventListener('pointerup',dragEnd,{once:true});
    document.addEventListener('pointercancel',dragEnd,{once:true});
  }
  function moveGhost(x,y){ if(!drag) return; drag.ghost.style.left=`${x}px`; drag.ghost.style.top=`${y}px`; }
  function dragMove(e){
    e.preventDefault(); if(!drag) return; moveGhost(e.clientX,e.clientY);
    if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>8) drag.moved=true;
    const pos=pointOnMap(e.clientX,e.clientY); const near=pos&&distanceTo(drag.item,pos.x,pos.y)<10;
    drag.ghost.classList.toggle('near-target',!!near);
    if(near&&!drag.lastNear){ sound.near(); state.nearPlayed=true; }
    drag.lastNear=!!near;
  }
  function dragEnd(e){
    document.removeEventListener('pointermove',dragMove);
    if(!drag) return;
    const pos=pointOnMap(e.clientX,e.clientY); const item=drag.item; const moved=drag.moved; drag.ghost.remove(); drag=null;
    if(!moved && !pos){
      tapArmed=item; const piece=$('#activePiece'); if(piece) piece.classList.add('armed');
      toast('地図の場所をタップしてね'); sound.bubble(); return;
    }
    const tol=state.difficulty==='easy'?10:state.difficulty==='hard'?6.5:8;
    if(pos && distanceTo(item,pos.x,pos.y)<=tol) handleCorrect(item,e.clientX,e.clientY); else handleWrong(item);
  }
  function pointOnMap(cx,cy){
    const r=$('#mapWrap').getBoundingClientRect();
    if(cx<r.left||cx>r.right||cy<r.top||cy>r.bottom) return null;
    return {x:(cx-r.left)/r.width*100,y:(cy-r.top)/r.height*100};
  }
  function distanceTo(item,x,y){
    const dx=x-item.x, dy=(y-item.y)*.82; return Math.sqrt(dx*dx+dy*dy);
  }

  function handleCorrect(item,cx,cy){
    sound.snap(); setTimeout(()=>sound.correct(),90); sparkle(cx,cy);
    state.completedIds.add(item.id); state.sessionCorrect++;
    const earned=state.currentHadWrong?1:2; state.sessionShells+=earned; progress.shells+=earned; progress.totalCorrect++; progress.dailyCorrect++;
    const s=getItemStats(item.id); s.attempts++; s.correct++; s.streak=(s.streak||0)+1; s.last=Date.now(); progress.items[item.id]=s; saveProgress();
    renderOverlay(); toast(`カチッ！ ${item.name} せいかい！ +${earned}${THEME.rewardEmoji}`,'correct');
    setTimeout(()=>speak(item.kana),220);
    setTimeout(()=>{ state.qIndex++; renderQuestion(); },950);
  }
  function handleWrong(item){
    sound.wrong(); state.sessionWrong++; state.currentHadWrong=true;
    const s=getItemStats(item.id); s.attempts++; s.wrong++; s.streak=0; s.last=Date.now(); progress.items[item.id]=s; saveProgress();
    toast('おしい！ もう一度やってみよう','wrong');
    if(state.difficulty==='easy'){ state.hintShown=true; renderOverlay(); }
  }


  $('#mapWrap').addEventListener('pointerdown',e=>{
    if(!tapArmed || drag) return;
    e.preventDefault();
    const pos=pointOnMap(e.clientX,e.clientY), item=tapArmed; tapArmed=null;
    const piece=$('#activePiece'); if(piece) piece.classList.remove('armed');
    const tol=state.difficulty==='easy'?10:state.difficulty==='hard'?6.5:8;
    if(pos && distanceTo(item,pos.x,pos.y)<=tol) handleCorrect(item,e.clientX,e.clientY); else handleWrong(item);
  });

  $('#skipBtn').addEventListener('click',()=>{ sound.click(); const item=state.queue.splice(state.qIndex,1)[0]; state.queue.push(item); renderQuestion(); });
  $('#speakBtn').addEventListener('click',()=>{ sound.click(); const i=currentItem(); if(i) speak(i.kana); });
  $('#hintBtn').addEventListener('click',()=>{
    sound.bubble(); const i=currentItem(); if(!i)return;
    state.hintShown=true;
    if(state.difficulty==='hard') toast(i.hint); else { toast(i.hint); renderOverlay(); }
  });

  function finishSession(){
    sound.clear();
    const total=state.queue.length, acc=state.sessionCorrect/Math.max(1,state.sessionCorrect+state.sessionWrong);
    $('#resultTitle').textContent=acc>.85?'すごい！海の名人！':acc>.65?'やったね！':'よくがんばった！';
    $('.result-creature').textContent=THEME.resultCreatures[Math.floor(Math.random()*THEME.resultCreatures.length)];
    $('#resultText').textContent=`${total}問チャレンジしたよ`;
    $('#resultCorrect').textContent=state.sessionCorrect; $('#resultShells').textContent=`+${state.sessionShells}`;
    $('#resultStars').textContent=acc>.9?'⭐⭐⭐':acc>.65?'⭐⭐☆':'⭐☆☆';
    $('#resultDialog').showModal();
  }
  $('#againBtn').addEventListener('click',()=>{ sound.click(); $('#resultDialog').close(); if(state.reviewMode){ state.queue=shuffle(getWeakItems()).slice(0,7); startPreparedGame(); } else startGame(); });
  $('#homeBtnFromResult').addEventListener('click',()=>{ sound.click(); $('#resultDialog').close(); showScreen('home'); });

  function toast(msg,type=''){
    const t=$('#toast'); t.textContent=msg; t.className=`toast show ${type}`; clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.className='toast',1500);
  }
  function sparkle(cx=innerWidth/2,cy=innerHeight/2){
    const host=$('#celebrate'); const chars=THEME.celebrateEmoji;
    for(let i=0;i<12;i++){
      const s=document.createElement('span'); s.className='spark'; s.textContent=chars[i%chars.length]; s.style.left=`${cx}px`; s.style.top=`${cy}px`; s.style.setProperty('--dx',`${(Math.random()-.5)*220}px`); s.style.setProperty('--dy',`${-50-Math.random()*210}px`); host.appendChild(s); setTimeout(()=>s.remove(),1000);
    }
  }
  function shuffle(a){ return [...a].sort(()=>Math.random()-.5); }
  function stopSpeech(){ if('speechSynthesis'in window) speechSynthesis.cancel(); }

  /* settings */
  $('#settingsBtn').addEventListener('click',()=>{
    sound.click(); $('#soundToggle').checked=progress.settings.sound; $('#voiceToggle').checked=progress.settings.voice; $('#volumeRange').value=progress.settings.volume; $('#settingsDialog').showModal();
  });
  $('#closeSettings').addEventListener('click',()=>$('#settingsDialog').close());
  $('#soundToggle').addEventListener('change',e=>{ progress.settings.sound=e.target.checked; saveProgress(); if(e.target.checked)sound.click(); });
  $('#voiceToggle').addEventListener('change',e=>{ progress.settings.voice=e.target.checked; saveProgress(); if(e.target.checked)speak('読み上げをオンにしました'); });
  $('#volumeRange').addEventListener('input',e=>{ progress.settings.volume=+e.target.value; saveProgress(); });
  $('#resetProgress').addEventListener('click',()=>{
    if(confirm('貝がら・正解数・苦手記録を全部リセットしますか？')){ progress=defaultProgress(); saveProgress(); $('#settingsDialog').close(); toast('学習記録をリセットしました'); }
  });

  // Prevent accidental double tap zoom on puzzle controls while keeping map readable.
  let lastTouch=0; document.addEventListener('touchend',e=>{ const n=Date.now(); if(n-lastTouch<300 && e.target.closest('.puzzle-piece,.mode-card,.big-action')) e.preventDefault(); lastTouch=n; },{passive:false});

  // PWA
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  updateHome();
})();
