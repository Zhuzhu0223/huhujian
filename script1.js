

const bgm = document.getElementById('bgm');
let soundEnabled = true;
let audioCtx = null;

if (bgm) {
  bgm.volume = 0.24;
  bgm.loop = true;
}

function ensureAudio(){
  try{
    if(!audioCtx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(AC) audioCtx = new AC();
    }
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }catch(e){}
}

function tone(freq=440,dur=.06,type='sine',gain=.03){
  if(!soundEnabled) return;
  ensureAudio();
  if(!audioCtx) return;
  const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.type=type;
  o.frequency.setValueAtTime(freq,audioCtx.currentTime);
  g.gain.setValueAtTime(gain,audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur);
  o.connect(g);g.connect(audioCtx.destination);
  o.start();o.stop(audioCtx.currentTime+dur);
}

const SFX = {
  place:new Audio('./assets/place.wav'), rotate:new Audio('./assets/rotate.wav'),
  score1:new Audio('./assets/score1.wav'), score3:new Audio('./assets/score3.wav'), victory:new Audio('./assets/victory.wav')
};
Object.values(SFX).forEach(a=>{a.preload='auto';a.volume=.85});
function playSfx(key){
  if(!soundEnabled) return;
  const a=SFX[key]; if(!a)return;
  try{a.currentTime=0; const p=a.play(); if(p?.catch)p.catch(()=>{});}catch(e){}
}

const AUDIO={
  click(){ tone(380,.045,'triangle',.025); },
  // Tile 落桌：低頻木質「咚」＋很短的確認聲
  place(){
    playSfx('place');
    tone(175,.085,'triangle',.055);
    setTimeout(()=>tone(265,.055,'sine',.032),28);
    setTimeout(()=>tone(390,.035,'triangle',.018),62);
  },
  // 旋轉：像紙牌快速翻動的兩段短音
  rotate(){
    playSfx('rotate');
    tone(520,.045,'triangle',.026);
    setTimeout(()=>tone(690,.045,'triangle',.022),34);
  },
  // 加分：住宅 +1 比較輕，鄰里 +3 更明亮
  score(points=1){
    playSfx(points>=3?'score3':'score1');
    if(points>=3){
      tone(660,.075,'sine',.038);
      setTimeout(()=>tone(880,.09,'sine',.04),70);
      setTimeout(()=>tone(1040,.11,'triangle',.03),145);
    }else{
      tone(610,.065,'sine',.032);
      setTimeout(()=>tone(790,.085,'sine',.032),60);
    }
  },
  good(){
    tone(620,.09,'sine',.04);
    setTimeout(()=>tone(820,.12,'sine',.034),80);
  },
  // 結算／勝利：短版 fanfare，不蓋過太久的 BGM
  victory(){
    playSfx('victory');
    if(bgm){const old=bgm.volume;bgm.volume=.08;setTimeout(()=>bgm.volume=old,1200);}
    const seq=[523.25,659.25,783.99,1046.5];
    seq.forEach((f,i)=>setTimeout(()=>tone(f,i===3?.28:.12,i===3?'sine':'triangle',i===3?.05:.038),i*115));
    setTimeout(()=>tone(783.99,.22,'sine',.025),470);
    setTimeout(()=>tone(1046.5,.32,'sine',.04),500);
  },
  bad(){ tone(145,.13,'square',.022); },
  explosion(){
    if(!soundEnabled) return;
    ensureAudio();
    // 空襲爆炸要明顯壓過背景音樂
    if(bgm){const old=bgm.volume; bgm.volume=Math.min(old,.07); setTimeout(()=>{if(bgm) bgm.volume=old;},1350);}
    if(!audioCtx) return;
    const sr=audioCtx.sampleRate, len=Math.floor(sr*1.2);
    const buf=audioCtx.createBuffer(1,len,sr), d=buf.getChannelData(0);
    for(let i=0;i<len;i++){
      const t=i/len;
      d[i]=(Math.random()*2-1)*Math.pow(1-t,1.75);
    }
    const src=audioCtx.createBufferSource();
    const lp=audioCtx.createBiquadFilter();
    const g=audioCtx.createGain();
    src.buffer=buf;
    lp.type='lowpass';
    lp.frequency.setValueAtTime(1700,audioCtx.currentTime);
    lp.frequency.exponentialRampToValueAtTime(100,audioCtx.currentTime+1.15);
    // v27：提高爆炸主音量，並加一層低頻衝擊感
    g.gain.setValueAtTime(.92,audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+1.15);
    src.connect(lp);lp.connect(g);g.connect(audioCtx.destination);
    src.start();
    tone(58,.42,'sine',.12);
    setTimeout(()=>tone(42,.34,'sine',.085),55);
  }
};

function startBgm(){
  if(!soundEnabled || !bgm) return;
  bgm.play().catch(()=>{});
}

function showExplosionFx(){
  const fx=document.getElementById('explosionFx');
  if(fx){
    fx.classList.remove('hidden');
    setTimeout(()=>fx.classList.add('hidden'),900);
  }
  AUDIO.explosion();
}

// Browser autoplay policy: sound/music starts after the user's first gesture.
document.addEventListener('pointerdown',()=>{
  ensureAudio();
  startBgm();
},{once:true});


