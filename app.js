// Seif Messages — lightweight public-room chat prototype.
// This app uses browser-stored IDs, not authenticated accounts. Do not use for sensitive conversations.
const $ = id => document.getElementById(id);
const SUPABASE_URL = "https://qlcrvffejuscbftjotmp.supabase.co";
const SUPABASE_KEY = "sb_publishable_nY14ZzU_YiOfBrySQlBuFA_G-jg2VOc";
const ROOM = "wasel-friends", PROFILE_KEY = "wasel-personal-name-v1", ID_KEY = "wasel-chat-user-id-v1";
const PHOTO_KEY = "wasel-chat-photo-v1", SOUND_KEY = "wasel-chat-sound-v1", NOTIFY_KEY = "wasel-chat-notify-v1", BIO_KEY = "wasel-chat-bio-v1", FAVORITES_KEY = "wasel-chat-favorites-v1", THEME_KEY = "wasel-chat-theme-v1", PIN_KEY = "wasel-chat-pins-v1", BG_KEY = "wasel-chat-backgrounds-v1", MUTE_KEY = "wasel-chat-muted-v1", MODE_KEY = "wasel-chat-mode-v1", SELECTED_KEY = "wasel-chat-selected-v1", CHAT_LOCKS_KEY="seif-chat-locks-v1", AUTO_LOCK_KEY="seif-auto-lock-minutes-v1", MASTER_PIN_KEY="seif-app-lock-pin-v1", GHOST_KEY="seif-ghost-mode-v1", ACCOUNTS_KEY="seif-local-accounts-v1", PENDING_QUEUE_KEY="seif-pending-messages-v1";
const API = SUPABASE_URL + "/rest/v1/";
let myId = localStorage.getItem(ID_KEY) || crypto.randomUUID();
localStorage.setItem(ID_KEY,myId);
let lastMessagesByUser={},people=[],selectedId=localStorage.getItem(SELECTED_KEY)||null,messages=[],unreadCounts={},lastSignature="",polling=false,replyTo=null,typingTimer=null,lastIncomingId=0,notifiedIds=new Set(),messageSearchTerm="";
const headers={"apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY,"Content-Type":"application/json"};
function status(text,error=false){$("callStatus").textContent=text;$("callStatus").className="statusline"+(error?" error":"");}
function currentName(){return localStorage.getItem(PROFILE_KEY)||"";}
function currentPhoto(){return localStorage.getItem(PHOTO_KEY)||"";}
function initials(name){return (name||"").trim().charAt(0)||"؟";}
function timeLabel(value){return new Date(value).toLocaleTimeString("ar-TN",{hour:"2-digit",minute:"2-digit"});}
function escapeText(v){return String(v??"");}
async function api(path,options={}){
 const response=await fetch(API+path,{...options,headers:{...headers,...(options.headers||{})}});
 if(!response.ok)throw new Error((await response.text())||("HTTP "+response.status));
 if(response.status===204)return [];
 const raw=await response.text();return raw?JSON.parse(raw):[];
}

let activeCallApi=null,callScriptPromise=null,activeCallInfo=null,callClockTimer=null,incomingRingTimer=null,incomingToneTimer=null,handledCallOffers=new Set(),incomingCallOffer=null,ringAudioContext=null;
const CALL_LOG_PREFIX="[[SEIF_CALL_LOG]]";
const CALL_OFFER_PREFIX="[[SEIF_CALL_OFFER]]";
function startRingtone(){
 stopRingtone();
 try{ringAudioContext=ringAudioContext||new (window.AudioContext||window.webkitAudioContext)();ringAudioContext.resume?.();const beep=()=>{if(!ringAudioContext||ringAudioContext.state!=="running")return;const osc=ringAudioContext.createOscillator(),gain=ringAudioContext.createGain();osc.type="sine";osc.frequency.value=880;gain.gain.value=.045;osc.connect(gain);gain.connect(ringAudioContext.destination);osc.start();osc.stop(ringAudioContext.currentTime+.22);};beep();incomingToneTimer=setInterval(()=>{beep();setTimeout(beep,350);},1250);}catch(e){console.warn("Ringtone unavailable",e);}
}
function stopRingtone(){clearInterval(incomingToneTimer);incomingToneTimer=null;}
function ensureIncomingCallModal(){
 let overlay=$("incomingCallModal");if(overlay)return overlay;
 overlay=document.createElement("div");overlay.id="incomingCallModal";overlay.className="modal-overlay incoming-call-overlay";overlay.hidden=true;
 const card=document.createElement("section");card.className="incoming-call-card";
 const icon=document.createElement("div");icon.className="incoming-call-icon";icon.textContent="☎";
 const title=document.createElement("h2");title.id="incomingCallTitle";title.textContent="مكالمة واردة";
 const note=document.createElement("p");note.id="incomingCallNote";note.textContent="يتصل بك صديقك";
 const actions=document.createElement("div");actions.className="incoming-call-actions";
 const decline=document.createElement("button");decline.type="button";decline.className="decline-call";decline.textContent="رفض";decline.addEventListener("click",()=>answerIncomingCall(false));
 const accept=document.createElement("button");accept.type="button";accept.className="accept-call";accept.textContent="قبول";accept.addEventListener("click",()=>answerIncomingCall(true));
 actions.append(decline,accept);card.append(icon,title,note,actions);overlay.append(card);document.body.append(overlay);return overlay;
}
function showIncomingCall(m,kind){
 if(activeCallInfo||incomingCallOffer||handledCallOffers.has(String(m.id)))return;
 incomingCallOffer={id:m.id,callerId:m.sender_id,callerName:m.sender_name||"صديقك",kind,createdAt:m.created_at};
 const overlay=ensureIncomingCallModal();$("incomingCallTitle").textContent=kind==="video"?"مكالمة فيديو واردة":"مكالمة صوتية واردة";$("incomingCallNote").textContent=(m.sender_name||"صديقك")+" يتصل بك…";
 overlay.hidden=false;startRingtone();status("مكالمة واردة من "+(m.sender_name||"صديقك"));
}
async function answerIncomingCall(accept){
 const offer=incomingCallOffer;if(!offer)return;
 incomingCallOffer=null;handledCallOffers.add(String(offer.id));stopRingtone();const overlay=$("incomingCallModal");if(overlay)overlay.hidden=true;
 try{
  const result=accept?"accepted":"declined";
  await api("wasel_chat_messages?id=eq."+encodeURIComponent(offer.id)+"&recipient_id=eq."+encodeURIComponent(myId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({body:[CALL_OFFER_PREFIX,offer.kind,result,String(Date.now())].join("|")})});
 }catch(e){console.warn("Could not update call request",e);}
 if(accept){await selectPerson(offer.callerId);await startCall(offer.kind,true);}
 else{status("تم رفض المكالمة.");}
}
function formatCallDuration(seconds){const n=Math.max(0,Number(seconds)||0);return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");}
async function saveCallLog(info){
 if(!info||info.saved)return;info.saved=true;
 const duration=info.joinedAt?Math.max(0,Math.floor((Date.now()-info.joinedAt)/1000)):0;
 const outcome=info.peerJoined?"completed":"missed";
 const body=[CALL_LOG_PREFIX,info.kind,outcome,String(duration)].join("|");
 try{
  await api("wasel_chat_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({room_id:ROOM,sender_id:myId,sender_name:currentName()||"مستخدم",recipient_id:info.peerId,body,image_data:null})});
  if(selectedId===info.peerId)await loadMessages();
 }catch(e){console.warn("Call history could not be saved",e);status("انتهت المكالمة، لكن تعذّر حفظها في سجل الدردشة. تحقق من صلاحيات Supabase.",true);}
}
function ensureCallModal(){
 let overlay=$("callModal");if(overlay)return overlay;
 overlay=document.createElement("div");overlay.id="callModal";overlay.className="modal-overlay call-overlay";overlay.hidden=true;
 const card=document.createElement("section");card.className="call-card";
 const head=document.createElement("div");head.className="call-card-head";
 const title=document.createElement("strong");title.id="callModalTitle";title.textContent="مكالمة Seif Messages";
 const close=document.createElement("button");close.type="button";close.className="call-close";close.textContent="إنهاء المكالمة";close.addEventListener("click",endCall);
 head.append(title,close);const note=document.createElement("p");note.id="callModalNote";note.className="call-note";
 const mount=document.createElement("div");mount.id="jitsiMount";mount.className="jitsi-mount";
 card.append(head,note,mount);overlay.appendChild(card);overlay.addEventListener("click",e=>{if(e.target===overlay)endCall();});document.body.appendChild(overlay);return overlay;
}
function loadJitsiScript(){
 if(window.JitsiMeetExternalAPI)return Promise.resolve();
 if(callScriptPromise)return callScriptPromise;
 callScriptPromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://meet.jit.si/external_api.js";script.async=true;script.onload=()=>window.JitsiMeetExternalAPI?resolve():reject(new Error("تعذر تحميل مكتبة الاتصال."));script.onerror=()=>reject(new Error("تعذر الوصول إلى خدمة الاتصال. تحقق من الإنترنت."));document.head.appendChild(script);});
 return callScriptPromise;
}
async function startCall(kind,isIncoming=false){
 if(!selectedId||selectedId===myId){status("اختر صديقًا من قائمة الأشخاص أولًا.",true);return;}
 const person=people.find(p=>p.user_id===selectedId);if(!person){status("لم يتم العثور على جهة الاتصال. حدّث قائمة الأشخاص أولًا.",true);return;}
 if(activeCallApi||activeCallInfo){status("هناك مكالمة جارية بالفعل.",true);return;}
 const peerId=selectedId;
 if(!isIncoming){
  try{
   await api("wasel_chat_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({room_id:ROOM,sender_id:myId,sender_name:currentName()||"مستخدم",recipient_id:peerId,body:[CALL_OFFER_PREFIX,kind,"ringing",String(Date.now())].join("|"),image_data:null})});
  }catch(e){status("تعذر إرسال طلب المكالمة. تحقق من اتصال Supabase وصلاحيات الرسائل.",true);return;}
 }
 const overlay=ensureCallModal();overlay.hidden=false;
 $("callModalTitle").textContent=(kind==="video"?"مكالمة فيديو مع ":"مكالمة صوتية مع ")+(person.display_name||"صديقك");
 $("callModalNote").textContent=isIncoming?"تم قبول المكالمة، جارٍ الانضمام…":"جارٍ الرنين لدى الطرف الآخر. انتظر قبول المكالمة…";
 const mount=$("jitsiMount");mount.replaceChildren();status(isIncoming?"جارٍ الانضمام إلى المكالمة…":"تم إرسال طلب المكالمة؛ جارٍ الاتصال…");
 activeCallInfo={peerId,peerName:person.display_name||"صديقك",kind,startedAt:Date.now(),joinedAt:0,peerJoined:false,saved:false};
 try{
  await loadJitsiScript();
  if(overlay.hidden||!activeCallInfo)return;
  const roomName="seifmessages-"+[myId,selectedId].sort().join("-");
  activeCallApi=new window.JitsiMeetExternalAPI("meet.jit.si",{roomName,width:"100%",height:"100%",parentNode:mount,lang:"ar",userInfo:{displayName:currentName()||"مستخدم"},configOverwrite:{startWithAudioMuted:false,startWithVideoMuted:kind==="audio",prejoinConfig:{enabled:false},disableDeepLinking:true},interfaceConfigOverwrite:{TOOLBAR_BUTTONS:kind==="audio"?["microphone","hangup","chat","settings","tileview"]:["microphone","camera","desktop","hangup","chat","settings","tileview"]}});
  activeCallApi.addListener("videoConferenceJoined",()=>{if(activeCallInfo)activeCallInfo.joinedAt=Date.now();status("أنت داخل المكالمة.");$("callModalNote").textContent="مدة المكالمة "+formatCallDuration(0);clearInterval(callClockTimer);callClockTimer=setInterval(()=>{if(activeCallInfo&&activeCallInfo.joinedAt)$("callModalNote").textContent="مدة المكالمة "+formatCallDuration(Math.floor((Date.now()-activeCallInfo.joinedAt)/1000));},1000);});
  activeCallApi.addListener("participantJoined",()=>{if(activeCallInfo)activeCallInfo.peerJoined=true;$("callModalNote").textContent="انضم صديقك إلى المكالمة.";status("انضم الطرف الآخر إلى المكالمة.");});
  activeCallApi.addListener("participantLeft",()=>{$("callModalNote").textContent="غادر أحد المشاركين المكالمة.";});
  activeCallApi.addListener("readyToClose",()=>endCall());
  activeCallApi.addListener("errorOccurred",e=>{status("حدث خطأ في الاتصال: "+(e?.message||"تحقق من صلاحيات الكاميرا والميكروفون."),true);});
 }catch(e){status("تعذر بدء المكالمة: "+e.message,true);await endCall();}
}
async function endCall(){
 const info=activeCallInfo;activeCallInfo=null;clearInterval(callClockTimer);callClockTimer=null;
 const apiInstance=activeCallApi;activeCallApi=null;
 if(apiInstance){try{apiInstance.executeCommand("hangup");}catch(e){}try{apiInstance.dispose();}catch(e){}}
 const overlay=$("callModal");if(overlay)overlay.hidden=true;const mount=$("jitsiMount");if(mount)mount.replaceChildren();
 if(info)await saveCallLog(info);
 status("انتهت المكالمة.");
}
async function openCallsHistory(){
 let overlay=$("callsHistoryModal");
 if(!overlay){
  overlay=document.createElement("div");overlay.id="callsHistoryModal";overlay.className="modal-overlay calls-history-overlay";
  const card=document.createElement("section");card.className="calls-history-card";
  const head=document.createElement("div");head.className="calls-history-head";
  const title=document.createElement("h2");title.textContent="سجل المكالمات";
  const close=document.createElement("button");close.type="button";close.className="call-close";close.textContent="إغلاق";close.addEventListener("click",()=>overlay.hidden=true);
  head.append(title,close);const list=document.createElement("div");list.id="callsHistoryList";list.className="calls-history-list";card.append(head,list);overlay.append(card);overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.hidden=true;});document.body.append(overlay);
 }
 overlay.hidden=false;const list=$("callsHistoryList");list.textContent="جارٍ تحميل سجل المكالمات…";
 try{
  const rows=await api("wasel_chat_messages?select=id,sender_id,sender_name,recipient_id,body,created_at&room_id=eq."+ROOM+"&body=like."+encodeURIComponent(CALL_LOG_PREFIX+"*")+"&order=created_at.desc&limit=100");
  list.replaceChildren();
  const relevant=rows.filter(m=>m.sender_id===myId||m.recipient_id===myId);
  if(!relevant.length){list.textContent="لا توجد مكالمات مسجلة بعد.";return;}
  for(const m of relevant){
   const bits=(m.body||"").split("|");if(bits[0]!==CALL_LOG_PREFIX)continue;
   const item=document.createElement("button");item.type="button";item.className="call-history-item";
   const icon=document.createElement("span");icon.className="call-history-icon";icon.textContent=bits[1]==="video"?"▣":"☎";
   const details=document.createElement("span");details.className="call-history-details";
   const title=document.createElement("strong");title.textContent=(bits[1]==="video"?"مكالمة فيديو":"مكالمة صوتية")+" · "+(bits[2]==="completed"?"تمت":"لم يتم الرد");
   const sub=document.createElement("small");const peer=m.sender_id===myId?m.recipient_id:m.sender_id;const person=people.find(p=>p.user_id===peer);sub.textContent=(person?.display_name||m.sender_name||"جهة اتصال")+" · "+timeLabel(m.created_at)+(bits[2]==="completed"?" · "+formatCallDuration(bits[3]):"");
   details.append(title,sub);item.append(icon,details);item.addEventListener("click",()=>{overlay.hidden=true;selectPerson(peer);});list.append(item);
  }
 }catch(e){list.textContent="تعذّر تحميل سجل المكالمات. تحقق من صلاحيات قراءة الرسائل في Supabase.";}
}

const UI_ICON_PATHS={"chevron":"<path d=\"m7 10 5 5 5-5\"/>","status":"<circle cx=\"12\" cy=\"12\" r=\"8\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","edit":"<path d=\"m14 5 5 5M4 20l4-.8L19 8a2 2 0 0 0-3-3L5 16Z\"/>","more":"<circle cx=\"12\" cy=\"5\" r=\"1\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"19\" r=\"1\"/>","search":"<circle cx=\"10\" cy=\"10\" r=\"7\"/><path d=\"m15 15 5 5\"/>","phone":"<path d=\"M7 3H5a2 2 0 0 0-2 2 16 16 0 0 0 14 14 2 2 0 0 0 2-2v-2l-5-2-2 2a12 12 0 0 1-5-5l2-2Z\"/>","video":"<rect x=\"3\" y=\"6\" width=\"13\" height=\"12\" rx=\"2\"/><path d=\"m16 10 5-3v10l-5-3\"/>","mail":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m4 7 8 6 8-6\"/>","paperclip":"<path d=\"m8 12 7-7a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8\"/>","image":"<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><circle cx=\"8\" cy=\"9\" r=\"1.5\"/><path d=\"m21 15-5-5L5 20\"/>","camera":"<path d=\"M4 7h3l2-3h6l2 3h3v13H4Z\"/><circle cx=\"12\" cy=\"13\" r=\"4\"/>","file":"<path d=\"M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6\"/>","music":"<path d=\"M9 18V5l12-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"18\" cy=\"16\" r=\"3\"/>","pin":"<path d=\"m16 3 5 5-4 1-4 4 2 5-2 2-4-6-5-1 4-4 1-4Z\"/>","contact":"<circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 21a8 8 0 0 1 16 0\"/>","poll":"<path d=\"M4 19h16M6 16V9m6 7V4m6 12v-5\"/>","chat":"<path d=\"M20 11.5a7.5 7.5 0 0 1-8 7.5 8.6 8.6 0 0 1-3.7-.8L4 20l1.3-3.5A7.2 7.2 0 0 1 4 12c0-4.4 3.6-8 8-8s8 3.1 8 7.5Z\"/>","people":"<circle cx=\"9\" cy=\"8\" r=\"3.5\"/><path d=\"M2 20a7 7 0 0 1 14 0M16 5a3.5 3.5 0 0 1 0 7M18 14a5 5 0 0 1 4 5\"/>","settings":"<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19 15 21 16l-2 3-2-1-2 1v2h-4v-2l-2-1-2 1-2-3 2-1v-2l-2-1 2-3 2 1 2-1V7h4v2l2 1 2-1 2 3-2 1Z\"/>","send":"<path d=\"m22 2-7 20-4-9-9-4Z\"/><path d=\"M22 2 11 13\"/>","mic":"<rect x=\"9\" y=\"3\" width=\"6\" height=\"12\" rx=\"3\"/><path d=\"M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8\"/>","bell":"<path d=\"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4\"/>","bellOff":"<path d=\"M18 8a6 6 0 0 0-11-3M6 8c0 7-3 7-3 9h14M10 21h4M3 3l18 18\"/>","star":"<path d=\"m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z\"/>","close":"<path d=\"m6 6 12 12M18 6 6 18\"/>","smile":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01\"/>","reply":"<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h9a7 7 0 0 1 7 7v2\"/>","sun":"<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42\"/>"};
function uiIcon(name,cls="ui-icon"){const path=UI_ICON_PATHS[name];if(!path)return "";return '<svg class="'+cls+'" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';}
function parseEmoji(root){if(root&&window.twemoji)window.twemoji.parse(root,{base:"https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/",folder:"svg",ext:".svg"});}
function setupExtras(){
 const attach=$("attachmentToggle"),menu=$("attachmentMenu"),form=$("messageForm"),field=$("messageText");
 if(attach&&form&&field&&attach.parentElement!==form)form.insertBefore(attach,field);
 if(attach&&!attach.dataset.ready){attach.dataset.ready="1";attach.addEventListener("click",()=>{menu.hidden=!menu.hidden;attach.setAttribute("aria-expanded",String(!menu.hidden));attach.classList.toggle("is-active",!menu.hidden);});}
 [$("chatDocument"),$("chatAudio")].forEach(input=>input?.addEventListener("change",()=>{if(input.files?.[0])status("إرسال الملفات غير مفعّل بعد؛ نحتاج ربط Supabase Storage.",true);input.value="";}));
 $("cameraImage")?.addEventListener("change",e=>{if(e.target.files?.[0])sendImage(e.target.files[0]);e.target.value="";});
 menu?.querySelectorAll("[data-attachment]").forEach(b=>b.addEventListener("click",()=>{menu.hidden=true;if(b.dataset.attachment==="location")status("مشاركة الموقع غير مفعّلة بعد.");else if(b.dataset.attachment==="contact")status("مشاركة جهات الاتصال غير مفعّلة بعد.");else status("إنشاء استطلاع رأي يحتاج جداول خاصة في قاعدة البيانات.");}));
 document.querySelectorAll(".head-icon").forEach(b=>{if(b.dataset.ready)return;b.dataset.ready="1";b.addEventListener("click",()=>{if(b.id==="chatMenuButton"){const m=$("chatMenu");m.hidden=!m.hidden;b.setAttribute("aria-expanded",String(!m.hidden));return;}startCall(b.id==="videoCall"?"video":"audio");});});
 const callsButton=$("callsHistoryButton");if(callsButton&&!callsButton.dataset.ready){callsButton.dataset.ready="1";callsButton.addEventListener("click",openCallsHistory);}
 $("chatMenu")?.querySelectorAll("[data-menu-action]").forEach(b=>{if(b.dataset.ready)return;b.dataset.ready="1";b.addEventListener("click",()=>handleChatMenu(b.dataset.menuAction));});
 const tools=document.querySelector(".composer-tools");
 if(!$("emojiPicker")){
  const b=document.createElement("button");b.type="button";b.id="emojiPicker";b.className="attach-button emoji-trigger";b.innerHTML=uiIcon("smile");b.title="كل الإيموجيات";b.setAttribute("aria-label","فتح لوحة الإيموجي");
  b.addEventListener("click",()=>{let panel=$("emojiPanel");if(panel){panel.remove();b.classList.remove("is-active");return;}b.classList.add("is-active");panel=document.createElement("section");panel.id="emojiPanel";panel.className="emoji-panel emoji-picker-full";panel.setAttribute("aria-label","لوحة الإيموجي");
   const search=document.createElement("input");search.type="search";search.className="emoji-search";search.placeholder="ابحث في الإيموجيات…";search.setAttribute("aria-label","ابحث في الإيموجيات");panel.appendChild(search);
   const tabs=document.createElement("div");tabs.className="emoji-tabs";panel.appendChild(tabs);
   const grid=document.createElement("div");grid.className="emoji-grid";panel.appendChild(grid);
   const categories=[
    ["وجوه","😀 😃 😄 😁 😆 😅 😂 🤣 🥲 🥹 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🤫 🤥 😶 😐 😑 😬 🫠 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕"],
    ["قلوب","❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 🩷 🩵 🩶 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💌 💋 💑 💏 🫶"],
    ["حيوانات","🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🦟 🦗 🕷️ 🕸️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🦣 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🦮 🐕‍🦺 🐩 🐈 🐈‍⬛ 🪶 🐓 🦃 🦤 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦡 🦫 🦦 🦥 🐁 🐀 🐿️ 🦔"],
    ["الطقس والطبيعة","🌱 🌿 ☘️ 🍀 🎍 🪴 🌵 🌴 🌳 🌲 🌾 🌷 🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌛 🌜 🌚 🌕 🌖 🌗 🌘 🌑 🌒 🌓 🌔 🌙 🌎 🌍 🌏 🪐 💫 ⭐ 🌟 ✨ ⚡ ☄️ 💥 🔥 🌪️ 🌈 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💨 💧 💦 ☔ ☂️ 🌊 🌫️"],
    ["طعام وشراب","🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🫒 🥑 🍆 🥔 🥕 🌽 🌶️ 🫑 🥒 🥬 🥦 🧄 🧅 🍄 🥜 🌰 🍞 🥐 🥖 🫓 🥨 🥯 🥞 🧇 🧀 🍖 🍗 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🫔 🥙 🧆 🥚 🍳 🥘 🍲 🥣 🥗 🍿 🧈 🧂 🥫 🍱 🍘 🍙 🍚 🍛 🍜 🍝 🍠 🍢 🍣 🍤 🍥 🥮 🍡 🥟 🥠 🥡 🦪 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 🍼 🥛 ☕ 🫖 🍵 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🧃 🧋"],
    ["أنشطة وألعاب","⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🚴 🚵 🧗 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🤹 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🪘 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🕹️ 🧩"],
    ["السفر والأشياء","🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🚲 🛴 🛹 🚏 🛣️ 🛤️ 🚦 🚥 🛑 🚧 ⚓ ⛵ 🚤 🛳️ ⛴️ 🚢 ✈️ 🛩️ 🛫 🛬 🪂 💺 🚁 🚟 🚠 🚡 🛰️ 🚀 🛸 🌋 🗻 🏕️ 🏖️ 🏜️ 🏝️ 🏞️ 🏟️ 🏛️ 🏗️ 🧱 🏠 🏡 🏢 🏣 🏥 🏦 🏨 🏪 🏫 🏬 🏭 🏯 🏰 💒 🗼 🗽 ⛪ 🕌 🛕 🕍 ⛩️ 🕋 ⛲ 🌁 🌃 🌆 🌇 🌉 🎆 🎇 🌌"],
    ["رموز وأعلام","❤️‍🔥 💯 💢 💬 👁️‍🗨️ 🗨️ 🗯️ 💭 💤 🔔 🔕 🎵 🎶 🏧 🚮 🚰 ♿ 🚹 🚺 🚻 🚼 🚾 🛂 🛃 🛄 🛅 ⚠️ 🚸 ⛔ 🚫 🚳 🚭 🚯 🚱 🚷 📵 🔞 ☢️ ☣️ ⬆️ ↗️ ➡️ ↘️ ⬇️ ↙️ ⬅️ ↖️ ↕️ ↔️ 🔄 🔃 🔙 🔚 🔛 🔜 🔝 🛐 ⚛️ 🕉️ ✡️ ☸️ ☯️ ✝️ ☦️ ☪️ ☮️ 🕎 🔯 🪯 ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🔀 🔁 🔂 ▶️ ⏸️ ⏹️ ⏺️ ⏭️ ⏮️ 🔼 🔽 ⏫ ⏬ ➕ ➖ ➗ ✖️ ♾️ 💲 💱 ™️ ©️ ®️ 〰️ ➰ ➿ ✔️ ☑️ 🔘 ⚪ ⚫ 🔴 🟠 🟡 🟢 🔵 🟣 🟤 🟥 🟧 🟨 🟩 🟦 🟪 🟫 ⬛ ⬜ 🔶 🔷 🔸 🔹 🔺 🔻 💠 🔈 🔉 🔊 🔇 🔍 🔎 🔒 🔓 🔑 🗝️ 🧿 🔮 🪬 🎃 🎄 🎁 🎈 🎉 🎊 🪅 🪩 🧨"]
   ];
   const addEmoji=(emoji)=>{const x=document.createElement("button");x.type="button";x.className="emoji-choice";x.dataset.emoji=emoji;x.textContent=emoji;x.title=emoji;x.setAttribute("aria-label",emoji);x.addEventListener("click",()=>{const field=$("messageText");const start=field.selectionStart??field.value.length,end=field.selectionEnd??field.value.length;field.value=field.value.slice(0,start)+emoji+field.value.slice(end);field.setSelectionRange(start+emoji.length,start+emoji.length);field.dispatchEvent(new Event("input",{bubbles:true}));field.focus();});grid.appendChild(x);};
   const draw=(filter="",category=0)=>{grid.replaceChildren();const term=filter.trim().toLocaleLowerCase();const all=categories.flatMap(c=>c[1].split(" ").map(e=>e.trim()).filter(Boolean)).filter((e,i,a)=>a.indexOf(e)===i);const keywords=[{words:["ثلج","ثلجي","snow","برد","ice"],emojis:["❄️","☃️","⛄","🌨️","🥶"]},{words:["حيوان","حيوانات","حيوانات أليفة","animal","animals"],category:2},{words:["قلب","قلوب","حب","heart","hearts","love"],category:1},{words:["وجه","وجوه","ضحك","بكاء","وجه سعيد","face","faces","smile"],category:0},{words:["طقس","طبيعة","مطر","شمس","weather","nature","rain"],category:3},{words:["طعام","أكل","فاكهة","food","fruit"],category:4},{words:["رياضة","لعبة","ألعاب","sport","game"],category:5},{words:["سيارة","سفر","طائرة","travel","car"],category:6},{words:["رمز","رموز","علم","أعلام","symbol","flag"],category:7}];let list;if(term){const exact=keywords.find(k=>k.words.includes(term));if(exact)list=exact.emojis||categories[exact.category][1].split(" ").filter(Boolean);else list=all.filter(e=>e.includes(term));}else list=categories[category][1].split(" ").filter(Boolean);list.forEach(addEmoji);if(!list.length){const empty=document.createElement("p");empty.className="emoji-empty";empty.textContent="جرّب البحث عن: ثلج، حيوانات، قلوب، وجوه، طقس.";grid.appendChild(empty);}if(window.twemoji)window.twemoji.parse(grid,{base:"https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/",folder:"svg",ext:".svg"});};
   categories.forEach((c,i)=>{const t=document.createElement("button");t.type="button";t.className="emoji-tab";t.textContent=c[0];t.addEventListener("click",()=>{tabs.querySelectorAll("button").forEach(n=>n.classList.toggle("active",n===t));search.value="";draw("",i);});tabs.appendChild(t);if(i===0)t.classList.add("active");});
   search.addEventListener("input",()=>{tabs.querySelectorAll("button").forEach(n=>n.classList.remove("active"));draw(search.value);});
   draw();form.insertAdjacentElement("beforebegin",panel);search.focus();
  });form.insertBefore(b,field);
 }
 if(!$("replyPreview")){const p=document.createElement("div");p.id="replyPreview";p.className="reply-preview";p.hidden=true;const label=document.createElement("span");label.id="replyPreviewText";p.appendChild(label);const cancel=document.createElement("button");cancel.type="button";cancel.innerHTML=uiIcon("close");cancel.setAttribute("aria-label","إلغاء الرد");cancel.addEventListener("click",clearReply);p.appendChild(cancel);form.parentElement.insertBefore(p,form);}
}
function playSound(){if(localStorage.getItem(SOUND_KEY)==="off")return;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.type="sine";o.frequency.value=740;g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.08,c.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.16);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.17);o.onended=()=>c.close();}catch(e){}}
async function enableNotifications(){if(!("Notification"in window)){status("المتصفح لا يدعم إشعارات سطح المكتب.",true);return false;}try{const p=await Notification.requestPermission();if(p==="granted"){localStorage.setItem(NOTIFY_KEY,"on");status("تم السماح بإشعارات المتصفح.");return true;}localStorage.setItem(NOTIFY_KEY,"off");status("لم يتم السماح بالإشعارات. يمكنك تفعيلها من إعدادات المتصفح.",true);return false;}catch(e){status("تعذر تفعيل الإشعارات.",true);return false;}}
function notifyIncoming(m){if(!JSON.parse(localStorage.getItem(MUTE_KEY)||"{}")[m.sender_id])playSound();if(localStorage.getItem(NOTIFY_KEY)==="on"&&!JSON.parse(localStorage.getItem(MUTE_KEY)||"{}")[m.sender_id]&&"Notification"in window&&Notification.permission==="granted"&&(document.visibilityState!=="visible"||!selectedId||selectedId!==m.sender_id)){try{new Notification(m.sender_name||"رسالة جديدة",{body:m.body||"أرسل صورة",icon:"icon.svg",tag:"seif-msg-"+m.id});}catch(e){}}}
async function savePhoto(file){if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>100*1024){status("اختر صورة JPG أو PNG أو WEBP بحجم لا يتجاوز 100KB.",true);return;}const reader=new FileReader();reader.onload=async()=>{const photo=String(reader.result);localStorage.setItem(PHOTO_KEY,photo);try{await api("wasel_chat_people?user_id=eq."+encodeURIComponent(myId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({avatar_data:photo})});renderPeople();$("chatAvatar").textContent=initials(currentName());status("تم حفظ صورتك في هذا المتصفح وقائمة الأشخاص.");}catch(e){status("حُفظت الصورة محليًا، لكن قاعدة البيانات تحتاج تحديث schema.sql: "+e.message,true);}};reader.readAsDataURL(file);}
async function savePresence(){
 if(!currentName())return;
 if(localStorage.getItem(GHOST_KEY)==="on")return;const presence={user_id:myId,display_name:currentName(),room_id:ROOM,last_seen:new Date().toISOString()};if(currentPhoto())presence.avatar_data=currentPhoto();
 await api("wasel_chat_people?on_conflict=user_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(presence)});
}
async function loadPeople(){
 people=await api("wasel_chat_people?select=user_id,display_name,last_seen,room_id,avatar_data,is_typing,typing_to&room_id=eq."+ROOM+"&order=last_seen.desc&limit=300");
 try{const recent=await api("wasel_chat_messages?select=id,sender_id,recipient_id,body,image_data,created_at,read_at,delivered_at,deleted_at,room_id&room_id=eq."+ROOM+"&order=created_at.desc&limit=1000");lastMessagesByUser={};for(const m of recent){const other=m.sender_id===myId?m.recipient_id:m.sender_id;if(!other||other===myId||lastMessagesByUser[other])continue;lastMessagesByUser[other]=m;}}catch(e){console.warn("Last-message previews unavailable",e);lastMessagesByUser={};}
 const unread=await api("wasel_chat_messages?select=id,sender_id&recipient_id=eq."+encodeURIComponent(myId)+"&read_at=is.null&deleted_at=is.null&room_id=eq."+ROOM+"&limit=1000");
 unreadCounts={};for(const m of unread)unreadCounts[m.sender_id]=(unreadCounts[m.sender_id]||0)+1;
 renderPeople();
}
function renderPeople(){
 const root=$("people");root.replaceChildren();const query=$("peopleSearch").value.trim().toLocaleLowerCase(),now=Date.now(),favorites=JSON.parse(localStorage.getItem(FAVORITES_KEY)||"[]"),onlyFavorites=$("favoritesToggle")?.getAttribute("aria-pressed")==="true";
 const matches=people.filter(p=>(p.display_name||"").toLocaleLowerCase().includes(query)&&(!onlyFavorites||favorites.includes(p.user_id)));$("peopleCount").textContent=String(matches.length);
 if(!matches.length){const e=document.createElement("div");e.className="empty";e.textContent=query?"لا يوجد شخص بهذا الاسم. تأكد أن صديقك فتح الموقع وكتب اسمه.":"لا يوجد أشخاص بعد. افتح الموقع واكتب اسمك.";root.appendChild(e);}
 for(const p of matches){
  const online=now-new Date(p.last_seen).getTime()<90000,b=document.createElement("button");b.type="button";b.className="person"+(p.user_id===selectedId?" active":"");
  const av=document.createElement("span");av.className="avatar";if(p.avatar_data){const img=document.createElement("img");img.src=p.avatar_data;img.alt="";av.appendChild(img);}else av.textContent=initials(p.display_name);
  const meta=document.createElement("span");meta.className="personmeta";
  const top=document.createElement("span");top.className="person-topline";const strong=document.createElement("strong");strong.textContent=(p.display_name||"مستخدم")+(p.user_id===myId?" (أنت)":"");top.appendChild(strong);
  const last=lastMessagesByUser[p.user_id];if(last){const tm=document.createElement("small");tm.className="person-time";tm.textContent=timeLabel(last.created_at);top.appendChild(tm);}
  const preview=document.createElement("span");preview.className="person-preview";const previewText=document.createElement("span");previewText.className="person-preview-text";
  if(last){previewText.textContent=last.deleted_at?"تم حذف الرسالة":last.image_data?(last.body?last.body:"صورة"):last.body||"رسالة";if(last.sender_id===myId){const ticks=document.createElement("span");ticks.className="person-ticks";ticks.textContent=last.read_at?"✓✓":last.delivered_at?"✓✓":"✓";ticks.title=last.read_at?"تمت القراءة":last.delivered_at?"تم التسليم":"تم الإرسال";preview.appendChild(ticks);}}
  else previewText.textContent=p.user_id===myId?"ملاحظاتي":"ابدأ محادثة جديدة";
  preview.appendChild(previewText);meta.append(top,preview);
  const small=document.createElement("small");small.className="personstatus";const dot=document.createElement("i");dot.className="dot "+(online?"online":"offline");dot.setAttribute("aria-label",online?"متصل":"غير متصل");dot.title=online?"متصل الآن":"غير متصل";const label=document.createElement("span");label.className=online?"online":"offline";label.textContent=p.user_id!==myId&&p.is_typing&&p.typing_to===myId?"يكتب الآن…":online?"متصل الآن":"غير متصل · آخر ظهور: "+timeLabel(p.last_seen);small.append(dot,label);meta.append(small);b.append(av,meta);
  if(unreadCounts[p.user_id]){const badge=document.createElement("span");badge.className="unread-badge";badge.textContent=unreadCounts[p.user_id]>99?"99+":String(unreadCounts[p.user_id]);b.appendChild(badge);}
  b.addEventListener("click",()=>selectPerson(p.user_id));const star=document.createElement("button");star.type="button";star.className="favorite-star"+(favorites.includes(p.user_id)?" is-favorite":"");star.innerHTML=uiIcon("star");star.title=favorites.includes(p.user_id)?"إزالة من المفضّلين":"إضافة إلى المفضّلين";star.setAttribute("aria-label",star.title);star.addEventListener("click",e=>{e.stopPropagation();const list=JSON.parse(localStorage.getItem(FAVORITES_KEY)||"[]");const next=list.includes(p.user_id)?list.filter(x=>x!==p.user_id):[...list,p.user_id];localStorage.setItem(FAVORITES_KEY,JSON.stringify(next));renderPeople();});b.appendChild(star);root.appendChild(b);
 }
}
async function selectPerson(id){
 if(id!==myId&&!await unlockChatIfNeeded(id))return;selectedId=id;localStorage.setItem(SELECTED_KEY,id);document.body.classList.add("mobile-chat-open");document.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active",n.dataset.view==="people"));
 const p=people.find(x=>x.user_id===id);$("chatTitle").textContent=p?(id===myId?"ملاحظاتي":p.display_name):"المحادثة";$("chatSubtitle").textContent=p?(id!==myId&&p.is_typing&&p.typing_to===myId?"يكتب الآن…":Date.now()-new Date(p.last_seen).getTime()<90000?"متصل الآن":"آخر ظهور: "+timeLabel(p.last_seen)):"";
 applyChatBackground();const muteMap=JSON.parse(localStorage.getItem(MUTE_KEY)||"{}");$("muteChat").textContent=muteMap[id]?uiIcon("bellOff")+" إلغاء كتم المحادثة":uiIcon("bell")+" كتم المحادثة";$("chatAvatar").replaceChildren();if(p?.avatar_data){const img=document.createElement("img");img.src=p.avatar_data;img.alt="";$("chatAvatar").appendChild(img);}else $("chatAvatar").textContent=initials(p?.display_name||"S");
 $("messageText").disabled=!p||id===myId;$("sendMessage").disabled=!p||id===myId;$("chatImage").disabled=!p||id===myId;$("cameraImage").disabled=!p||id===myId;$("chatDocument").disabled=!p||id===myId;$("chatAudio").disabled=!p||id===myId;
 status(id===myId?"هذه مساحتك الشخصية. اختر صديقك لإرسال رسالة.":"المحادثة مع "+(p?.display_name||"صديقك"));renderPeople();lastSignature="";await loadMessages();
}
function clearReply(){replyTo=null;$("replyPreview").hidden=true;$("replyPreviewText").textContent="";}
function setReply(m){replyTo=m.id;$("replyPreview").hidden=false;$("replyPreviewText").textContent="رد على: "+(m.body||"صورة");$("messageText").focus();}
async function loadMessages(){
 if(!selectedId)return;
 const rows=await api("wasel_chat_messages?select=id,room_id,sender_id,sender_name,recipient_id,body,image_data,audio_data,view_once,viewed_at,created_at,read_at,delivered_at,reply_to,reactions,deleted_at&room_id=eq."+ROOM+"&order=created_at.asc&limit=500");
 const oldIncoming=new Set(messages.filter(m=>m.sender_id===selectedId).map(m=>String(m.id)));
 messages=rows.filter(m=>!(m.body||"").startsWith(CALL_OFFER_PREFIX)&&((m.sender_id===myId&&m.recipient_id===selectedId)||(m.sender_id===selectedId&&m.recipient_id===myId)));
 const incoming=messages.filter(m=>m.sender_id===selectedId&&m.recipient_id===myId&&!m.deleted_at);
 for(const m of incoming){if(!oldIncoming.has(String(m.id))&&lastIncomingId!==0&&!notifiedIds.has(String(m.id))){notifyIncoming(m);notifiedIds.add(String(m.id));}lastIncomingId=Math.max(lastIncomingId,Number(m.id)||0);}
 if(document.visibilityState==="visible"&&localStorage.getItem(GHOST_KEY)!=="on"){
  const undelivered=incoming.filter(m=>!m.delivered_at);if(undelivered.length){const now=new Date().toISOString();try{await api("wasel_chat_messages?id=in.("+undelivered.map(m=>m.id).join(",")+")&recipient_id=eq."+encodeURIComponent(myId)+"&delivered_at=is.null",{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({delivered_at:now})});messages=messages.map(m=>undelivered.some(x=>x.id===m.id)?{...m,delivered_at:now}:m);}catch(e){console.warn("Delivery status unavailable",e);}}
  const unread=incoming.filter(m=>!m.read_at);if(unread.length){const now=new Date().toISOString();try{await api("wasel_chat_messages?id=in.("+unread.map(m=>m.id).join(",")+")&recipient_id=eq."+encodeURIComponent(myId)+"&read_at=is.null",{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({read_at:now})});messages=messages.map(m=>unread.some(x=>x.id===m.id)?{...m,read_at:now}:m);}catch(e){console.warn("Read receipts unavailable",e);}}
 }
 const sig=messages.map(m=>[m.id,m.read_at,m.delivered_at,m.deleted_at,JSON.stringify(m.reactions||{})].join(":")).join("|");if(sig!==lastSignature){lastSignature=sig;renderMessages();}
}
function appendFormattedText(root,text){
 const pattern=/\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;let last=0,match;while((match=pattern.exec(text))){if(match.index>last)root.appendChild(document.createTextNode(text.slice(last,match.index)));const node=document.createElement(match[1]?"strong":match[2]?"em":"code");node.textContent=match[1]||match[2]||match[3];root.appendChild(node);last=pattern.lastIndex;}if(last<text.length)root.appendChild(document.createTextNode(text.slice(last)));
}
function renderMessages(){
 const log=$("chatLog");
 const wasNearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<72;
 const previousScrollTop=log.scrollTop;
 const inputFocused=document.activeElement===$("messageText");
 log.replaceChildren();
 if(!selectedId){const w=document.createElement("div");w.className="welcome";w.innerHTML='<div class="welcomeicon">'+uiIcon("mail")+'</div><h3>ابدأ محادثتك</h3><p>ابحث عن صديقك واختره من القائمة. يجب أن يفتح هو أيضًا الموقع ويكتب اسمه.</p>';log.appendChild(w);return;}
 if(!messages.length&&!pendingForSelected().length){const w=document.createElement("div");w.className="welcome";w.innerHTML='<div class="welcomeicon">'+uiIcon("mail")+'</div><h3>لا توجد رسائل بعد</h3><p>ابدأ المحادثة برسالة ترسلها لصديقك.</p>';log.appendChild(w);}
 const visibleMessages=messageSearchTerm?messages.filter(m=>(m.body||"").toLocaleLowerCase().includes(messageSearchTerm)):messages;
 if(messages.length&&!visibleMessages.length){const no=document.createElement("div");no.className="empty";no.textContent="لا توجد رسائل تطابق البحث.";log.appendChild(no);return;}
 const byId=new Map(messages.map(m=>[String(m.id),m]));
 let previousDay="";for(const m of visibleMessages){
  const dayKey=new Date(m.created_at).toLocaleDateString("en-CA");if(dayKey!==previousDay){const divider=document.createElement("div");divider.className="day-divider";const today=new Date().toLocaleDateString("en-CA"),yesterday=new Date(Date.now()-86400000).toLocaleDateString("en-CA");divider.textContent=dayKey===today?"اليوم":dayKey===yesterday?"الأمس":new Date(m.created_at).toLocaleDateString("ar-TN",{year:"numeric",month:"long",day:"numeric"});log.appendChild(divider);previousDay=dayKey;}
  const bubble=document.createElement("div");bubble.className="bubble "+(m.sender_id===myId?"mine":"")+(m.deleted_at?" deleted":"");
  if(!m.deleted_at&&(m.body||"").startsWith(CALL_LOG_PREFIX)){
   const bits=m.body.split("|");bubble.classList.add("call-history-bubble");
   const icon=document.createElement("span");icon.className="call-bubble-icon";icon.textContent=bits[1]==="video"?"▣":"☎";
   const details=document.createElement("span");details.className="call-bubble-details";
   const heading=document.createElement("strong");heading.textContent=bits[1]==="video"?"مكالمة فيديو":"مكالمة صوتية";
   const sub=document.createElement("small");sub.textContent=bits[2]==="completed"?"تمت المكالمة · "+formatCallDuration(bits[3]):"لم يتم الرد";
   details.append(heading,sub);bubble.append(icon,details);
   const stamp=document.createElement("span");stamp.className="stamp";stamp.textContent=timeLabel(m.created_at);bubble.append(stamp);log.appendChild(bubble);continue;
  }
  if(!m.deleted_at&&m.body&&isGiantEmoji(m.body))bubble.classList.add("giant-emoji");
  if(m.reply_to){const original=byId.get(String(m.reply_to));const q=document.createElement("div");q.className="quoted-message";q.textContent="↪ "+(original?(original.deleted_at?"تم حذف الرسالة":original.body||"صورة"):"رسالة سابقة");bubble.appendChild(q);}
  if(m.deleted_at){const gone=document.createElement("div");gone.className="deleted-text";gone.textContent="تم حذف هذه الرسالة";bubble.appendChild(gone);}
  else {if(m.audio_data){const audio=document.createElement("audio");audio.controls=true;audio.preload="metadata";audio.src=m.audio_data;audio.className="voice-message-player";audio.setAttribute("aria-label","رسالة صوتية");bubble.appendChild(audio);}if(m.image_data){if(m.view_once&&m.viewed_at&&m.sender_id!==myId){const used=document.createElement("div");used.className="view-once-used";used.textContent="✓ تم فتح الصورة لمرة واحدة";bubble.appendChild(used);}else{const img=document.createElement("img");img.alt=m.view_once?"صورة للعرض مرة واحدة — اضغط للفتح":"صورة مرسلة — اضغط للتكبير";img.loading="lazy";img.src=m.image_data;img.style.maxWidth="100%";img.style.borderRadius="12px";img.tabIndex=0;img.role="button";img.addEventListener("click",()=>m.view_once&&m.sender_id!==myId?openViewOnceImage(m):openImageViewer(m.image_data));img.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();m.view_once&&m.sender_id!==myId?openViewOnceImage(m):openImageViewer(m.image_data);}});bubble.appendChild(img);}}if(m.body){const body=document.createElement("div");body.className="formatted-message";appendFormattedText(body,m.body);parseEmoji(body);bubble.appendChild(body);}}
  const reacts=document.createElement("div");reacts.className="reaction-row";const reactions=m.reactions&&typeof m.reactions==="object"?m.reactions:{};Object.entries(reactions).forEach(([emoji,ids])=>{const count=Array.isArray(ids)?ids.length:Number(ids)||0;if(count){const r=document.createElement("button");r.type="button";r.className="reaction-chip";r.textContent=emoji+" "+count;r.addEventListener("click",()=>toggleReaction(m,emoji));parseEmoji(r);reacts.appendChild(r);}});bubble.appendChild(reacts);
  const actions=document.createElement("div");actions.className="message-actions";actions.hidden=true;const toggle=document.createElement("button");toggle.type="button";toggle.className="message-actions-toggle";toggle.innerHTML=uiIcon("chevron")+" خيارات";toggle.setAttribute("aria-expanded","false");toggle.addEventListener("click",()=>{actions.hidden=!actions.hidden;toggle.setAttribute("aria-expanded",String(!actions.hidden));});bubble.appendChild(toggle);const pins=JSON.parse(localStorage.getItem(PIN_KEY)||"{}");const pinKey=String(selectedId||"") + ":" + String(m.id);const pin=document.createElement("button");pin.type="button";pin.innerHTML=uiIcon("pin")+" "+(pins[pinKey]?"مثبتة":"تثبيت");pin.addEventListener("click",()=>{const current=JSON.parse(localStorage.getItem(PIN_KEY)||"{}");if(current[pinKey])delete current[pinKey];else current[pinKey]=true;localStorage.setItem(PIN_KEY,JSON.stringify(current));renderMessages();});actions.appendChild(pin);const reply=document.createElement("button");reply.type="button";reply.innerHTML=uiIcon("reply")+" رد";reply.addEventListener("click",()=>setReply(m));actions.appendChild(reply);
  for(const emoji of ["👍","❤️","😂","😮","😢","🙏"]){const react=document.createElement("button");react.type="button";react.textContent=emoji;react.setAttribute("aria-label","تفاعل "+emoji);parseEmoji(react);react.addEventListener("click",()=>toggleReaction(m,emoji));actions.appendChild(react);}const moreReact=document.createElement("button");moreReact.type="button";moreReact.innerHTML=uiIcon("star");moreReact.title="رمز آخر";moreReact.addEventListener("click",()=>{const choice=prompt("اكتب رمز الإيموجي الذي تريد التفاعل به:","✨");if(choice&&choice.trim())toggleReaction(m,choice.trim());});actions.appendChild(moreReact);
  let pressTimer=null,startX=0,startY=0;bubble.addEventListener("pointerdown",e=>{startX=e.clientX;startY=e.clientY;pressTimer=setTimeout(()=>{pressTimer=null;const choice=prompt("تفاعل مع الرسالة: 👍 ❤️ 😂 😮 😢 🙏 أو اكتب رمزًا آخر","❤️");if(choice&&choice.trim())toggleReaction(m,choice.trim());},650);});bubble.addEventListener("pointerup",e=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}const dx=e.clientX-startX,dy=e.clientY-startY;if(Math.abs(dx)>65&&Math.abs(dy)<45)setReply(m);});bubble.addEventListener("pointercancel",()=>{if(pressTimer)clearTimeout(pressTimer);});bubble.addEventListener("pointermove",e=>{if(Math.abs(e.clientX-startX)>15||Math.abs(e.clientY-startY)>15){if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}}});
  if(m.sender_id===myId&&!m.deleted_at){if(m.body){const edit=document.createElement("button");edit.type="button";edit.textContent="تعديل";edit.addEventListener("click",()=>editMessage(m));actions.appendChild(edit);}const del=document.createElement("button");del.type="button";del.textContent="حذف";del.addEventListener("click",()=>deleteMessage(m));actions.appendChild(del);}bubble.appendChild(actions);
  if(pins[pinKey]){const pinned=document.createElement("small");pinned.className="pinned-label";pinned.innerHTML=uiIcon("pin")+" رسالة مثبتة على هذا الجهاز";bubble.appendChild(pinned);}const stamp=document.createElement("span");stamp.className="stamp";stamp.textContent=(m.sender_id===myId?"أنت":m.sender_name||"صديقك")+" · "+timeLabel(m.created_at);
  if(m.sender_id===myId){const receipt=document.createElement("span");receipt.className="read-receipt"+(m.read_at?" is-read":"");receipt.textContent=m.read_at?" ✓✓":m.delivered_at?" ✓✓":" ✓";receipt.title=m.read_at?"تمت القراءة":m.delivered_at?"تم التسليم":"تم الإرسال";stamp.appendChild(receipt);}
  bubble.appendChild(stamp);log.appendChild(bubble);
 }
 for(const item of pendingForSelected()){
  const bubble=document.createElement("div");bubble.className="bubble mine pending-bubble";
  const body=document.createElement("div");body.className="formatted-message";appendFormattedText(body,item.body);parseEmoji(body);bubble.appendChild(body);
  const stamp=document.createElement("span");stamp.className="stamp";stamp.textContent="معلّقة · لم تُرسل بعد";bubble.appendChild(stamp);
  const actions=document.createElement("div");actions.className="pending-actions";
  const retry=document.createElement("button");retry.type="button";retry.textContent="إعادة الإرسال";retry.disabled=!navigator.onLine;retry.addEventListener("click",()=>retryPendingMessage(item.id));actions.appendChild(retry);
  const edit=document.createElement("button");edit.type="button";edit.textContent="تعديل";edit.addEventListener("click",()=>{const value=prompt("عدّل الرسالة قبل إرسالها:",item.body);if(value===null)return;if(!value.trim()){status("اكتب نصًا أو احذف الرسالة المعلّقة.",true);return;}const q=readPendingQueue().map(x=>x.id===item.id?{...x,body:value.trim()}:x);localStorage.setItem(PENDING_QUEUE_KEY,JSON.stringify(q));renderMessages();updateOfflineBanner();});actions.appendChild(edit);
  const remove=document.createElement("button");remove.type="button";remove.textContent="حذف";remove.addEventListener("click",()=>{localStorage.setItem(PENDING_QUEUE_KEY,JSON.stringify(readPendingQueue().filter(x=>x.id!==item.id)));updateOfflineBanner();renderMessages();status("حُذفت الرسالة المعلّقة من هذا الجهاز.");});actions.appendChild(remove);bubble.appendChild(actions);log.appendChild(bubble);
 }
 if(wasNearBottom&&!inputFocused){log.scrollTop=log.scrollHeight;}else{log.scrollTop=previousScrollTop;}
 }
 async function toggleReaction(m,emoji){const old=m.reactions&&typeof m.reactions==="object"?{...m.reactions}:{};let ids=Array.isArray(old[emoji])?old[emoji].slice():[];ids=ids.includes(myId)?ids.filter(x=>x!==myId):[...ids,myId];if(ids.length)old[emoji]=ids;else delete old[emoji];try{await api("wasel_chat_messages?id=eq."+m.id+"&room_id=eq."+ROOM,{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({reactions:old})});m.reactions=old;lastSignature="";renderMessages();}catch(e){status("تعذر حفظ التفاعل. تحقق من تشغيل schema.sql.",true);}}
