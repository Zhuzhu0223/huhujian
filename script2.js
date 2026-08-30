
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
 getDatabase, ref, set, get, update, onValue, remove, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const $=id=>document.getElementById(id);
const cfg=window.FIREBASE_CONFIG||{};
const configured=cfg.apiKey && cfg.databaseURL && !String(cfg.apiKey).includes("PASTE_");

window.MP={
 active:false, applying:false, roomCode:null, uid:null, playerIndex:null, isHost:false, members:[], tutorialDoneForRoom:null, tutorialShownForRoom:null,
 pushState:async()=>{}
};

function status(id,msg,bad=false){
 const el=$(id); if(!el)return;
 el.textContent=msg; el.style.color=bad?"#a94f3d":"";
}
function cleanName(v){return (v||"").trim().slice(0,12)}
function code5(){
 const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
 let s="";for(let i=0;i<5;i++)s+=chars[Math.floor(Math.random()*chars.length)];
 return s;
}
function serialize(){return window.exportGameState?.()}
function showBadge(text){
 const b=$("mpBadge");b.textContent=text;b.classList.add("show");
}
function hideRoomScreens(){
 $("roomModal").classList.add("hidden");
 $("startModal").classList.add("hidden");
}
function showLobby(){hideRoomScreens();$("lobbyModal").classList.remove("hidden")}