const DIRS=['N','E','S','W'], OPP={N:'S',E:'W',S:'N',W:'E'}, DELTA={N:[-1,0],E:[0,1],S:[1,0],W:[0,-1]};
const TYPE_NAME={B:'住宅牆面',R:'巷弄',O:'開放邊',S:'起始住宅'};

// 三類牌完全分開：住宅不再內建巷弄。
const ROAD_DEFS=[
 {id:'road_straight',name:'直巷',meta:'純巷弄｜0 分',e:['R','O','R','O'],house:false,material:null,kind:'road'},
 {id:'road_corner',name:'彎巷',meta:'純巷弄｜0 分',e:['R','R','O','O'],house:false,material:null,kind:'road'},
 {id:'road_tee',name:'T 字巷',meta:'純巷弄｜0 分',e:['R','R','O','R'],house:false,material:null,kind:'road'}
];
const HOUSE_DEFS=[
 {id:'house_straight_1',name:'紅磚住宅',meta:'純住宅｜+1',e:['B','O','B','O'],house:true,houseImage:1,kind:'house'},
 {id:'house_corner_2',name:'紅磚轉角住宅',meta:'純住宅｜+1',e:['B','B','O','O'],house:true,houseImage:2,kind:'house'},
 {id:'house_end_3',name:'紅磚單面住宅',meta:'純住宅｜+1',e:['B','O','O','O'],house:true,houseImage:3,kind:'house'},
 {id:'house_straight_4',name:'紅磚住宅',meta:'純住宅｜+1',e:['B','O','B','O'],house:true,houseImage:4,kind:'house'},
 {id:'house_corner_5',name:'紅磚轉角住宅',meta:'純住宅｜+1',e:['B','B','O','O'],house:true,houseImage:5,kind:'house'},
 {id:'house_end_6',name:'紅磚單面住宅',meta:'純住宅｜+1',e:['B','O','O','O'],house:true,houseImage:6,kind:'house'}
];
const BUNKER_DEF={id:'bunker',name:'防空洞',meta:'空襲修築｜放棄本回合抽到的牌',e:['O','O','O','O'],house:false,kind:'bunker'};
const DEFS=[...ROAD_DEFS,...HOUSE_DEFS];

let S={};

function clone(x){return JSON.parse(JSON.stringify(x))}
function randDef(){return clone(DEFS[Math.floor(Math.random()*DEFS.length)])}
function rotEdges(e,rot){let k=((rot/90)%4+4)%4, out=[...e];for(let i=0;i<k;i++)out=[out[3],out[0],out[1],out[2]];return out}
function startTile(owner,dir){
 return {
   id:'start'+owner,name:`居民 ${owner+1} 起始住宅`,meta:'四面開放｜可接住宅、巷弄',
   e:['S','S','S','S'],house:true,houseImage:(owner%6)+1,startOwner:owner,isStart:true,kind:'start'
 };
}
function tileHTML(tile,rot=0,owner=null){
 const e=rotEdges(tile.e,rot);
 let roads=e.map((x,i)=>x==='R'?`<div class="road ${DIRS[i].toLowerCase()}"></div>`:'').join('');
 if(e.includes('R'))roads+='<div class="road c"></div>';
 const edges=e.map((x,i)=>`<div class="edge ${DIRS[i].toLowerCase()} ${x}" title="${TYPE_NAME[x]}"></div>`).join('');
 let art='';
 if(tile.house){
   const v=((tile.houseImage||1)-1)%6+1;
   const isStart=typeof tile.startOwner==='number';
   const roofKinds=['roof-gray','roof-green','roof-blue','roof-rust','roof-none'];
   const roofClass=isStart?'roof-red':roofKinds[(v-1)%roofKinds.length];
   art=`<div class="paper-house v${v} ${roofClass}">
     <div class="body"></div><div class="roof"></div><div class="gable"></div>
     <div class="door"></div><div class="win w1"></div><div class="win w2"></div><div class="win w3"></div>
   </div>`;
 }else if(tile.kind==='bunker'){
   art='<div class="paper-bunker"><div class="dome"><div class="grain"></div></div><div class="hole"></div></div>';
 }
 const isStart=typeof tile.startOwner==='number';
 const startClass=isStart?` start-tile owner-${tile.startOwner}`:'';
 const startFlag=isStart?`<div class="start-flag">居民 ${tile.startOwner+1}｜起始住宅</div><div class="start-open n">↕</div><div class="start-open e">↔</div><div class="start-open s">↕</div><div class="start-open w">↔</div>`:'';
 return `<div class="tile${startClass}"><div class="base"></div>${roads}${art}${edges}${startFlag}${owner!==null?`<div class="owner">${owner+1}</div>`:''}<div class="label">${tile.name}</div></div>`;
}
function startPositions(n){
 if(n===2)return [[2,2,'E'],[6,6,'W']];
 if(n===3)return [[1,4,'S'],[6,1,'E'],[6,7,'W']];
 return [[1,1,'E'],[1,7,'S'],[7,7,'W'],[7,1,'N']];
}
function buildDeck(n){
 const deck=[];
 const roadCount=Math.max(7,Math.round(n*.42));
 const houseCount=n-roadCount;
 for(let i=0;i<roadCount;i++)deck.push(clone(ROAD_DEFS[i%ROAD_DEFS.length]));
 for(let i=0;i<houseCount;i++)deck.push(clone(HOUSE_DEFS[i%HOUSE_DEFS.length]));
 for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
 return deck;
}
function makeAirRaidTurns(deckN){
 // Guaranteed 3 raids in the final third; spaced enough that users will notice them.
 const a=Math.max(6,Math.floor(deckN*.68));
 const b=Math.max(a+2,Math.floor(deckN*.82));
 const c=Math.max(b+2,deckN-2);
 return new Set([a,b,c].filter(x=>x>0&&x<=deckN));
}