async function editMessage(m){
 const next=prompt("عدّل نص الرسالة:",m.body||"");if(next===null)return;const body=next.trim();if(!body){status("لا يمكن حفظ رسالة فارغة؛ احذفها بدلًا من ذلك.",true);return;}if(body.length>2000){status("الحد الأقصى 2000 حرف.",true);return;}try{await api("wasel_chat_messages?id=eq."+m.id+"&sender_id=eq."+encodeURIComponent(myId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({body})});m.body=body;lastSignature="";status("تم تحديث نص الرسالة.");await loadMessages();}catch(e){status("تعذر تعديل الرسالة؛ تحقق من صلاحيات UPDATE في Supabase. "+e.message,true);}
}
function handleChatMenu(action){
 $("chatMenu").hidden=true;$("chatMenuButton").setAttribute("aria-expanded","false");
 if(action==="mute"){return;}if(action==="contact"){openContactProfile();return;}
 if(action==="media"){const imgs=messages.filter(m=>m.image_data&&!m.deleted_at);if(!imgs.length){status("لا توجد صور في هذه المحادثة بعد.");return;}openImageViewer(imgs[0].image_data);return;}
 if(action==="search"){$("chatMenu").hidden=false;$("chatMenuButton").setAttribute("aria-expanded","true");$("messageSearchInput").focus();$("messageSearchInput").scrollIntoView({block:"nearest"});return;}
 if(action==="clear"){if(!confirm("مسح عرض هذه المحادثة؟ لن نحذف الرسائل من قاعدة البيانات."))return;messages=[];lastSignature="";renderMessages();status("تم مسح عرض الرسائل الحالي فقط؛ الرسائل ما زالت على الخادم.");return;}
 if(action==="block"){if(!selectedId)return;const blocked=JSON.parse(localStorage.getItem("wasel-blocked-v1")||"[]");const next=blocked.includes(selectedId)?blocked.filter(x=>x!==selectedId):[...blocked,selectedId];localStorage.setItem("wasel-blocked-v1",JSON.stringify(next));status(next.includes(selectedId)?"تم حظر الشخص على هذا الجهاز فقط.":"تم إلغاء الحظر.");return;}
}
function openContactProfile(){const p=people.find(x=>x.user_id===selectedId);if(!p)return;const root=$("contactProfile");root.replaceChildren();const avatar=document.createElement("div");avatar.className="avatar profile-avatar";if(p.avatar_data){const img=document.createElement("img");img.src=p.avatar_data;img.alt="";avatar.appendChild(img);}else avatar.textContent=initials(p.display_name);const name=document.createElement("h2");name.textContent=p.display_name||"جهة اتصال";const online=Date.now()-new Date(p.last_seen).getTime()<90000;const state=document.createElement("p");state.textContent=online?"متصل الآن":"آخر ظهور: "+timeLabel(p.last_seen);root.append(avatar,name,state);$("contactBio").textContent=p.user_id===myId?(localStorage.getItem(BIO_KEY)||""):"";$("contactModal").hidden=false;}
function openImageViewer(src){$("imageViewerImage").src=src;$("imageViewer").hidden=false;}
async function openViewOnceImage(m){if(m.viewed_at||!m.image_data){status("تم فتح هذه الصورة من قبل.");return;}openImageViewer(m.image_data);try{const stamp=new Date().toISOString();await api("wasel_chat_messages?id=eq."+m.id+"&recipient_id=eq."+encodeURIComponent(myId)+"&viewed_at=is.null",{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({viewed_at:stamp,image_data:null,body:"تم فتح الصورة مرة واحدة"})});m.viewed_at=stamp;m.image_data=null;m.body="تم فتح الصورة مرة واحدة";status("تم فتح الصورة وحذف ملفها من سجل المحادثة.");await loadMessages();}catch(e){closeImageViewer();status("تعذر تسجيل فتح الصورة مرة واحدة. تحقق من تشغيل schema.sql المحدّث.",true);}}
function applyChatBackground(){
 const all=JSON.parse(localStorage.getItem(BG_KEY)||"{}");
 const saved=selectedId?all[selectedId]||"classic":"classic";
 const log=$("chatLog"),picker=$("chatBackground"),note=$("wallpaperNote");
 log.style.backgroundImage="";log.style.backgroundSize="";log.style.backgroundPosition="";
 ["--wall-bubble-sent","--wall-bubble-received","--wall-text","--wall-stamp"].forEach(k=>log.style.removeProperty(k));
 if(saved&&typeof saved==="object"&&saved.type==="custom"&&saved.data){
  log.dataset.background="custom";log.style.backgroundColor=saved.dark?"#101820":"#e8e6e2";
  log.style.backgroundImage="linear-gradient(rgba(0,0,0,.08),rgba(0,0,0,.08)),url('"+saved.data+"')";
  log.style.backgroundSize="cover";log.style.backgroundPosition="center";
  if(saved.dark){log.style.setProperty("--wall-bubble-sent","#145a49");log.style.setProperty("--wall-bubble-received","rgba(28,39,51,.96)");log.style.setProperty("--wall-text","#f5f7fa");log.style.setProperty("--wall-stamp","#d1dbe4");}
  else{log.style.setProperty("--wall-bubble-sent","#d9fdd3");log.style.setProperty("--wall-bubble-received","rgba(255,255,255,.96)");log.style.setProperty("--wall-text","#17212b");log.style.setProperty("--wall-stamp","#52616b");}
  if(picker)picker.value="custom";if(note)note.textContent="خلفية خاصة محفوظة على هذا الجهاز لهذه المحادثة.";return;
 }
 const value=typeof saved==="string"?saved:"classic";
 log.dataset.background=["classic","dark","purple","ocean"].includes(value)?value:"classic";
 if(picker)picker.value=log.dataset.background;
 if(value==="dark"){log.style.setProperty("--wall-bubble-sent","#145a49");log.style.setProperty("--wall-bubble-received","#26343e");log.style.setProperty("--wall-text","#f4f7f8");log.style.setProperty("--wall-stamp","#c4d0d5");if(note)note.textContent="خلفية داكنة مع فقاعات خضراء ورمادية ونص واضح.";}
 else if(value==="purple"){log.style.setProperty("--wall-bubble-sent","#e7d8ff");log.style.setProperty("--wall-bubble-received","#fffaff");log.style.setProperty("--wall-text","#271b3b");log.style.setProperty("--wall-stamp","#6c5a80");if(note)note.textContent="درجات بنفسجية هادئة وفقاعات متناسقة.";}
 else if(value==="ocean"){log.style.setProperty("--wall-bubble-sent","#bfefff");log.style.setProperty("--wall-bubble-received","#f4fbff");log.style.setProperty("--wall-text","#102b3b");log.style.setProperty("--wall-stamp","#496a7a");if(note)note.textContent="خلفية محيطية زرقاء وفقاعات سماوية.";}
 else{log.style.setProperty("--wall-bubble-sent","#d9fdd3");log.style.setProperty("--wall-bubble-received","#ffffff");log.style.setProperty("--wall-text","#17212b");log.style.setProperty("--wall-stamp","#52616b");if(note)note.textContent="خلفية كلاسيكية دافئة وفقاعات خضراء وبيضاء.";}
}
function closeImageViewer(){$("imageViewer").hidden=true;$("imageViewerImage").removeAttribute("src");}
function openProfile(){
 $("profileNameInput").value=currentName();
 $("profileBioInput").value=localStorage.getItem(BIO_KEY)||"";
 $("profileAvatarPreview").replaceChildren();
 if(currentPhoto()){const img=document.createElement("img");img.src=currentPhoto();img.alt="صورتك الشخصية";$("profileAvatarPreview").appendChild(img);}else $("profileAvatarPreview").textContent=initials(currentName());
 $("themeSelect").value=localStorage.getItem(THEME_KEY)||"blue";
 $("soundSetting").checked=localStorage.getItem(SOUND_KEY)!=="off";
 $("notifySetting").checked=localStorage.getItem(NOTIFY_KEY)==="on";
 $("profileError").hidden=true;$("profileModal").hidden=false;
}
function applyTheme(theme){const allowed=["blue","purple","green"];const value=allowed.includes(theme)?theme:"blue";document.documentElement.dataset.theme=value;localStorage.setItem(THEME_KEY,value);const picker=$("themeSelect");if(picker&&picker.value!==value)picker.value=value;}
function applyMode(mode){const value=mode==="dark"?"dark":"light";document.documentElement.dataset.mode=value;localStorage.setItem(MODE_KEY,value);document.documentElement.style.colorScheme=value;const b=$("themeModeToggle");if(b){b.innerHTML=uiIcon(value==="dark"?"sun":"moon")+" "+(value==="dark"?"الوضع الفاتح":"الوضع الداكن");b.setAttribute("aria-pressed",String(value==="dark"));}}
async function saveProfilePhoto(file){if(!file)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>100*1024){$("profileError").textContent="اختر صورة JPG أو PNG أو WEBP بحجم لا يتجاوز 100KB.";$("profileError").hidden=false;return;}const reader=new FileReader();reader.onload=async()=>{localStorage.setItem(PHOTO_KEY,String(reader.result));$("profileAvatarPreview").replaceChildren();const img=document.createElement("img");img.src=String(reader.result);img.alt="صورتك الشخصية";$("profileAvatarPreview").appendChild(img);try{await api("wasel_chat_people?user_id=eq."+encodeURIComponent(myId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({avatar_data:String(reader.result)})});await loadPeople();}catch(e){status("الصورة محفوظة على هذا الجهاز، لكن لم يتأكد حفظها على الخادم: "+e.message,true);}};reader.readAsDataURL(file);}
async function deleteMessage(m){if(!confirm("حذف هذه الرسالة من المحادثة؟"))return;try{await api("wasel_chat_messages?id=eq."+m.id+"&sender_id=eq."+encodeURIComponent(myId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({deleted_at:new Date().toISOString(),})});status("تم وضع علامة الحذف على الرسالة.");await loadMessages();}catch(e){status("تعذر حذف الرسالة. تحقق من تحديث قاعدة البيانات.",true);}}
function readPendingQueue(){try{const q=JSON.parse(localStorage.getItem(PENDING_QUEUE_KEY)||"[]");return Array.isArray(q)?q:[];}catch(e){return [];}}
function writePendingQueue(queue){localStorage.setItem(PENDING_QUEUE_KEY,JSON.stringify(queue));updateOfflineBanner();if(selectedId)renderMessages();}
function pendingForSelected(){return readPendingQueue().filter(item=>item.recipient_id===selectedId&&item.sender_id===myId);}
function updateOfflineBanner(){
 let banner=$("offlineQueueBanner");if(!banner){banner=document.createElement("div");banner.id="offlineQueueBanner";banner.className="offline-queue-banner";banner.setAttribute("role","status");const anchor=document.querySelector(".app")||document.body;anchor.insertBefore(banner,anchor.firstChild);}
 const count=readPendingQueue().length;banner.hidden=navigator.onLine&&count===0;
 banner.textContent=!navigator.onLine?(count?"أنت غير متصل — "+count+" رسالة بانتظار الإرسال.":"أنت غير متصل بالإنترنت؛ يمكنك قراءة الرسائل المحفوظة."):(count?"عاد الاتصال — لديك "+count+" رسالة معلّقة.":"");
 if(count&&navigator.onLine){const retry=document.createElement("button");retry.type="button";retry.textContent="إعادة المحاولة";retry.addEventListener("click",retryAllPending);banner.appendChild(retry);}
}
function queueTextMessage(body,recipientId,quotedId){
 const queue=readPendingQueue();const item={id:crypto.randomUUID(),sender_id:myId,sender_name:currentName(),recipient_id:recipientId,body,reply_to:quotedId||null,created_at:new Date().toISOString(),pending:true};
 queue.push(item);localStorage.setItem(PENDING_QUEUE_KEY,JSON.stringify(queue));updateOfflineBanner();if(selectedId===recipientId)renderMessages();return item;
}
async function retryPendingMessage(id){
 const item=readPendingQueue().find(x=>x.id===id);if(!item)return;
 if(!navigator.onLine){status("لا يوجد اتصال بالإنترنت بعد.",true);updateOfflineBanner();return;}
 try{
  await api("wasel_chat_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({room_id:ROOM,sender_id:item.sender_id,sender_name:item.sender_name,recipient_id:item.recipient_id,body:item.body,image_data:null,reply_to:item.reply_to})});
  localStorage.setItem(PENDING_QUEUE_KEY,JSON.stringify(readPendingQueue().filter(x=>x.id!==id)));updateOfflineBanner();status("تم إرسال الرسالة المعلّقة.");if(selectedId===item.recipient_id)await loadMessages();renderMessages();
 }catch(e){status(e instanceof TypeError?"تعذر الاتصال بالخادم؛ بقيت الرسالة محفوظة محليًا.":"تعذّر إرسال الرسالة: "+e.message,true);updateOfflineBanner();}
}
async function retryAllPending(){for(const item of readPendingQueue()){if(!navigator.onLine)break;await retryPendingMessage(item.id);}}
function installOfflineQueue(){
 updateOfflineBanner();
 window.addEventListener("offline",updateOfflineBanner);
 window.addEventListener("online",()=>{updateOfflineBanner();retryAllPending().catch(()=>{});refresh().catch(()=>{});});
}
async function sendText(){
 const field=$("messageText"),body=field.value.trim();if(!body||!selectedId||selectedId===myId)return;
 const recipientId=selectedId,quotedId=replyTo;
 if(!navigator.onLine){queueTextMessage(body,recipientId,quotedId);field.value="";field.dispatchEvent(new Event("input",{bubbles:true}));clearReply();await setTyping(false);status("حُفظت الرسالة على هذا الجهاز وستحتاج إلى الإرسال عند عودة الإنترنت.");field.focus();return;}
 try{await api("wasel_chat_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({room_id:ROOM,sender_id:myId,sender_name:currentName(),recipient_id:recipientId,body,image_data:null,reply_to:quotedId})});field.value="";field.dispatchEvent(new Event("input",{bubbles:true}));clearReply();await setTyping(false);playSound();status("تم إرسال الرسالة.");await loadMessages();field.focus();}
 catch(e){if(e instanceof TypeError||!navigator.onLine){queueTextMessage(body,recipientId,quotedId);field.value="";field.dispatchEvent(new Event("input",{bubbles:true}));clearReply();status("انقطع الاتصال؛ حُفظت الرسالة محليًا لإعادة المحاولة.",true);}else status("تعذر إرسال الرسالة. شغّل schema.sql المحدّث في Supabase. "+e.message,true);}
}
async function sendImage(file){
 if(!file||!selectedId||selectedId===myId)return;if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){status("اختر صورة JPG أو PNG أو WEBP أو GIF.",true);return;}if(file.size>350*1024){status("اختر صورة أصغر من 350KB حتى يمكن إرسالها.",true);return;}const viewOnce=confirm("هل تريد إرسال هذه الصورة للعرض مرة واحدة فقط؟\\nموافق = عرض مرة واحدة، إلغاء = صورة عادية.");
 const reader=new FileReader();reader.onload=async()=>{try{await api("wasel_chat_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({room_id:ROOM,sender_id:myId,sender_name:currentName(),recipient_id:selectedId,body:"",image_data:reader.result,view_once:viewOnce,reply_to:replyTo})});clearReply();status("تم إرسال الصورة.");await loadMessages();}catch(e){status("تعذر إرسال الصورة. شغّل schema.sql المحدّث في Supabase.",true);}};reader.onerror=()=>status("تعذر قراءة الصورة.",true);reader.readAsDataURL(file);
}
async function setTyping(on){if(localStorage.getItem(GHOST_KEY)==="on"||!currentName()||!selectedId||selectedId===myId)return;try{await api("wasel_chat_people?user_id=eq."+encodeURIComponent(myId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({is_typing:on,typing_to:on?selectedId:null,last_seen:new Date().toISOString()})});}catch(e){}}
function enableMobileSwipeNavigation(){let startX=0,startY=0;const chat=$("chatLog");chat.addEventListener("touchstart",e=>{if(!e.touches||e.touches.length!==1)return;startX=e.touches[0].clientX;startY=e.touches[0].clientY;},{passive:true});chat.addEventListener("touchend",e=>{if(!e.changedTouches||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;if(window.matchMedia("(max-width: 620px)").matches&&document.body.classList.contains("mobile-chat-open")&&dx>100&&Math.abs(dy)<65){mobileBack();}},{passive:true});}enableMobileSwipeNavigation();
function mobileBack(){document.body.classList.remove("mobile-chat-open");document.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active",n.dataset.view==="people"));}
$("mobileBack").addEventListener("click",mobileBack);
$("statusShortcut").addEventListener("click",()=>status("ميزة الحالات اليومية لم تُفعّل بعد."));
$("newChatShortcut").addEventListener("click",()=>{const first=$("people").querySelector(".person");if(first)first.click();else status("لا يوجد أشخاص بعد. اطلب من صديقك فتح الموقع وكتابة اسمه.");});
$("sidebarMenuButton").addEventListener("click",()=>{const menu=$("sidebarMenu");menu.hidden=!menu.hidden;$("sidebarMenuButton").setAttribute("aria-expanded",String(!menu.hidden));});
$("sidebarProfile").addEventListener("click",()=>{$("sidebarMenu").hidden=true;openProfile();});
$("sidebarFavorites").addEventListener("click",()=>{$("sidebarMenu").hidden=true;$("favoritesToggle").click();});
$("sidebarTheme").addEventListener("click",()=>{$("sidebarMenu").hidden=true;applyMode(document.documentElement.dataset.mode==="dark"?"light":"dark");});
document.addEventListener("click",e=>{if(!$("sidebarMenu").hidden&&!$("sidebarMenu").contains(e.target)&&e.target!==$("sidebarMenuButton")){$("sidebarMenu").hidden=true;$("sidebarMenuButton").setAttribute("aria-expanded","false");}});
$("profileOpen")?.addEventListener("click",openProfile);$("editName").addEventListener("click",openProfile);$("chatBackground").addEventListener("change",e=>{const all=JSON.parse(localStorage.getItem(BG_KEY)||"{}");if(selectedId){all[selectedId]=e.target.value==="custom"&&all[selectedId]?.type==="custom"?all[selectedId]:(e.target.value==="custom"?"classic":e.target.value);localStorage.setItem(BG_KEY,JSON.stringify(all));}applyChatBackground();});$("wallpaperImage").addEventListener("change",e=>{const file=e.target.files&&e.target.files[0];e.target.value="";if(!file)return;if(!selectedId){status("اختر محادثة أولًا لتخصيص خلفيتها.",true);return;}if(!["image/jpeg","image/png","image/webp"].includes(file.type)){status("اختر صورة JPG أو PNG أو WEBP.",true);return;}if(file.size>12*1024*1024){status("حجم الصورة كبير؛ اختر صورة أصغر من 12MB.",true);return;}const reader=new FileReader();reader.onerror=()=>status("تعذر قراءة الصورة المختارة.",true);reader.onload=()=>{const img=new Image();img.onerror=()=>status("تعذر فتح الصورة.",true);img.onload=()=>{try{const max=1600,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let total=0,count=0;const step=Math.max(4,Math.floor(pixels.length/12000/4)*4);for(let i=0;i<pixels.length;i+=step){total+=(.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2])/255;count++;}const dark=count?total/count<.48:false,data=canvas.toDataURL("image/jpeg",.78),all=JSON.parse(localStorage.getItem(BG_KEY)||"{}");all[selectedId]={type:"custom",data,dark};localStorage.setItem(BG_KEY,JSON.stringify(all));applyChatBackground();status("تم تطبيق الخلفية الخاصة وتنسيق ألوان الفقاعات تلقائيًا.");}catch(err){status("تعذر تجهيز الصورة؛ جرّب صورة أصغر.",true);}};img.src=String(reader.result);};reader.readAsDataURL(file);});$("muteChat").addEventListener("click",()=>{const all=JSON.parse(localStorage.getItem(MUTE_KEY)||"{}");if(!selectedId)return;all[selectedId]=!all[selectedId];localStorage.setItem(MUTE_KEY,JSON.stringify(all));$("muteChat").innerHTML=uiIcon(all[selectedId]?"bellOff":"bell")+" "+(all[selectedId]?"إلغاء كتم المحادثة":"كتم المحادثة");status(all[selectedId]?"تم كتم إشعارات هذه المحادثة على هذا الجهاز":"تم إلغاء كتم المحادثة");});$("profileClose").addEventListener("click",()=>$("profileModal").hidden=true);$("contactClose").addEventListener("click",()=>$("contactModal").hidden=true);$("chatAvatarButton").addEventListener("click",openContactProfile);$("contactMessageSearch").addEventListener("click",()=>{$("contactModal").hidden=true;const term=prompt("اكتب كلمة للبحث في المحادثة:");if(term){const found=messages.find(m=>(m.body||"").toLowerCase().includes(term.toLowerCase()));status(found?"تم العثور على رسالة مطابقة.":"لا توجد رسالة مطابقة.");}});$("themeModeToggle").addEventListener("click",()=>applyMode(document.documentElement.dataset.mode==="dark"?"light":"dark"));$("messageSearchInput").addEventListener("input",e=>{messageSearchTerm=e.target.value.trim().toLocaleLowerCase();renderMessages();});$("imageViewerClose").addEventListener("click",closeImageViewer);$("imageViewer").addEventListener("click",e=>{if(e.target===$("imageViewer"))closeImageViewer();});$("profilePhotoInput").addEventListener("change",e=>{if(e.target.files?.[0])saveProfilePhoto(e.target.files[0]);e.target.value="";});$("favoritesToggle").addEventListener("click",()=>{const active=$("favoritesToggle").getAttribute("aria-pressed")!=="true";$("favoritesToggle").setAttribute("aria-pressed",String(active));$("favoritesToggle").innerHTML=uiIcon("star")+" "+(active?"عرض الكل":"المفضّلون");renderPeople();});$("themeSelect").addEventListener("change",e=>applyTheme(e.target.value));
document.querySelectorAll(".navitem").forEach(b=>b.addEventListener("click",()=>{const v=b.dataset.view;document.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active",n===b));if(v==="settings"){openProfile();return;}if(v==="people"||v==="chats"){document.body.classList.remove("mobile-chat-open");if(v==="chats"){$("peopleSearch").value="";renderPeople();}else $("peopleSearch").focus({preventScroll:true});}}));
function openNameSetup(){$("displayNameInput").value=currentName();$("nameSetupError").hidden=true;$("nameSetup").hidden=false;$("displayNameInput").focus();}
let incomingInitialized=false;
async function pollIncoming(){
 const rows=await api("wasel_chat_messages?select=id,sender_id,sender_name,body,image_data,created_at,delivered_at&recipient_id=eq."+encodeURIComponent(myId)+"&room_id=eq."+ROOM+"&order=created_at.desc&limit=100");
 const callRows=rows.filter(m=>(m.body||"").startsWith(CALL_OFFER_PREFIX)&&m.sender_id!==myId);
 for(const m of callRows){
  const bits=m.body.split("|");if(bits[2]!=="ringing"||handledCallOffers.has(String(m.id)))continue;
  if(Date.now()-new Date(m.created_at).getTime()>35000){
   handledCallOffers.add(String(m.id));
   try{await api("wasel_chat_messages?id=eq."+encodeURIComponent(m.id)+"&recipient_id=eq."+encodeURIComponent(myId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({body:[CALL_OFFER_PREFIX,bits[1],"missed",String(Date.now())].join("|")})});}catch(e){}
   continue;
  }
  showIncomingCall(m,bits[1]==="video"?"video":"audio");
 }
 const regularRows=rows.filter(m=>!(m.body||"").startsWith(CALL_OFFER_PREFIX));
 const newRows=regularRows.filter(m=>m.sender_id!==myId&&!notifiedIds.has(String(m.id)));
 if(!incomingInitialized){newRows.forEach(m=>notifiedIds.add(String(m.id)));incomingInitialized=true;}
 else newRows.forEach(m=>{notifiedIds.add(String(m.id));notifyIncoming(m);});
 const undelivered=rows.filter(m=>!m.delivered_at&&m.sender_id!==myId);
 if(undelivered.length){const now=new Date().toISOString();await api("wasel_chat_messages?id=in.("+undelivered.map(m=>m.id).join(",")+")&recipient_id=eq."+encodeURIComponent(myId)+"&delivered_at=is.null",{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({delivered_at:now})});}
}
async function refresh(){if(polling||!currentName())return;polling=true;try{await savePresence();await loadPeople();await pollIncoming();if(selectedId)await loadMessages();}catch(e){status("قاعدة البيانات تحتاج تحديث schema.sql في Supabase. "+e.message,true);}finally{polling=false;}}
$("peopleSearch")?.addEventListener("input",renderPeople);
$("deleteAccountButton").addEventListener("click",async()=>{
 if(!currentName()){status("لا يوجد حساب نشط لحذفه.",true);return;}
 if(!confirm("هل تريد حذف حسابك «"+currentName()+"» من قائمة الأشخاص؟\n\nسيُحذف ملفك الشخصي من الخادم وإعدادات الهوية من هذا المتصفح. قد تبقى الرسائل القديمة في قاعدة البيانات."))return;
 const button=$("deleteAccountButton");button.disabled=true;button.textContent="جارٍ الحذف…";
 try{
  const deleted=await api("wasel_chat_people?user_id=eq."+encodeURIComponent(myId)+"&room_id=eq."+encodeURIComponent(ROOM),{method:"DELETE",headers:{"Prefer":"return=representation"}});
  if(!Array.isArray(deleted)||deleted.length===0)throw new Error("لم يُحذف أي سجل. افتح Supabase وشغّل schema.sql لتفعيل صلاحية حذف الحساب، ثم أعد المحاولة.");
  const accounts=JSON.parse(localStorage.getItem(ACCOUNTS_KEY)||"[]").filter(a=>a.id!==myId);
  localStorage.setItem(ACCOUNTS_KEY,JSON.stringify(accounts));
  [PROFILE_KEY,ID_KEY,PHOTO_KEY,BIO_KEY,SELECTED_KEY].forEach(key=>localStorage.removeItem(key));
  $("profileModal").hidden=true;
  alert("تم حذف ملف الحساب من قائمة الأشخاص. ستعود إلى شاشة إدخال الاسم.");
  location.reload();
 }catch(e){
  button.disabled=false;button.textContent="حذف الحساب";
  $("profileError").textContent="تعذر حذف الحساب من الخادم: "+e.message+" — تحقق من تحديث schema.sql في Supabase.";
  $("profileError").hidden=false;
 }
});
$("profileForm").addEventListener("submit",async event=>{event.preventDefault();const name=$("profileNameInput").value.trim();if(name.length<2){$("profileError").textContent="اكتب اسمًا من حرفين على الأقل.";$("profileError").hidden=false;return;}const changed=name!==currentName();localStorage.setItem(PROFILE_KEY,name.slice(0,30));localStorage.setItem(BIO_KEY,$("profileBioInput").value.trim().slice(0,120));localStorage.setItem(SOUND_KEY,$("soundSetting").checked?"on":"off");if($("notifySetting").checked){await enableNotifications();}else{localStorage.setItem(NOTIFY_KEY,"off");}applyTheme($("themeSelect").value);$("identity").textContent="أهلاً، "+name;$("profileModal").hidden=true;try{await savePresence();await loadPeople();}catch(e){status("حُفظت التعديلات محليًا لكن تعذر تحديث الملف على الخادم: "+e.message,true);}if(changed&&selectedId){const p=people.find(x=>x.user_id===selectedId);if(p)$("chatTitle").textContent=p.display_name;}renderPeople();});
$("nameSetupForm").addEventListener("submit",async event=>{event.preventDefault();const name=$("displayNameInput").value.trim();if(name.length<2){$("nameSetupError").textContent="اكتب اسمًا من حرفين على الأقل.";$("nameSetupError").hidden=false;return;}localStorage.setItem(PROFILE_KEY,name.slice(0,30));$("nameSetup").hidden=true;$("identity").textContent="أهلاً، "+name;$("messageText").disabled=true;$("sendMessage").disabled=true;$("chatImage").disabled=true;$("setupNotice").hidden=false;$("setupNotice").textContent="اختر اسم صديقك من القائمة. يجب أن يفتح صديقك الموقع ويكتب اسمه أيضًا.";selectedId=null;lastSignature="";renderMessages();renderPeople();await refresh();});

let voiceRecorder=null,voiceChunks=[],voiceStartedAt=0;
async function sendVoiceBlob(blob){
 if(!selectedId||selectedId===myId){status("اختر صديقًا أولًا لإرسال رسالة صوتية.",true);return;}
 if(!blob||!blob.size){status("لم يتم تسجيل صوت. حاول مرة أخرى.",true);return;}
 if(blob.size>350*1024){status("التسجيل كبير جدًا. سجّل مقطعًا أقصر من 45 ثانية.",true);return;}
 const reader=new FileReader();
 reader.onload=async()=>{try{
  await api("wasel_chat_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({room_id:ROOM,sender_id:myId,sender_name:currentName(),recipient_id:selectedId,body:"",image_data:null,audio_data:reader.result,reply_to:replyTo})});
  clearReply();status("تم إرسال الرسالة الصوتية.");await loadMessages();
 }catch(e){status("تعذر إرسال التسجيل. تأكد من تشغيل تحديث schema.sql في Supabase. "+e.message,true);}};
 reader.onerror=()=>status("تعذر قراءة التسجيل الصوتي.",true);
 reader.readAsDataURL(blob);
}
async function toggleVoiceRecording(){
 if(voiceRecorder&&voiceRecorder.state==="recording"){voiceRecorder.stop();$("sendMessage").classList.remove("recording");$("sendIcon").innerHTML=uiIcon("mic");return;}
 if(!selectedId||selectedId===myId){status("اختر صديقًا أولًا لإرسال رسالة صوتية.",true);return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status("تسجيل الصوت غير مدعوم في هذا المتصفح. افتح الموقع عبر HTTPS على متصفح حديث.",true);return;}
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const options=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?{mimeType:"audio/webm;codecs=opus",audioBitsPerSecond:24000}:{audioBitsPerSecond:24000};
  voiceChunks=[];voiceRecorder=new MediaRecorder(stream,options);voiceStartedAt=Date.now();
  voiceRecorder.ondataavailable=e=>{if(e.data&&e.data.size)voiceChunks.push(e.data);};
  voiceRecorder.onerror=()=>status("حدث خطأ أثناء تسجيل الصوت.",true);
  voiceRecorder.onstop=()=>{const blob=new Blob(voiceChunks,{type:voiceRecorder.mimeType||"audio/webm"});stream.getTracks().forEach(t=>t.stop());voiceRecorder=null;$("sendMessage").classList.remove("recording");$("sendIcon").innerHTML=uiIcon("mic");if(Date.now()-voiceStartedAt<500){status("سجّل لمدة ثانية على الأقل قبل الإرسال.",true);return;}sendVoiceBlob(blob);};
  voiceRecorder.start();$("sendMessage").classList.add("recording");$("sendIcon").textContent="■";status("جارٍ التسجيل… اضغط زر التسجيل مرة أخرى للإرسال. الحد الأقصى 45 ثانية.");
  setTimeout(()=>{if(voiceRecorder&&voiceRecorder.state==="recording"){status("انتهت مدة التسجيل القصوى.");voiceRecorder.stop();$("sendMessage").classList.remove("recording");}},45000);
 }catch(e){status("لم نتمكن من تشغيل الميكروفون. اسمح للموقع باستخدام الميكروفون ثم أعد المحاولة.",true);}
}

$("messageForm").addEventListener("submit",e=>{e.preventDefault();if(!$("messageText").value.trim()){toggleVoiceRecording();return;}if(voiceRecorder&&voiceRecorder.state==="recording"){status("أوقف التسجيل أولًا.",true);return;}sendText();});
$("chatImage").addEventListener("change",e=>{const f=e.target.files&&e.target.files[0];if(f)sendImage(f);e.target.value="";});
$("messageText").addEventListener("input",()=>{const hasText=Boolean($("messageText").value.trim());$("sendMessage").classList.toggle("has-text",hasText);$("sendIcon").innerHTML=uiIcon(hasText?"send":"mic");$("sendMessage").setAttribute("aria-label",hasText?"إرسال الرسالة":"بدء أو إنهاء تسجيل رسالة صوتية");setTyping(true);clearTimeout(typingTimer);typingTimer=setTimeout(()=>setTyping(false),1800);});
$("messageText").addEventListener("blur",()=>setTyping(false));

function isGiantEmoji(text){const value=String(text||"").trim();if(!value)return false;const segments=typeof Intl.Segmenter==="function"?[...new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(value)].map(x=>x.segment):Array.from(value);if(segments.length<1||segments.length>3)return false;return segments.every(g=>/^(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?(?:[\u{1F3FB}-\u{1F3FF}])?)*|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3)$/u.test(g));}
async function pinHash(pin){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(pin));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");}
async function unlockChatIfNeeded(id){const locks=JSON.parse(localStorage.getItem(CHAT_LOCKS_KEY)||"{}");if(!locks[id])return true;const code=prompt("هذه المحادثة مقفلة. أدخل الرمز السري:");if(code===null)return false;if(await pinHash(code)!==locks[id]){status("الرمز غير صحيح؛ بقيت المحادثة مقفلة.",true);return false;}return true;}
async function setChatLock(){if(!selectedId||selectedId===myId){status("اختر محادثة صديق أولًا.",true);return;}const locks=JSON.parse(localStorage.getItem(CHAT_LOCKS_KEY)||"{}");if(locks[selectedId]){const old=prompt("أدخل الرمز الحالي لإلغاء قفل المحادثة:");if(old===null)return;if(await pinHash(old)!==locks[selectedId]){status("الرمز غير صحيح.",true);return;}delete locks[selectedId];localStorage.setItem(CHAT_LOCKS_KEY,JSON.stringify(locks));status("تم إلغاء قفل المحادثة على هذا الجهاز.");return;}const pin=prompt("أنشئ رمزًا رقميًا من 4 أرقام على الأقل:");if(pin===null)return;if(!/^\d{4,12}$/.test(pin)){status("استخدم 4 إلى 12 رقمًا فقط.",true);return;}const confirmPin=prompt("أعد كتابة الرمز للتأكيد:");if(pin!==confirmPin){status("الرمزان غير متطابقين.",true);return;}locks[selectedId]=await pinHash(pin);localStorage.setItem(CHAT_LOCKS_KEY,JSON.stringify(locks));status("قُفلت المحادثة على هذا الجهاز فقط.");}
function ensureLocalAccount(){const list=JSON.parse(localStorage.getItem(ACCOUNTS_KEY)||"[]");if(currentName()&&!list.some(a=>a.id===myId)){list.push({id:myId,name:currentName()});localStorage.setItem(ACCOUNTS_KEY,JSON.stringify(list));}}
function switchLocalAccount(){let list=JSON.parse(localStorage.getItem(ACCOUNTS_KEY)||"[]");if(currentName()&&!list.some(a=>a.id===myId))list.push({id:myId,name:currentName()});const action=prompt("الحسابات المحفوظة:\n"+(list.map((a,i)=>(i+1)+". "+a.name).join("\n")||"لا توجد حسابات")+"\n\nاكتب رقم حساب للتبديل إليه، أو + لإضافة حساب جديد:");if(action===null)return;if(action.trim()==="+"){const name=prompt("اسم الحساب الجديد:");if(!name||name.trim().length<2)return;myId=crypto.randomUUID();localStorage.setItem(ID_KEY,myId);localStorage.setItem(PROFILE_KEY,name.trim().slice(0,30));list.push({id:myId,name:name.trim().slice(0,30)});}else{const n=Number(action)-1;if(!Number.isInteger(n)||n<0||n>=list.length){status("لم يتم اختيار حساب صحيح.",true);return;}myId=list[n].id;localStorage.setItem(ID_KEY,myId);localStorage.setItem(PROFILE_KEY,list[n].name);}localStorage.setItem(ACCOUNTS_KEY,JSON.stringify(list));selectedId=null;localStorage.removeItem(SELECTED_KEY);messages=[];lastSignature="";$("identity").textContent="أهلاً، "+currentName();$("messageText").disabled=true;$("sendMessage").disabled=true;$("chatImage").disabled=true;$("nameSetup").hidden=true;renderMessages();renderPeople();refresh();status("تم التبديل محليًا إلى "+currentName()+".");}
let autoLockTimer=null,autoLockOverlay=null,autoLockListenersReady=false;
function setupAutoLock(){const reset=()=>{clearTimeout(autoLockTimer);const mins=Number(localStorage.getItem(AUTO_LOCK_KEY)||0);if(mins>0&&localStorage.getItem(MASTER_PIN_KEY))autoLockTimer=setTimeout(showAppLock,mins*60000);};if(!autoLockListenersReady){["pointerdown","keydown","touchstart","mousemove"].forEach(ev=>document.addEventListener(ev,reset,{passive:true}));document.addEventListener("visibilitychange",reset);autoLockListenersReady=true;}reset();}
function showAppLock(){if(autoLockOverlay){autoLockOverlay.hidden=false;return;}const overlay=document.createElement("div");overlay.className="modal-overlay app-lock-overlay";const card=document.createElement("section");card.className="modal-card";const title=document.createElement("h2");title.textContent="التطبيق مقفل";const note=document.createElement("p");note.textContent="أدخل رمز التطبيق للمتابعة.";const input=document.createElement("input");input.type="password";input.inputMode="numeric";input.autocomplete="current-password";input.placeholder="رمز المرور";const btn=document.createElement("button");btn.className="primary-button";btn.textContent="فتح التطبيق";const err=document.createElement("p");err.className="nameerror";err.hidden=true;const unlock=async()=>{if(await pinHash(input.value)===localStorage.getItem(MASTER_PIN_KEY)){overlay.hidden=true;input.value="";err.hidden=true;setupAutoLock();}else{err.textContent="الرمز غير صحيح.";err.hidden=false;input.value="";input.focus();}};btn.addEventListener("click",unlock);input.addEventListener("keydown",e=>{if(e.key==="Enter")unlock();});card.append(title,note,input,err,btn);overlay.appendChild(card);document.body.appendChild(overlay);autoLockOverlay=overlay;input.focus();}
async function configureAutoLock(){const existing=localStorage.getItem(MASTER_PIN_KEY)||"";const code=prompt(existing?"أدخل رمز التطبيق الحالي لتغيير الإعدادات، أو اكتب إزالة لحذفه:":"أنشئ رمزًا رئيسيًا للتطبيق (4 أرقام على الأقل):");if(code===null)return;if(existing&&code==="إزالة"){localStorage.removeItem(MASTER_PIN_KEY);localStorage.setItem(AUTO_LOCK_KEY,"0");status("تم إيقاف قفل التطبيق التلقائي.");return;}if(existing&&code!=="إزالة"&&await pinHash(code)!==existing){status("الرمز الحالي غير صحيح.",true);return;}const pin=existing||prompt("أكد رمز التطبيق الجديد:");if(!existing&&(!/^\d{4,12}$/.test(code)||code!==pin)){status("استخدم رمزًا رقميًا من 4 إلى 12 رقمًا متطابقًا.",true);return;}if(!existing)localStorage.setItem(MASTER_PIN_KEY,await pinHash(code));const mins=prompt("القفل بعد كم دقيقة من عدم النشاط؟ اكتب 1 أو 5 أو 15 أو 30:","5");if(!["1","5","15","30"].includes(mins||"")){status("لم يتغير المؤقت.",true);return;}localStorage.setItem(AUTO_LOCK_KEY,mins);setupAutoLock();status("تم إعداد القفل التلقائي بعد "+mins+" دقيقة.");}
function installPrivacyControls(){const menu=$("sidebarMenu");if(!menu||menu.dataset.privacyReady)return;menu.dataset.privacyReady="1";const add=(id,label,fn)=>{const b=document.createElement("button");b.id=id;b.type="button";b.textContent=label;b.addEventListener("click",()=>{menu.hidden=true;fn();});menu.appendChild(b);};add("quickAccountSwitch","تبديل الحسابات",switchLocalAccount);add("autoLockSetup","قفل التطبيق التلقائي",configureAutoLock);add("ghostModeToggle",localStorage.getItem(GHOST_KEY)==="on"?"إيقاف وضع التخفي":"تفعيل وضع التخفي",()=>{const on=localStorage.getItem(GHOST_KEY)!=="on";localStorage.setItem(GHOST_KEY,on?"on":"off");$("ghostModeToggle").textContent=on?"إيقاف وضع التخفي":"تفعيل وضع التخفي";status(on?"تم تفعيل التخفي على هذا الجهاز؛ لن تُحدّث حالة الاتصال أو القراءة.":"تم إيقاف وضع التخفي.");});const chatMenu=$("chatMenu");if(chatMenu&&!chatMenu.querySelector("#chatLockToggle")){const b=document.createElement("button");b.id="chatLockToggle";b.type="button";b.textContent="قفل هذه المحادثة برمز";b.addEventListener("click",()=>{chatMenu.hidden=true;setChatLock();});chatMenu.appendChild(b);}}


function setupMobileNavigation(){
 const nav=document.querySelector(".mobile-nav");if(!nav||nav.dataset.ready)return;nav.dataset.ready="1";
 nav.querySelectorAll(".navitem").forEach(button=>button.addEventListener("click",()=>{
  nav.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active",n===button));
  if(button.dataset.view==="people"){document.body.classList.remove("mobile-chat-open");$("peopleSearch").blur();}
  if(button.dataset.view==="settings"){openProfile();}
 }));
}
function setupMobileKeyboard(){
 const field=$("messageText"),log=$("chatLog");if(!field||field.dataset.keyboardReady)return;field.dataset.keyboardReady="1";
 const updateHeight=()=>{if(window.visualViewport&&window.innerWidth<=620){document.documentElement.style.setProperty("--visual-height",Math.round(window.visualViewport.height)+"px");}};
 const scrollToLatest=()=>{requestAnimationFrame(()=>{updateHeight();log.scrollTop=log.scrollHeight;});};
 field.addEventListener("focus",()=>{document.body.classList.add("keyboard-open");scrollToLatest();setTimeout(scrollToLatest,180);setTimeout(scrollToLatest,360);});
 field.addEventListener("blur",()=>document.body.classList.remove("keyboard-open"));
 field.addEventListener("input",()=>{field.style.height="auto";field.style.height=Math.min(field.scrollHeight,100)+"px";});
 if(window.visualViewport){window.visualViewport.addEventListener("resize",()=>{updateHeight();if(document.activeElement===field)scrollToLatest();});window.visualViewport.addEventListener("scroll",updateHeight);}
 window.addEventListener("orientationchange",updateHeight);updateHeight();
}

let lastBackgroundSync=Date.now();
function start(){setupMobileNavigation();setupMobileKeyboard();installPrivacyControls();installOfflineQueue();setupExtras();ensureLocalAccount();setupAutoLock();applyTheme(localStorage.getItem(THEME_KEY)||"blue");applyMode("dark");const name=currentName();$("nameSetup").hidden=Boolean(name);$("identity").textContent=name?"أهلاً، "+name:"لم تختر اسمًا بعد";$("setupNotice").hidden=true;$("setupNotice").textContent=""; $("messageText").disabled=true;$("sendMessage").disabled=true;$("chatImage").disabled=true;renderPeople();if(name)refresh();setInterval(()=>{if(document.visibilityState==="visible"){lastBackgroundSync=Date.now();refresh();}else if(Date.now()-lastBackgroundSync>=3000){lastBackgroundSync=Date.now();refresh();}},3000);}

const manualRefreshButton=$("manualRefresh");if(manualRefreshButton&&!manualRefreshButton.dataset.ready){manualRefreshButton.dataset.ready="1";manualRefreshButton.addEventListener("click",async()=>{if(manualRefreshButton.disabled)return;manualRefreshButton.disabled=true;manualRefreshButton.setAttribute("aria-busy","true");manualRefreshButton.title="جارٍ تحديث التطبيق…";try{if("serviceWorker" in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(reg=>reg.unregister()));}if("caches" in window){const keys=await caches.keys();await Promise.all(keys.map(key=>caches.delete(key)));}}catch(e){}const url=new URL(window.location.href);url.searchParams.set("refresh",String(Date.now()));window.location.replace(url.toString());});}
// Close pop-up menus and profile/settings dialogs when the user taps outside them.
document.addEventListener("click",function(event){
 const target=event.target;
 const closeMenu=(menuId,buttonId)=>{
  const menu=$(menuId),button=buttonId?$(buttonId):null;
  if(menu&&!menu.hidden&&!menu.contains(target)&&(!button||!button.contains(target))){
   menu.hidden=true;
   if(button)button.setAttribute("aria-expanded","false");
   if(button&&buttonId==="attachmentToggle")button.classList.remove("is-active");
  }
 };
 closeMenu("sidebarMenu","sidebarMenuButton");
 closeMenu("chatMenu","chatMenuButton");
 closeMenu("attachmentMenu","attachmentToggle");
 const emojiPanel=$("emojiPanel"),emojiButton=$("emojiPicker");
 if(emojiPanel&&!emojiPanel.contains(target)&&(!emojiButton||!emojiButton.contains(target))){
  emojiPanel.remove();
  emojiButton?.classList.remove("is-active");
 }
 ["profileModal","contactModal","imageViewer"].forEach(id=>{
  const overlay=$(id);
  if(overlay&&target===overlay){
   overlay.hidden=true;
   if(id==="imageViewer")$("imageViewerImage")?.removeAttribute("src");
  }
 });
});
document.addEventListener("keydown",function(event){
 if(event.key!=="Escape")return;
 ["sidebarMenu","chatMenu","attachmentMenu","profileModal","contactModal","imageViewer"].forEach(id=>{const el=$(id);if(el)el.hidden=true;});
 $("sidebarMenuButton")?.setAttribute("aria-expanded","false");
 $("chatMenuButton")?.setAttribute("aria-expanded","false");
 $("attachmentToggle")?.setAttribute("aria-expanded","false");
 $("attachmentToggle")?.classList.remove("is-active");
 $("emojiPanel")?.remove();
 $("emojiPicker")?.classList.remove("is-active");
 $("imageViewerImage")?.removeAttribute("src");
});
start();
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&selectedId)loadMessages().catch(()=>{});});