if(!configured){
 status("createRoomStatus","尚未設定 firebase-config.js",true);
 status("joinRoomStatus","尚未設定 firebase-config.js",true);
 $("createRoomBtn").disabled=true;$("joinRoomBtn").disabled=true;
} else {
 const app=initializeApp(cfg);
 const auth=getAuth(app), db=getDatabase(app);
 await signInAnonymously(auth);
 const uid=auth.currentUser.uid;
 window.MP.uid=uid;
 let unsubRoom=null;

 function roomRef(code){return ref(db,`rooms/${code}`)}
 function listenRoom(code){
  if(unsubRoom)unsubRoom();
  unsubRoom=onValue(roomRef(code),snap=>{
   const room=snap.val();
   if(!room){$("lobbyModal").classList.add("hidden");$("roomModal").classList.remove("hidden");return}
   const members=Object.values(room.members||{}).sort((a,b)=>a.slot-b.slot);
   const mine=room.members?.[uid];
   window.MP.members=members;
   if(room.status==="playing" && room.gamePlayerMap && room.gamePlayerMap[uid]!==undefined) window.MP.playerIndex=room.gamePlayerMap[uid];
   else if(mine) window.MP.playerIndex=mine.slot;
   window.MP.isHost=room.hostUid===uid;
   $("lobbyCode").textContent=code;
   $("memberList").innerHTML=members.map(m=>`
     <div class="member-row">
       <span class="member-slot">${m.slot+1}</span>
       <b>${m.name}</b>
       ${m.uid===room.hostUid?'<span class="member-host">房主</span>':''}
     </div>`).join("");
   $("hostStartBtn").classList.toggle("hidden",!window.MP.isHost);
   $("hostStartBtn").disabled=!window.MP.isHost||members.length<2;
   $("lobbyStatus").textContent=`${members.length} / ${room.maxPlayers} 人已加入`;

   if(room.status==="playing" && room.game){
    $("lobbyModal").classList.add("hidden");
    window.MP.active=true;
    showBadge(`房間 ${code}｜你是居民 ${window.MP.playerIndex+1}`);
    $("gameRoomBtn")?.classList.add("show");
    $("gameRoomCode").textContent=code;
    $("gameRoomMembers").innerHTML=members.map(m=>`<div class="member-row"><span class="member-slot">${m.slot+1}</span><b>${m.name}</b>${m.uid===room.hostUid?'<span class="member-host">房主</span>':''}</div>`).join("");
    window.MP.applying=true;
    window.importGameState(room.game);
    window.MP.applying=false;
    if(window.MP.tutorialShownForRoom!==code && window.MP.tutorialDoneForRoom!==code){
      window.MP.tutorialShownForRoom=code;
      setTimeout(()=>startTutorial(),80);
    }
   } else if(room.status==="lobby"){
    showLobby();
   }
  });
 }

 let syncTimer=null, pendingState=null;
 window.MP.pushState=()=>{
  if(!window.MP.active||window.MP.applying||!window.MP.roomCode)return;
  pendingState=serialize();if(!pendingState)return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>{
   const state=pendingState;pendingState=null;
   set(ref(db,`rooms/${window.MP.roomCode}/game`),state).catch(err=>console.warn("Firebase sync failed",err));
  },20);
 };
 window.MP.pushStateImmediate=()=>{
  if(!window.MP.active||window.MP.applying||!window.MP.roomCode)return;
  clearTimeout(syncTimer); pendingState=null;
  const state=serialize(); if(!state)return;
  set(ref(db,`rooms/${window.MP.roomCode}/game`),state).catch(err=>console.warn("Firebase sync failed",err));
 };

 $("createRoomBtn").onclick=async()=>{
  const name=cleanName($("createName").value);
  if(!name){status("createRoomStatus","先輸入你的名字",true);return}
  const maxPlayers=+$("roomMaxPlayers").value, deckN=+$("roomDeckCount").value;
  status("createRoomStatus","建立中…");
  let code;
  for(let tries=0;tries<8;tries++){
   const candidate=code5();
   const s=await get(roomRef(candidate));
   if(!s.exists()){code=candidate;break}
  }
  if(!code){status("createRoomStatus","房號產生失敗，請再試一次",true);return}
  await set(roomRef(code),{
   hostUid:uid,maxPlayers,deckN,status:"lobby",createdAt:serverTimestamp(),nextSlot:1,
   members:{[uid]:{uid,name,slot:0,joinedAt:serverTimestamp()}}
  });
  window.MP.roomCode=code;window.MP.playerIndex=0;window.MP.isHost=true;
  listenRoom(code);showLobby();
 };

 $("joinRoomBtn").onclick=async()=>{
  const name=cleanName($("joinName").value);
  const code=$("joinRoomCode").value.trim().toUpperCase();
  if(!name||code.length<5){status("joinRoomStatus","輸入名字和完整房號",true);return}
  status("joinRoomStatus","加入中…");
  const snap=await get(roomRef(code));
  if(!snap.exists()){status("joinRoomStatus","找不到這個房間",true);return}
  const room=snap.val();
  if(room.status!=="lobby"){status("joinRoomStatus","這局已經開始了",true);return}
  if(room.members?.[uid]){
   window.MP.roomCode=code;listenRoom(code);showLobby();return;
  }
  const slotRef=ref(db,`rooms/${code}/nextSlot`);
  const tx=await runTransaction(slotRef,current=>{
   const n=current??1;
   if(n>=room.maxPlayers)return;
   return n+1;
  });
  if(!tx.committed){status("joinRoomStatus","房間已滿",true);return}
  const slot=(tx.snapshot.val()||1)-1;
  await set(ref(db,`rooms/${code}/members/${uid}`),{uid,name,slot,joinedAt:serverTimestamp()});
  window.MP.roomCode=code;window.MP.playerIndex=slot;
  listenRoom(code);showLobby();
 };

 $("hostStartBtn").onclick=async()=>{
  if(!window.MP.isHost||!window.MP.roomCode)return;
  const snap=await get(roomRef(window.MP.roomCode));
  const room=snap.val();
  const members=Object.values(room.members||{}).sort((a,b)=>a.slot-b.slot);
  if(members.length<2)return;
  const names=members.map(m=>m.name);
  const gamePlayerMap=Object.fromEntries(members.map((m,i)=>[m.uid,i]));
  window.MP.playerIndex=gamePlayerMap[uid];
  window.MP.active=true;
  const game=window.initRoomGame(names,room.deckN||24);
  await update(roomRef(window.MP.roomCode),{status:"playing",game,gamePlayerMap});
  showBadge(`房間 ${window.MP.roomCode}｜你是居民 1`);
 };

 $("leaveRoomBtn").onclick=async()=>{
  const code=window.MP.roomCode;
  if(code){
   if(window.MP.isHost) await remove(roomRef(code));
   else await remove(ref(db,`rooms/${code}/members/${uid}`));
  }
  location.reload();
 };
}


$("enterLobbyBtn")?.addEventListener("click",()=>{
 $("homeModal").classList.add("hidden");
 $("roomModal").classList.remove("hidden");
});
$("roomBackHomeBtn")?.addEventListener("click",()=>{
 $("roomModal").classList.add("hidden");
 $("homeModal").classList.remove("hidden");
});

$("gameRoomBtn").onclick=()=>{$("gameRoomModal").classList.remove("hidden")};
$("backToGameBtn").onclick=()=>{$("gameRoomModal").classList.add("hidden")};
$("backToRoomHomeBtn").onclick=()=>{
 $("gameRoomModal").classList.add("hidden");
 $("roomModal").classList.remove("hidden");
 status("createRoomStatus", window.MP.active?`目前仍在房間 ${window.MP.roomCode}。要回原本對局，按右下「回大廳」→「返回遊戲」。`:"");
 status("joinRoomStatus", window.MP.active?"目前對局仍保留；這頁主要供查看建立／加入方式。":"");
};
$("soloModeBtn").onclick=()=>{
 $("roomModal").classList.add("hidden");
 $("startModal").classList.remove("hidden");
};