function initRoomGame(names,deckN){
 const n=names.length;
 S={
   board:Array.from({length:9},()=>Array(9).fill(null)),
   players:names.map((name,i)=>({name:name||`居民 ${i+1}`,score:0,homes:0,housingScore:0,neighborScore:0,bunkers:0,hits:0})),
   current:0,deck:buildDeck(deckN),deckTotal:deckN,currentTile:null,rot:0,
   links:new Set(),log:[],placed:0,focus:0,phase:'setup',setupPlayer:0,turnNo:0,
   airRaidTurns:makeAirRaidTurns(deckN),handledRaids:new Set(),usingBunker:false,lastRaid:null
 };
 document.getElementById('startModal').classList.add('hidden');
 document.getElementById('lobbyModal').classList.add('hidden');
 addLog('連線遊戲開始：請玩家依序放置自己的起始住宅。');
 drawAll();
 return exportGameState();
}
function exportGameState(){
 if(!S)return null;
 return {
   ...clone(S),
   links:[...S.links],
   airRaidTurns:[...S.airRaidTurns],
   handledRaids:[...S.handledRaids]
 };
}
function importGameState(raw){
 if(!raw)return;
 S=clone(raw);
 S.links=new Set(raw.links||[]);
 S.airRaidTurns=new Set(raw.airRaidTurns||[]);
 S.handledRaids=new Set(raw.handledRaids||[]);
 drawAll();
 if(S.lastRaid?.stamp && window.__seenRaidStamp!==S.lastRaid.stamp){
   window.__seenRaidStamp=S.lastRaid.stamp;
   displayRaidEvent(S.lastRaid,false);
 }
 if(S.phase==='end')renderEndResults();
}
function localCanAct(){
 if(!window.MP?.active)return true;
 const mine=window.MP.playerIndex;
 if(S?.phase==='setup')return mine===S.setupPlayer;
 if(S?.phase==='play')return mine===S.current;
 return false;
}
function syncGameSoon(){
 if(window.MP?.active && !window.MP.applying) window.MP.pushState?.();
}
window.initRoomGame=initRoomGame;
window.exportGameState=exportGameState;
window.importGameState=importGameState;
window.localCanAct=localCanAct;

