(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const DATA=window.GEO_DATA;
  const THEME=window.APP_THEME||{rewardEmoji:'🐚',celebrateEmoji:['✨','🫧','⭐'],resultCreatures:['🐬','🦦','🐧']};
  const STORAGE_KEY='umi-no-chizu-puzzle-v2';
  const STAGE_TEXT={
    1:['形を見ながら置こう','正しい形が見えるよ。まずは重ねて場所を覚えよう。','形に重ねて覚えよう'],
    2:['うっすら形ヒント','正解の形はうっすらだけ。思い出しながら置こう。','うっすら形ヒント'],
    3:['地域ヒントだけ','正解の形は消えたよ。黄色い地域の中から探そう。','この地域のどこ？'],
    4:['文字ヒントだけ','地図には正解位置を出さないよ。県境とヒントで考えよう。','県境だけで考えよう'],
    5:['完全テスト','正解位置も地域も表示しないよ。自力で置こう！','ヒントなし！']
  };
  const state={category:'mountains',mode:'learn',queue:[],qIndex:0,sessionCorrect:0,sessionWrong:0,sessionShells:0,currentHadWrong:false,hintUsed:false,stageOverride:null,reviewMode:false,readPhase:'identify',tapArmed:null};
  const defaultProgress=()=>({shells:0,totalCorrect:0,dailyDate:new Date().toISOString().slice(0,10),dailyCorrect:0,items:{},settings:{sound:true,voice:true,volume:.7}});
  let progress=loadProgress();
  function loadProgress(){try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');const p=Object.assign(defaultProgress(),raw||{});p.settings=Object.assign(defaultProgress().settings,p.settings||{});const today=new Date().toISOString().slice(0,10);if(p.dailyDate!==today){p.dailyDate=today;p.dailyCorrect=0;}return p;}catch{return defaultProgress();}}
  function saveProgress(){localStorage.setItem(STORAGE_KEY,JSON.stringify(progress));updateHome();}
  function stats(id){return progress.items[id]||{attempts:0,correct:0,wrong:0,streak:0,mastery:0};}
  function setStats(id,s){progress.items[id]=s;saveProgress();}

  class SoundEngine{constructor(){this.ctx=null;}ensure(){if(!progress.settings.sound)return null;if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(C)this.ctx=new C();}if(this.ctx?.state==='suspended')this.ctx.resume();return this.ctx;}tone(freq=440,dur=.08,type='sine',vol=.1,delay=0){const c=this.ensure();if(!c)return;const o=c.createOscillator(),g=c.createGain(),now=c.currentTime+delay;o.type=type;o.frequency.value=freq;const gain=Math.max(.001,vol*(progress.settings.volume??.7));g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(gain,now+.012);g.gain.exponentialRampToValueAtTime(.0001,now+dur);o.connect(g);g.connect(c.destination);o.start(now);o.stop(now+dur+.03);}click(){this.tone(680,.045,'sine',.05);}pickup(){this.tone(360,.055,'triangle',.06);this.tone(520,.07,'sine',.035,.035);}near(){this.tone(820,.05,'sine',.035);this.tone(980,.05,'sine',.025,.055);}snap(){this.tone(180,.055,'triangle',.13);this.tone(540,.09,'sine',.1,.04);this.tone(820,.14,'sine',.075,.085);}correct(){[659,784,988].forEach((f,i)=>this.tone(f,.15,'sine',.075,i*.065));this.tone(1318,.2,'triangle',.05,.22);}wrong(){this.tone(210,.12,'sawtooth',.05);this.tone(160,.16,'triangle',.045,.1);}clear(){[523,659,784,1046,1318].forEach((f,i)=>this.tone(f,.18,'sine',.07,i*.07));}bubble(){this.tone(960,.05,'sine',.035);this.tone(1260,.07,'sine',.025,.04);}}
  const sound=new SoundEngine();
  function speak(text){if(!progress.settings.voice||!('speechSynthesis'in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ja-JP';u.rate=.88;u.pitch=1.08;u.volume=Math.max(.15,progress.settings.volume??.7);const ja=speechSynthesis.getVoices().find(v=>/^ja/i.test(v.lang));if(ja)u.voice=ja;speechSynthesis.speak(u);}
  function stopSpeech(){if('speechSynthesis'in window)speechSynthesis.cancel();}

  const screens={home:$('#homeScreen'),mode:$('#modeScreen'),game:$('#gameScreen')};
  function showScreen(name){Object.values(screens).forEach(s=>s.classList.remove('active'));screens[name].classList.add('active');window.scrollTo(0,0);}
  function categoryLabel(c){return c==='mountains'?'山地・山脈':'川';}
  function modeLabel(m){return({learn:'おぼえる',challenge:'ちょうせん',master:'マスターテスト',read:'よみとく',review:'にがて復習'})[m]||m;}
  function isRiver(item){return DATA.rivers.some(x=>x.id===item.id);}
  function allItems(){return [...DATA.mountains,...DATA.rivers];}
  function weakItems(){return allItems().filter(i=>{const s=stats(i.id);return s.wrong>0||s.mastery<2;}).sort((a,b)=>(stats(a.id).mastery-stats(b.id).mastery)||(stats(b.id).wrong-stats(a.id).wrong));}
  function updateHome(){
    $('#shellCount').textContent=progress.shells;$('#shellCount2').textContent=progress.shells;$('#progressLabel').textContent=`${progress.dailyCorrect}問 正解`;$('#progressFill').style.width=`${Math.min(100,progress.dailyCorrect*10)}%`;
    const weak=weakItems();$('#reviewSub').textContent=weak.length?`${weak.length}こ を重点復習`:'いまは苦手なし！';$('#todayText').textContent=weak.length?`苦手を${Math.min(3,weak.length)}問だけ復習しよう！`:'まずは3問だけ覚えよう！';
  }

  function chooseCategory(cat){sound.click();state.category=cat;state.reviewMode=false;$('#modeCategorySmall').textContent=categoryLabel(cat);showScreen('mode');}
  $$('.big-action[data-category]').forEach(b=>b.addEventListener('click',()=>chooseCategory(b.dataset.category)));
  $('#reviewBtn').addEventListener('click',()=>{sound.click();const weak=weakItems();if(!weak.length){toast('いまは苦手なし！ 🌟','correct');return;}state.reviewMode=true;state.mode='review';state.queue=shuffle(weak).slice(0,Math.min(7,weak.length));startPreparedGame();});
  $$('[data-back]').forEach(b=>b.addEventListener('click',()=>{sound.click();showScreen(b.dataset.back);stopSpeech();}));
  $$('.mode-card').forEach(b=>b.addEventListener('click',()=>{sound.click();state.mode=b.dataset.mode;state.reviewMode=false;startGame();}));

  function startGame(){const all=[...DATA[state.category]];const sorted=[...all].sort((a,b)=>stats(a.id).mastery-stats(b.id).mastery||Math.random()-.5);state.queue=(state.mode==='master'?shuffle(all):sorted).slice(0,Math.min(6,all.length));startPreparedGame();}
  function startPreparedGame(){state.qIndex=0;state.sessionCorrect=0;state.sessionWrong=0;state.sessionShells=0;state.currentHadWrong=false;state.hintUsed=false;state.stageOverride=null;state.readPhase='identify';state.tapArmed=null;showScreen('game');configureGameChrome();renderQuestion();}
  function configureGameChrome(){
    $('#gameModeLabel').textContent=state.reviewMode?'にがて復習':modeLabel(state.mode);$('#gameCategoryLabel').textContent=state.reviewMode?'山地・川 ミックス':categoryLabel(state.category);$('#scoreNow').textContent='0';$('#scoreTotal').textContent=state.queue.length;
  }
  function currentItem(){return state.queue[state.qIndex];}
  function baseStage(item){const m=stats(item.id).mastery||0;if(state.mode==='master')return 5;if(state.mode==='challenge')return Math.min(5,Math.max(3,m+2));if(state.mode==='review')return Math.min(4,Math.max(2,m+1));if(state.mode==='read')return Math.min(4,Math.max(3,m+1));return Math.min(4,Math.max(1,m+1));}
  function stageFor(item){return state.stageOverride??baseStage(item);}
  function stars(n){return '★'.repeat(Math.min(5,n))+'☆'.repeat(Math.max(0,5-n));}

  function redact(text,item){let t=text;[item.name,item.kana].forEach(x=>{if(x)t=t.split(x).join('この地形');});return t;}
  function renderQuestion(){
    if(state.qIndex>=state.queue.length){finishSession();return;}
    state.currentHadWrong=false;state.hintUsed=false;state.stageOverride=null;state.readPhase=state.mode==='read'?'identify':'place';state.tapArmed=null;
    const item=currentItem(), st=stageFor(item), s=stats(item.id);
    $('#scoreNow').textContent=state.sessionCorrect;$('#promptName').textContent=item.name;$('#promptKana').textContent=item.kana;$('#masteryPill').textContent=stars(s.mastery||0);$('#promptKicker').textContent=STAGE_TEXT[st][0];$('#scaffoldText').textContent=STAGE_TEXT[st][1];$('#mapCaption').textContent=STAGE_TEXT[st][2];$('#hintBtn').disabled=st===1;$('#hintBtn').textContent=st===1?'💡 これが正解位置':'💡 ヒントを1段';
    renderKnowledge(item);renderOverlay(item,st);renderPiece(item);
    const reading=state.mode==='read'&&state.readPhase==='identify';$('#readPanel').hidden=!reading;$('#puzzleTray').hidden=reading;$('#mapZone').style.opacity=reading?.42:1;$('#promptCard').style.display=reading?'none':'grid';$('#knowledgeCard').style.display=state.mode==='read'?'none':'block';
    if(reading){renderOverlay(item,5);renderReadQuestion(item);}
    else if(state.mode==='master')setTimeout(()=>speak(`${item.kana}を おいてください`),120);
    else setTimeout(()=>speak(item.kana),120);
  }
  function renderKnowledge(item){
    $('#factList').innerHTML=item.facts.map(f=>`<li>${escapeHtml(f)}</li>`).join('');$('#examText').textContent=item.exam[0]||'';const has=!!item.history;$('#historyBox').hidden=!has;$('#historyText').textContent=item.history||'';
  }
  function renderReadQuestion(item){
    const clues=[item.hint,item.facts[0],item.facts[1]].filter(Boolean).slice(0,3).map(x=>redact(x,item));$('#readClues').innerHTML=clues.map((c,i)=>`<div class="clue"><b>ヒント${i+1}</b>　${escapeHtml(c)}</div>`).join('');$('#examTip').textContent=item.exam[0]||'';
    const pool=(isRiver(item)?DATA.rivers:DATA.mountains).filter(x=>x.id!==item.id);const choices=shuffle([item,...shuffle(pool).slice(0,3)]);$('#readChoices').innerHTML=choices.map(c=>`<button class="choice-btn" data-id="${c.id}">${c.name}</button>`).join('');
    $$('#readChoices .choice-btn').forEach(b=>b.addEventListener('click',()=>handleReadChoice(b,item)));
  }
  function handleReadChoice(btn,item){sound.click();if(btn.dataset.id===item.id){btn.classList.add('correct');sound.correct();toast(`正解！ ${item.name}`,'correct');setTimeout(()=>{state.readPhase='place';$('#readPanel').hidden=true;$('#puzzleTray').hidden=false;$('#mapZone').style.opacity=1;$('#promptCard').style.display='grid';$('#knowledgeCard').style.display='block';const st=stageFor(item);$('#promptKicker').textContent='次は地図に置こう';$('#scaffoldText').textContent=STAGE_TEXT[st][1];renderOverlay(item,st);renderPiece(item);speak(`${item.kana}を地図においてください`);},650);}else{btn.classList.add('wrong');sound.wrong();state.currentHadWrong=true;const s=stats(item.id);s.attempts++;s.wrong++;s.streak=0;s.mastery=Math.max(0,(s.mastery||0)-1);setStats(item.id,s);toast('ちがうよ。ヒントをもう一度読もう','wrong');}}

  function renderOverlay(item,stage,success=false){
    const svg=$('#overlaySvg');svg.innerHTML='';if(!item)return;
    if(success){svg.innerHTML=featurePathMarkup(item,'success');return;}
    if(stage===1){svg.innerHTML=featurePathMarkup(item,'stage1');}
    else if(stage===2){svg.innerHTML=featurePathMarkup(item,'stage2');}
    else if(stage===3){const [cx,cy,r]=item.spotlight;svg.innerHTML=`<circle class="spotlight" cx="${cx}" cy="${cy}" r="${r}"></circle>`;}
  }
  function featurePathMarkup(item,cls){
    if(isRiver(item))return `<g class="${cls==='success'?'success-path':''}"><path class="target-river-halo ${cls==='stage2'?'stage2':'stage1'}" d="${item.path}"/><path class="target-river ${cls==='stage2'?'stage2':'stage1'}" d="${item.path}"/></g>`;
    return `<path class="target-mountain ${cls==='stage2'?'stage2':'stage1'} ${cls==='success'?'success-path':''}" d="${item.path}"/>`;
  }
  function renderPiece(item){
    const [x,y,w,h]=item.bbox;const pad=Math.max(6,Math.min(w,h)*.18);const vb=`${x-pad} ${y-pad} ${w+pad*2} ${h+pad*2}`;const svg=isRiver(item)?`<svg viewBox="${vb}"><path class="mini-river-halo" d="${item.path}"/><path class="mini-river" d="${item.path}"/></svg>`:`<svg viewBox="${vb}"><path class="mini-mountain" d="${item.path}"/></svg>`;
    $('#pieceHost').innerHTML=`<div class="puzzle-piece" id="activePiece" role="button" aria-label="${item.name}を地図へドラッグ"><div class="piece-shape">${svg}</div><div class="piece-text"><b>${item.name}</b><small>${item.kana}</small></div></div>`;$('#activePiece').addEventListener('pointerdown',startDrag,{passive:false});
  }

  let drag=null;
  function startDrag(e){if(state.mode==='read'&&state.readPhase==='identify')return;e.preventDefault();sound.pickup();const original=e.currentTarget,item=currentItem(),ghost=original.cloneNode(true);ghost.removeAttribute('id');ghost.classList.add('drag-ghost');document.body.appendChild(ghost);drag={ghost,item,startX:e.clientX,startY:e.clientY,moved:false,lastNear:false};moveGhost(e.clientX,e.clientY);document.addEventListener('pointermove',dragMove,{passive:false});document.addEventListener('pointerup',dragEnd,{once:true});document.addEventListener('pointercancel',dragEnd,{once:true});}
  function moveGhost(x,y){if(drag){drag.ghost.style.left=`${x}px`;drag.ghost.style.top=`${y}px`;}}
  function dragMove(e){e.preventDefault();if(!drag)return;moveGhost(e.clientX,e.clientY);if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>8)drag.moved=true;const p=pointOnMap(e.clientX,e.clientY),near=p&&distanceTo(drag.item,p.x,p.y)<42;drag.ghost.classList.toggle('near-target',!!near);if(near&&!drag.lastNear)sound.near();drag.lastNear=!!near;}
  function dragEnd(e){document.removeEventListener('pointermove',dragMove);if(!drag)return;const p=pointOnMap(e.clientX,e.clientY),item=drag.item,moved=drag.moved;drag.ghost.remove();drag=null;if(!moved&&!p){state.tapArmed=item;$('#activePiece')?.classList.add('armed');toast('次に地図の場所をタップしてね');sound.bubble();return;}judgePlacement(item,p,e.clientX,e.clientY);}
  function pointOnMap(cx,cy){const r=$('#mapWrap').getBoundingClientRect();if(cx<r.left||cx>r.right||cy<r.top||cy>r.bottom)return null;return{x:(cx-r.left)/r.width*570,y:(cy-r.top)/r.height*755};}
  function distanceTo(item,x,y){const [tx,ty]=item.target;return Math.hypot(x-tx,y-ty);}
  function tolerance(item){const [,,w,h]=item.bbox;const base=Math.max(24,Math.min(50,Math.max(w,h)*.38));const st=stageFor(item);return base+(st<=2?10:0);}
  function judgePlacement(item,p,cx,cy){if(p&&distanceTo(item,p.x,p.y)<=tolerance(item))handleCorrect(item,cx,cy);else handleWrong(item);}
  $('#mapWrap').addEventListener('pointerdown',e=>{if(!state.tapArmed||drag)return;e.preventDefault();const item=state.tapArmed,p=pointOnMap(e.clientX,e.clientY);state.tapArmed=null;$('#activePiece')?.classList.remove('armed');judgePlacement(item,p,e.clientX,e.clientY);});

  function handleCorrect(item,cx,cy){sound.snap();setTimeout(()=>sound.correct(),80);sparkle(cx,cy);renderOverlay(item,1,true);state.sessionCorrect++;const earned=state.currentHadWrong||state.hintUsed?1:2;state.sessionShells+=earned;progress.shells+=earned;progress.totalCorrect++;progress.dailyCorrect++;const s=stats(item.id);s.attempts++;s.correct++;s.streak=(s.streak||0)+1;if(!state.currentHadWrong&&!state.hintUsed)s.mastery=Math.min(5,(s.mastery||0)+1);setStats(item.id,s);toast(`カチッ！ ${item.name} せいかい！ +${earned}${THEME.rewardEmoji}`,'correct');setTimeout(()=>speak(item.kana),160);setTimeout(()=>{state.qIndex++;renderQuestion();},1150);}
  function handleWrong(item){sound.wrong();state.sessionWrong++;state.currentHadWrong=true;const s=stats(item.id);s.attempts++;s.wrong++;s.streak=0;s.mastery=Math.max(0,(s.mastery||0)-1);setStats(item.id,s);const now=stageFor(item),easier=Math.max(1,now-1);state.stageOverride=easier;$('#promptKicker').textContent=STAGE_TEXT[easier][0];$('#scaffoldText').textContent='少しヒントを戻したよ。もう一度やってみよう。';$('#mapCaption').textContent=STAGE_TEXT[easier][2];$('#hintBtn').disabled=easier===1;renderOverlay(item,easier);toast('おしい！ ヒントを1段戻したよ','wrong');}

  $('#hintBtn').addEventListener('click',()=>{const item=currentItem();if(!item)return;sound.bubble();const now=stageFor(item);if(now<=1)return;state.hintUsed=true;state.stageOverride=now-1;const st=stageFor(item);$('#promptKicker').textContent=STAGE_TEXT[st][0];$('#scaffoldText').textContent=st===4?item.hint:STAGE_TEXT[st][1];$('#mapCaption').textContent=STAGE_TEXT[st][2];$('#hintBtn').disabled=st===1;renderOverlay(item,st);toast(st===4?item.hint:'ヒントを1段だけ増やしたよ');});
  $('#skipBtn').addEventListener('click',()=>{sound.click();const item=state.queue.splice(state.qIndex,1)[0];state.queue.push(item);renderQuestion();});
  $('#speakBtn').addEventListener('click',()=>{sound.click();const item=currentItem();if(item)speak(item.kana);});

  function finishSession(){sound.clear();const acc=state.sessionCorrect/Math.max(1,state.sessionCorrect+state.sessionWrong);$('#resultTitle').textContent=acc>.85?'すごい！海の名人！':acc>.65?'やったね！':'よくがんばった！';$('.result-creature').textContent=THEME.resultCreatures[Math.floor(Math.random()*THEME.resultCreatures.length)];$('#resultText').textContent=`${state.queue.length}問チャレンジしたよ`;$('#resultCorrect').textContent=state.sessionCorrect;$('#resultShells').textContent=`+${state.sessionShells}`;$('#resultStars').textContent=acc>.9?'⭐⭐⭐':acc>.65?'⭐⭐☆':'⭐☆☆';$('#resultDialog').showModal();}
  $('#againBtn').addEventListener('click',()=>{sound.click();$('#resultDialog').close();if(state.reviewMode){state.queue=shuffle(weakItems()).slice(0,7);startPreparedGame();}else startGame();});
  $('#homeBtnFromResult').addEventListener('click',()=>{sound.click();$('#resultDialog').close();showScreen('home');});

  function toast(msg,type=''){const t=$('#toast');t.textContent=msg;t.className=`toast show ${type}`;clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.className='toast',1600);}
  function sparkle(cx=innerWidth/2,cy=innerHeight/2){const host=$('#celebrate'),chars=THEME.celebrateEmoji;for(let i=0;i<12;i++){const s=document.createElement('span');s.className='spark';s.textContent=chars[i%chars.length];s.style.left=`${cx}px`;s.style.top=`${cy}px`;s.style.setProperty('--dx',`${(Math.random()-.5)*220}px`);s.style.setProperty('--dy',`${-50-Math.random()*210}px`);host.appendChild(s);setTimeout(()=>s.remove(),1000);}}
  function shuffle(a){return [...a].sort(()=>Math.random()-.5);}
  function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

  $('#settingsBtn').addEventListener('click',()=>{sound.click();$('#soundToggle').checked=progress.settings.sound;$('#voiceToggle').checked=progress.settings.voice;$('#volumeRange').value=progress.settings.volume;$('#settingsDialog').showModal();});
  $('#closeSettings').addEventListener('click',()=>$('#settingsDialog').close());
  $('#soundToggle').addEventListener('change',e=>{progress.settings.sound=e.target.checked;saveProgress();if(e.target.checked)sound.click();});
  $('#voiceToggle').addEventListener('change',e=>{progress.settings.voice=e.target.checked;saveProgress();if(e.target.checked)speak('読み上げをオンにしました');});
  $('#volumeRange').addEventListener('input',e=>{progress.settings.volume=+e.target.value;saveProgress();});
  $('#resetProgress').addEventListener('click',()=>{if(confirm('貝がら・正解数・習熟度・苦手記録を全部リセットしますか？')){progress=defaultProgress();saveProgress();$('#settingsDialog').close();toast('学習記録をリセットしました');}});
  let lastTouch=0;document.addEventListener('touchend',e=>{const n=Date.now();if(n-lastTouch<300&&e.target.closest('.puzzle-piece,.mode-card,.big-action,.choice-btn'))e.preventDefault();lastTouch=n;},{passive:false});
  if('serviceWorker'in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  updateHome();
})();