function init(){
 const n=+document.getElementById('playerCount').value, deckN=+document.getElementById('deckCount').value;
 S={
   board:Array.from({length:9},()=>Array(9).fill(null)),
   players:Array.from({length:n},(_,i)=>({name:`居民 ${i+1}`,score:0,homes:0,housingScore:0,neighborScore:0,bunkers:0,hits:0})),
   current:0,deck:buildDeck(deckN),deckTotal:deckN,currentTile:null,rot:0,
   links:new Set(),log:[],placed:0,focus:0,phase:'setup',setupPlayer:0,turnNo:0,airRaidTurns:makeAirRaidTurns(deckN),handledRaids:new Set(),usingBunker:false
 };
 document.getElementById('startModal').classList.add('hidden');
 addLog('請玩家輪流選擇起始住宅位置。');
 drawAll();
}
function validStartCell(r,c){
 if(S.board[r][c])return false;
 // avoid outermost border so every player has room.
 if(r<1||r>7||c<1||c>7)return false;
 for(let rr=0;rr<9;rr++)for(let cc=0;cc<9;cc++){
   const x=S.board[rr][cc];
   if(x?.start){
     const dist=Math.abs(rr-r)+Math.abs(cc-c);
     if(dist<3)return false;
   }
 }
 return true;
}
function placeStartHome(r,c){
 if(!localCanAct())return;
 if(S.phase!=='setup'||!validStartCell(r,c))return;
 const p=S.setupPlayer;
 // Safety: one resident can never own two starting homes.
 for(let rr=0;rr<9;rr++)for(let cc=0;cc<9;cc++){
   if(S.board[rr][cc]?.start && S.board[rr][cc]?.player===p) S.board[rr][cc]=null;
 }
 S.board[r][c]={tile:startTile(p,'N'),rot:0,player:p,start:true};
 AUDIO.place();
 addLog(`${S.players[p].name} 放置起始住宅。`);
 S.setupPlayer++;
 if(S.setupPlayer>=S.players.length){
   S.phase='play';
   S.current=0;
   drawNext();
   addLog('所有起始住宅已就位，正式遊戲開始。');
 }
 drawAll();
 if(window.MP?.active) window.MP.pushStateImmediate?.(); else syncGameSoon();
}
function inb(r,c){return r>=0&&r<9&&c>=0&&c<9}
function placementInfo(r,c){
 if(!S?.currentTile)return {legal:false,reason:'等待抽牌'};
 if(S.board[r][c])return {legal:false,reason:'已有板塊'};
 const my=rotEdges(S.currentTile.e,S.rot);
 let adj=0;
 for(let i=0;i<4;i++){
   const d=DIRS[i],[dr,dc]=DELTA[d],rr=r+dr,cc=c+dc;
   if(!inb(rr,cc)||!S.board[rr][cc])continue;
   adj++;
   const otherTile=S.board[rr][cc].tile;
   const other=rotEdges(otherTile.e,S.board[rr][cc].rot);
   const oi=DIRS.indexOf(OPP[d]);
   const a=my[i], b=other[oi];

   if(a==='S'||b==='S')continue;
   if(a==='O'||b==='O')continue;
   if(a==='R'||b==='R'){
     if(a!==b)return {legal:false,reason:'巷弄只能接巷弄或空地'};
     continue;
   }
   if(a==='B'&&b==='B'){
     if((S.currentTile.material||null)!==(otherTile.material||null))
       return {legal:false,reason:'住宅住宅可直接相接'};
     continue;
   }
   return {legal:false,reason:'邊界不相容'};
 }
 return {legal:adj>0,reason:adj>0?'可放置':'必須接觸既有 Tile'};
}
function legalCells(){
 const a=[];for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(placementInfo(r,c).legal)a.push([r,c]);return a
}
function drawNext(){
 if(!S.deck.length){finish();return}
 S.currentTile=S.deck.shift();S.rot=0;S.focus=0;S.usingBunker=false;
 let tries=0;
 while(!hasAnyLegalRotation() && tries<8 && S.deck.length){
   S.deck.push(S.currentTile);S.currentTile=S.deck.shift();tries++;
 }
}
function chooseBunkerThisTurn(){
 if(!localCanAct())return;
 if(S.phase!=='play')return;
 const p=S.players[S.current];
 if(p.bunkers>0){addLog(`${p.name} 已經有防空洞。`);drawAll();return;}
 if(!S.usingBunker){
   S.savedTile=clone(S.currentTile);
   S.usingBunker=true;
   S.currentTile=clone(BUNKER_DEF);S.rot=0;S.focus=0;
   addLog(`${p.name} 正在考慮：放棄本回合抽到的牌，改蓋防空洞。`);
 }else{
   S.currentTile=clone(S.savedTile);
   S.savedTile=null;S.usingBunker=false;S.rot=0;S.focus=0;
   addLog(`${p.name} 取消修築防空洞，回到原本抽到的牌。`);
 }
 drawAll();syncGameSoon();
}

function displayRaidEvent(raid,withFx=true){
 if(withFx)showExplosionFx();
 const p=S.players[raid.target];
 document.getElementById('raidTitle').textContent=raid.safe?'🚨 空襲！':'💥 空襲命中！';
 document.getElementById('raidText').innerHTML=raid.safe
   ?`這次隨機攻擊 <b>${p.name}</b>。<br><br><span class="raid-safe">🛖 防空洞成功抵擋這次空襲，沒有損失！</span><br><br>💨 <b>防空洞已消耗並從棋盤移除</b>，之後若要再次防守，需要犧牲一回合重新興建。`
   :`這次隨機攻擊 <b>${p.name}</b>。<br><br><span class="raid-hit">沒有防空洞，住宅受損，-2 分。</span>`;
 document.getElementById('airRaidModal').classList.remove('hidden');
}
function resolveAirRaid(turnNo){
 const target=Math.floor(Math.random()*S.players.length);
 const p=S.players[target];
 const safe=p.bunkers>0;
 if(safe){
   p.bunkers=0;
   // 一次性防守：立即移除該玩家棋盤上的防空洞。
   // 同時兼容舊存檔／Firebase 還原後 kind 欄位可能不同的情況。
   let removed=false;
   for(let rr=0;rr<9 && !removed;rr++){
     for(let cc=0;cc<9;cc++){
       const cell=S.board[rr][cc];
       const t=cell?.tile;
       const isBunker=t && (t.kind==='bunker' || t.id==='bunker' || t.name==='防空洞');
       if(cell && cell.player===target && isBunker){
         S.board[rr][cc]=null;
         removed=true;
         break;
       }
     }
   }
   // 空襲當下就重畫，不等下一回合／Firebase 回傳，玩家會立刻看到防空洞消失。
   drawBoard();
   addLog(`🚨 空襲攻擊 ${p.name}；防空洞成功抵擋，安全無事；防空洞已消耗並從棋盤移除。`);
 }else{
   p.hits=(p.hits||0)+1;
   p.score=Math.max(0,p.score-2);
   addLog(`🚨 空襲攻擊 ${p.name}；沒有防空洞，受損 -2 分。`);
 }
 S.lastRaid={turnNo,target,safe,stamp:Date.now()};
 window.__seenRaidStamp=S.lastRaid.stamp;
 displayRaidEvent(S.lastRaid,true);
 drawPlayers();
}
function hasAnyLegalRotation(){
 const old=S.rot;for(const r of [0,90,180,270]){S.rot=r;if(legalCells().length){S.rot=old;return true}}S.rot=old;return false
}
function showScoreToast(points,title,detail='',kind=''){
 const wrap=document.getElementById('scoreToastWrap');
 const el=document.createElement('div');
 el.className='score-toast '+kind;
 el.innerHTML=`+${points}　${title}${detail?`<small>${detail}</small>`:''}`;
 wrap.appendChild(el);
 setTimeout(()=>el.remove(),1400);
}
function place(r,c){
 if(!localCanAct())return;
 if(S.phase!=='play'||!placementInfo(r,c).legal){AUDIO.bad();return}
 const owner=S.current;
 S.board[r][c]={tile:clone(S.currentTile),rot:S.rot,player:owner,start:false};
 AUDIO.place(); S.placed++;

 if(S.currentTile.kind==='bunker'){
   S.players[owner].bunkers=1;
   addLog(`🛖 ${S.players[owner].name} 放棄本回合抽牌，完成防空洞。`);
   showScoreToast(0,'防空洞完成',`${S.players[owner].name} 已取得空襲保護`);
 }else if(S.currentTile.house){
   S.players[owner].score+=1;S.players[owner].homes+=1;S.players[owner].housingScore+=1;
   addLog(`${S.players[owner].name} 擴建「${S.currentTile.name}」，住宅 +1。`);
   showScoreToast(1,'住宅成果',`${S.players[owner].name} 擴建了一塊住宅`);
   setTimeout(()=>AUDIO.score(1),95);
 }else{
   addLog(`${S.players[owner].name} 放置「${S.currentTile.name}」，本回合 0 分。`);
 }
 detectNewLinks();

 S.turnNo++;
 const raidNow=S.airRaidTurns.has(S.turnNo)&&!S.handledRaids.has(S.turnNo);
 if(raidNow){
   S.handledRaids.add(S.turnNo);
   resolveAirRaid(S.turnNo);
 }

 S.current=(S.current+1)%S.players.length;
 if(S.deck.length===0){
   drawAll();
   if(window.MP?.active) window.MP.pushStateImmediate?.();
   if(!raidNow) finish();
   else window.__finishAfterRaid=true;
   return;
 }
 drawNext();drawAll();
 if(window.MP?.active) window.MP.pushStateImmediate?.(); else syncGameSoon();
}
function roadNeighbors(r,c){
 const x=S.board[r][c];if(!x)return[];
 const e=rotEdges(x.tile.e,x.rot),out=[];
 for(let i=0;i<4;i++){
   const v=e[i];
   if(v!=='R'&&v!=='S')continue;
   const [dr,dc]=DELTA[DIRS[i]],rr=r+dr,cc=c+dc;
   if(!inb(rr,cc)||!S.board[rr][cc])continue;
   const oe=rotEdges(S.board[rr][cc].tile.e,S.board[rr][cc].rot);
   const ov=oe[DIRS.indexOf(OPP[DIRS[i]])];
   if((v==='R'&&ov==='R')||(v==='S'&&ov==='R')||(v==='R'&&ov==='S'))out.push([rr,cc]);
 }
 return out;
}
function component(sr,sc){
 const q=[[sr,sc]],seen=new Set([`${sr},${sc}`]),owners=new Set();
 while(q.length){
   const [r,c]=q.shift(),x=S.board[r][c];if(x&&x.start)owners.add(x.player);
   for(const [rr,cc] of roadNeighbors(r,c)){const k=`${rr},${cc}`;if(!seen.has(k)){seen.add(k);q.push([rr,cc])}}
 }
 return {seen,owners};
}
function detectNewLinks(){
 const starts=[];for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(S.board[r][c]?.start)starts.push([r,c,S.board[r][c].player]);
 const newPairs=[];
 for(const [r,c] of starts){
   const owners=[...component(r,c).owners].sort((a,b)=>a-b);
   for(let i=0;i<owners.length;i++)for(let j=i+1;j<owners.length;j++){
    const key=`${owners[i]}-${owners[j]}`;
    if(!S.links.has(key)){S.links.add(key);S.players[owners[i]].score+=3;S.players[owners[j]].score+=3;S.players[owners[i]].neighborScore+=3;S.players[owners[j]].neighborScore+=3;newPairs.push([owners[i],owners[j]])}
   }
 }
 newPairs.forEach(([a,b])=>{addLog(`鄰里形成：居民 ${a+1} ↔ 居民 ${b+1}，雙方各 +3。`);showScoreToast(3,'新鄰里形成',`居民 ${a+1} ↔ 居民 ${b+1}，雙方各 +3`,'neighbor')});
 if(newPairs.length){
   setTimeout(()=>AUDIO.score(3),110);
   document.getElementById('turnText').textContent=newPairs.map(([a,b])=>`居民 ${a+1} ↔ 居民 ${b+1} 鄰里形成！`).join('　');
 }
}
function allConnected(){
 let first=null;
 for(let r=0;r<9 && !first;r++){
   for(let c=0;c<9;c++){
     if(S.board[r][c]?.start){
       first=[r,c];
       break;
     }
   }
 }
 if(!first)return false;
 return component(first[0],first[1]).owners.size===S.players.length;
}
function addLog(t){S.log.unshift(t)}
function sanitizeStartHomes(){
 const seen=new Set();
 for(let r=0;r<9;r++)for(let c=0;c<9;c++){
   const x=S.board[r][c];
   if(!x?.start)continue;
   if(seen.has(x.player)) S.board[r][c]=null;
   else seen.add(x.player);
 }
}
function drawBoard(){
 sanitizeStartHomes();
 const b=document.getElementById('board');b.innerHTML='';
 const legal=S.phase==='play'?legalCells():[];
 const legalSet=new Set(legal.map(x=>x.join(',')));
 for(let r=0;r<9;r++)for(let c=0;c<9;c++){
   const el=document.createElement('div');el.className='cell';const x=S.board[r][c];
   if(x)el.innerHTML=tileHTML(x.tile,x.rot,x.player);
   else if(S.phase==='setup'&&validStartCell(r,c)&&localCanAct()){
     el.classList.add('start-choice');
     el.onclick=()=>placeStartHome(r,c);
   }else if(S.phase==='play'&&legalSet.has(`${r},${c}`)&&localCanAct()){
     el.classList.add('legal');el.onclick=()=>place(r,c);
   }
   b.appendChild(el);
 }
}
function drawPlayers(){
 document.getElementById('players').innerHTML=S.players.map((p,i)=>`
   <div class="player ${(S.phase==='play'&&i===S.current)||(S.phase==='setup'&&i===S.setupPlayer)?'active':''}">
    <div class="dot">${i+1}</div>
    <div>${p.name}<div class="score-detail">住宅 ${p.housingScore}｜鄰里 ${p.neighborScore}｜防空洞 ${p.bunkers?'✓':'—'}${p.hits?`｜受襲 ${p.hits}`:''}</div></div>
    <div class="score">${p.score}</div>
   </div>`).join('');
}
function drawSide(){
 if(S.phase==='setup'){
   document.getElementById('tileName').textContent='放置起始住宅';
   document.getElementById('tileMeta').innerHTML=`目前：${S.players[S.setupPlayer]?.name||''}<br>請選擇紅色虛線格。起始住宅彼此至少相隔 2 格。`;
   document.getElementById('preview').innerHTML=tileHTML(startTile(S.setupPlayer,'N'),0,null);
   document.getElementById('turnTitle').textContent=`起始住宅｜${S.players[S.setupPlayer]?.name||''}`;
   document.getElementById('turnText').textContent='點選一個紅色虛線位置放下你的家。';
   document.getElementById('deckStat').textContent='尚未開始';
   document.getElementById('turnsLeft').textContent=S.deckTotal;
   document.getElementById('turnNow').textContent='準備';document.getElementById('dayStrip').textContent='START';
   document.getElementById('placedStat').textContent=S.setupPlayer;
   document.getElementById('linkStat').textContent=0;
   document.getElementById('links').innerHTML='<span style="font-size:10px;color:var(--muted)">先放完所有起始住宅</span>';document.getElementById('bunkerStatus').textContent='起始住宅放完後才會開始抽牌。防空洞在正式回合中自由決定是否修築。';
    document.getElementById('bunkerBtn').disabled=true;
   document.getElementById('log').innerHTML=S.log.map(x=>`<div>${x}</div>`).join('');
   return;
 }
 document.getElementById('tileName').textContent=`目前抽到｜${S.currentTile.name}`;
 const edges=rotEdges(S.currentTile.e,S.rot).map((x,i)=>DIRS[i]+' '+TYPE_NAME[x]).join('・');
 const special=S.currentTile.kind==='bunker'?'<br><span class="raid-chip">本回合選擇修築防空洞</span>':'';
 document.getElementById('tileMeta').innerHTML=S.currentTile.meta+special+
 (S.currentTile.house && !S.currentTile.isStart?'<br>外觀：眷舍增建樣式（屋頂可能不同或無屋頂）':'')+
 '<br>邊界：'+edges;
 document.getElementById('preview').innerHTML=tileHTML(S.currentTile,S.rot,null);
 document.getElementById('turnTitle').textContent=`目前玩家｜${S.players[S.current].name}`;
 document.getElementById('turnText').textContent=!localCanAct()&&window.MP?.active?'等待這位居民完成回合…':(legalCells().length?'選擇棋盤上亮起的格子放置。':'目前方向沒有可放置的位置，請旋轉 Tile。');
 const late=S.turnNo>=Math.floor(S.deckTotal*.6);
 document.getElementById('bunkerStatus').textContent=(late?'⚠ 已進入空襲可能發生的後段。 ':'')+(S.players[S.current].bunkers
   ?'🛖 防空洞目前可用，可抵擋 1 次空襲；成功防守後會從棋盤消失，之後可再次犧牲回合興建。'
   :'🛖 你可以放棄本回合抽到的牌，改蓋防空洞。遊戲後段才會出現空襲。');
 const bunkerBtn=document.getElementById('bunkerBtn');
 bunkerBtn.disabled=!localCanAct() || !!S.players[S.current].bunkers || S.currentTile.kind==='bunker';
 bunkerBtn.classList.toggle('ready',!bunkerBtn.disabled);
 bunkerBtn.textContent=S.usingBunker?'↩ 取消，放原本的牌':'🛖 放棄本回合，改蓋防空洞';
 const drawn=S.deckTotal-S.deck.length;
 document.getElementById('deckStat').textContent=`${drawn} / ${S.deckTotal}`;
 document.getElementById('turnsLeft').textContent=S.deck.length;
 document.getElementById('turnNow').textContent=Math.min(drawn,S.deckTotal);document.getElementById('dayStrip').textContent=`DAY ${Math.max(1,S.turnNo+1)} / ${S.deckTotal}`;
 document.getElementById('placedStat').textContent=S.placed;
 document.getElementById('linkStat').textContent=S.links.size;
 document.getElementById('links').innerHTML=S.links.size?[...S.links].map(k=>{const[a,b]=k.split('-').map(Number);return`<span class="linkbadge">${a+1} ↔ ${b+1}</span>`}).join(''):'<span style="font-size:10px;color:var(--muted)">尚未形成新鄰里</span>';
 document.getElementById('log').innerHTML=S.log.map(x=>`<div>${x}</div>`).join('');
}
function drawAll(){drawBoard();drawPlayers();drawSide()}

function renderEndResults(){
 const endModal=document.getElementById('endModal');
 const firstReveal=endModal.classList.contains('hidden');
 const ranked=S.players.map((p,i)=>({...p,i})).sort((a,b)=>b.score-a.score);
 document.getElementById('villageStatus').innerHTML=`<div class="village-status"><b style="font-size:20px">🏆 ${ranked[0].name} 勝利！</b><br>本局共形成 ${S.links.size} 組新鄰里。</div>`;
 document.getElementById('results').innerHTML=ranked.map((p,i)=>`
   <div class="result"><span>${i===0?'★ ':''}${p.name}<br><small style="color:var(--muted)">住宅 ${p.housingScore}｜鄰里 ${p.neighborScore}</small></span><b>${p.score} 分</b></div>`).join('');
 endModal.classList.remove('hidden');
 if(firstReveal) setTimeout(()=>AUDIO.victory(),120);
}
function finish(){
 if(S)S.phase='end';
 renderEndResults();
 syncGameSoon();
}

let T={step:1,phase:0,placed:{},done:false,message:''};
function tutorialCell(r,c){return T.placed[`${r},${c}`]||null}
function tHouse(material,name='住宅'){
 return {id:'t_house',name:'紅磚'+name,meta:'',e:['B','O','B','O'],house:true,houseImage:2,kind:'house'};
}
function tRoad(){
 return {id:'troad',name:'直巷',meta:'',e:['R','O','R','O'],house:false,material:null,kind:'road'};
}
function tBunker(){
 return clone(BUNKER_DEF);
}
function setupTutorialStep(){
 T.placed={};T.done=false;T.message='';T.phase=0;
 if(T.step===1){
   T.placed['2,1']={tile:startTile(0,'E'),rot:0,owner:0};
 }else if(T.step===2){
   T.placed['2,1']={tile:startTile(0,'E'),rot:0,owner:0};
 }else if(T.step===3){
   T.placed['2,0']={tile:startTile(0,'E'),rot:0,owner:0};
   T.placed['2,4']={tile:startTile(1,'W'),rot:0,owner:1};
 }
}
function renderTutorial(){
 const board=document.getElementById('tutorialBoard');board.innerHTML='';
 const choices=new Set();
 if(!T.done){
   if(T.step===1)choices.add('2,2');
   if(T.step===2)choices.add('2,2');
   if(T.step===3){
     if(!T.placed['2,1'])choices.add('2,1');
     else if(!T.placed['2,2'])choices.add('2,2');
     else if(!T.placed['2,3'])choices.add('2,3');
   }
 }
 for(let r=0;r<5;r++)for(let c=0;c<5;c++){
   const el=document.createElement('div');el.className='tcell';
   const data=tutorialCell(r,c);
   if(data)el.innerHTML=tileHTML(data.tile,data.rot,data.owner??null);
   if(choices.has(`${r},${c}`)){el.classList.add('choice');el.onclick=()=>tutorialPlace(r,c);}
   board.appendChild(el);
 }
 document.getElementById('tutorialStepLabel').textContent=`步驟 ${T.step} / 3`;
 const title=document.getElementById('tutorialTitle'),txt=document.getElementById('tutorialText');
 const pop=document.getElementById('tutorialPop'),next=document.getElementById('tutorialNext');
 pop.classList.toggle('hidden',!T.message);pop.innerHTML=T.message||'';
 next.classList.toggle('hidden',!T.done);next.textContent=T.step===3?'開始正式遊戲':'下一步';

 if(T.step===1){
   title.textContent='1｜抽到住宅，再放上棋盤';
   txt.innerHTML='住宅不再分材質。抽到住宅後，選擇合法位置放下即可，成功放置 <b>+1 分</b>。';
   document.getElementById('tutorialPreview').innerHTML='<div class="preview">'+tileHTML(tHouse('brick'),90,null)+'</div>';
 }else if(T.step===2){
   title.textContent='2｜要不要先蓋防空洞？';
   txt.innerHTML='正式遊戲的每一回合，你都可以選擇 <b>放棄這次抽到的牌</b>，改蓋一座防空洞。每座防空洞只能抵擋 <b>1 次空襲</b>；成功避難後防空洞會從棋盤消失，之後可以再犧牲一回合重新興建。';
   document.getElementById('tutorialPreview').innerHTML='<div class="preview">'+tileHTML(tBunker(),0,null)+'</div>';
 }else{
   title.textContent='3｜用巷弄連起兩戶';
   txt.innerHTML='依序放下三段直巷，讓道路從居民 1 的起始住宅一路接到居民 2。第一次形成鄰里時，雙方各 <b>+3 分</b>。';
   document.getElementById('tutorialPreview').innerHTML='<div class="preview">'+tileHTML(tRoad(),90,null)+'</div>';
 }
}
function startTutorial(){
 T={step:1,phase:0,placed:{},done:false,message:''};
 document.getElementById('startModal').classList.add('hidden');
 document.getElementById('lobbyModal')?.classList.add('hidden');
 document.getElementById('roomModal')?.classList.add('hidden');
 document.getElementById('gameRoomModal')?.classList.add('hidden');
 document.getElementById('tutorialModal').classList.remove('hidden');
 setupTutorialStep();renderTutorial();
}
function tutorialPlace(r,c){
 if(T.done)return;
 AUDIO.place();
 if(T.step===1){
   T.placed[`${r},${c}`]={tile:tHouse('brick'),rot:90,owner:0};
   T.message='✓ 住宅成功放置，+1 分。';
   T.done=true;
 }else if(T.step===2){
   T.placed[`${r},${c}`]={tile:tBunker(),rot:0,owner:0};
   T.message='✓ 防空洞完成，可抵擋 1 次空襲。成功防守後會從棋盤消失，之後可再犧牲一回合重新興建。';
   T.done=true;
 }else if(T.step===3){
   if(!T.placed['2,1']){
     T.placed['2,1']={tile:tRoad(),rot:90,owner:null};
     T.message='第一段巷弄接上居民 1。';
   }else if(!T.placed['2,2']){
     T.placed['2,2']={tile:tRoad(),rot:90,owner:null};
     T.message='第二段完成，還差最後一段。';
   }else if(!T.placed['2,3']){
     T.placed['2,3']={tile:tRoad(),rot:90,owner:null};
     T.message='✓ 兩戶第一次被巷弄連通，雙方各 +3 分。';
     T.done=true;
   }
 }
 renderTutorial();
}
function nextTutorial(){
 if(!T.done)return;
 if(T.step<3){
   T.step++;setupTutorialStep();renderTutorial();
 }else endTutorial();
}
function endTutorial(){
 document.getElementById('tutorialModal').classList.add('hidden');
 if(window.MP?.active){
   window.MP.tutorialDoneForRoom=window.MP.roomCode;
   drawAll();
 }else{
   init();
 }
}
document.getElementById('tutorialBtn').onclick=startTutorial;
document.getElementById('skipTutorialBtn').onclick=init;
document.getElementById('tutorialSkipTop').onclick=endTutorial;

document.getElementById('bunkerBtn').onclick=chooseBunkerThisTurn;
document.getElementById('closeRaidBtn').onclick=()=>{
 document.getElementById('airRaidModal').classList.add('hidden');
 if(window.__finishAfterRaid){window.__finishAfterRaid=false;finish();}
};
document.getElementById('rotateBtn').onclick=()=>{if(!localCanAct()||S.phase!=='play')return;S.rot=(S.rot+90)%360;S.focus=0;AUDIO.rotate();drawAll();syncGameSoon()};

document.getElementById('rulesBtn').onclick=()=>document.getElementById('rulesModal').classList.remove('hidden');
document.getElementById('closeRules').onclick=()=>document.getElementById('rulesModal').classList.add('hidden');
document.getElementById('restartBtn').onclick=()=>{if(window.MP?.active){location.reload()}else document.getElementById('startModal').classList.remove('hidden')};
document.getElementById('againBtn').onclick=()=>{document.getElementById('endModal').classList.add('hidden');if(window.MP?.active){location.reload()}else document.getElementById('startModal').classList.remove('hidden')};






const soundBtnEl=document.getElementById('soundBtn');
if(soundBtnEl){
  soundBtnEl.onclick=()=>{
    soundEnabled=!soundEnabled;
    soundBtnEl.textContent=soundEnabled?'🔊 聲音':'🔇 靜音';
    soundBtnEl.classList.toggle('sound-off',!soundEnabled);
    if(soundEnabled){ensureAudio();startBgm();}
    else if(bgm){bgm.pause();}
  };
}
document.addEventListener('click',e=>{
  const btn=e.target.closest && e.target.closest('button');
  if(btn && !['soundBtn','rotateBtn'].includes(btn.id) && soundEnabled) AUDIO.click();
});


document.addEventListener('click',e=>{
  if(e.target && e.target.id==='tutorialNext'){
    e.preventDefault();
    nextTutorial();
  }
});

