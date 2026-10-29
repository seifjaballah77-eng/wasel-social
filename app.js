// Seif Messages — lightweight public-room chat prototype.
// This app uses browser-stored IDs, not authenticated accounts. Do not use for sensitive conversations.
const $ = id => document.getElementById(id);
const SUPABASE_URL = "https://qlcrvffejuscbftjotmp.supabase.co";
const SUPABASE_KEY = "sb_publishable_nY14ZzU_YiOfBrySQlBuFA_G-jg2VOc";
const ROOM = "wasel-friends", PROFILE_KEY = "wasel-personal-name-v1", ID_KEY = "wasel-chat-user-id-v1";
const PHOTO_KEY = "wasel-chat-photo-v1", SOUND_KEY = "wasel-chat-sound-v1", NOTIFY_KEY = "wasel-chat-notify-v1", BIO_KEY = "wasel-chat-bio-v1", FAVORITES_KEY = "wasel-chat-favorites-v1", THEME_KEY = "wasel-chat-theme-v1", PIN_KEY = "wasel-chat-pins-v1", BG_KEY = "wasel-chat-backgrounds-v1", MUTE_KEY = "wasel-chat-muted-v1", MODE_KEY = "wasel-chat-mode-v1", SELECTED_KEY = "wasel-chat-selected-v1";
const API = SUPABASE_URL + "/rest/v1/";
const myId = localStorage.getItem(ID_KEY) || crypto.randomUUID();
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

let activeCallApi=null,callScriptPromise=null;
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
async function startCall(kind){
 if(!selectedId||selectedId===myId){status("اختر صديقًا من قائمة الأشخاص أولًا.",true);return;}
 const person=people.find(p=>p.user_id===selectedId);if(!person){status("لم يتم العثور على جهة الاتصال. حدّث قائمة الأشخاص أولًا.",true);return;}
 const overlay=ensureCallModal();overlay.hidden=false;$("callModalTitle").textContent=(kind==="video"?"مكالمة فيديو مع ":"مكالمة صوتية مع ")+(person.display_name||"صديقك");$("callModalNote").textContent="للانضمام من الجهاز الآخر، افتح المحادثة نفسها واضغط زر الاتصال نفسه. هذه النسخة التجريبية لا ترسل رنينًا تلقائيًا بعد.";
 const mount=$("jitsiMount");mount.replaceChildren();status("جارٍ الاتصال بخدمة المكالمات…");
 try{
  await loadJitsiScript();
  if(overlay.hidden)return;
  const roomName="seifmessages-"+[myId,selectedId].sort().join("-");
  activeCallApi=new window.JitsiMeetExternalAPI("meet.jit.si",{roomName,width:"100%",height:"100%",parentNode:mount,lang:"ar",userInfo:{displayName:currentName()||"مستخدم"},configOverwrite:{startWithAudioMuted:false,startWithVideoMuted:kind==="audio",prejoinConfig:{enabled:false},disableDeepLinking:true},interfaceConfigOverwrite:{TOOLBAR_BUTTONS:kind==="audio"?["microphone","hangup","chat","settings","tileview"]:["microphone","camera","hangup","chat","settings","tileview"]}});
  activeCallApi.addListener("videoConferenceJoined",()=>status("أنت داخل المكالمة. اسم الغرفة مشترك بين الطرفين."));
  activeCallApi.addListener("participantJoined",()=>{$("callModalNote").textContent="انضم صديقك إلى المكالمة.";status("انضم الطرف الآخر إلى المكالمة.");});
  activeCallApi.addListener("participantLeft",()=>{$("callModalNote").textContent="غادر أحد المشاركين المكالمة.";});
  activeCallApi.addListener("readyToClose",endCall);
  activeCallApi.addListener("errorOccurred",e=>{status("حدث خطأ في الاتصال: "+(e?.message||"تحقق من صلاحيات الكاميرا والميكروفون."),true);});
 }catch(e){endCall();status("تعذر بدء المكالمة: "+e.message,true);}
}
function endCall(){
 const apiInstance=activeCallApi;activeCallApi=null;
 if(apiInstance){try{apiInstance.executeCommand("hangup");}catch(e){}try{apiInstance.dispose();}catch(e){}}
 const overlay=$("callModal");if(overlay)overlay.hidden=true;const mount=$("jitsiMount");if(mount)mount.replaceChildren();status("انتهت المكالمة.");
}

const UI_ICON_PATHS={"chevron":"<path d=\"m7 10 5 5 5-5\"/>","status":"<circle cx=\"12\" cy=\"12\" r=\"8\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","edit":"<path d=\"m14 5 5 5M4 20l4-.8L19 8a2 2 0 0 0-3-3L5 16Z\"/>","more":"<circle cx=\"12\" cy=\"5\" r=\"1\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"19\" r=\"1\"/>","search":"<circle cx=\"10\" cy=\"10\" r=\"7\"/><path d=\"m15 15 5 5\"/>","phone":"<path d=\"M7 3H5a2 2 0 0 0-2 2 16 16 0 0 0 14 14 2 2 0 0 0 2-2v-2l-5-2-2 2a12 12 0 0 1-5-5l2-2Z\"/>","video":"<rect x=\"3\" y=\"6\" width=\"13\" height=\"12\" rx=\"2\"/><path d=\"m16 10 5-3v10l-5-3\"/>","mail":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m4 7 8 6 8-6\"/>","paperclip":"<path d=\"m8 12 7-7a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8\"/>","image":"<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><circle cx=\"8\" cy=\"9\" r=\"1.5\"/><path d=\"m21 15-5-5L5 20\"/>","camera":"<path d=\"M4 7h3l2-3h6l2 3h3v13H4Z\"/><circle cx=\"12\" cy=\"13\" r=\"4\"/>","file":"<path d=\"M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6\"/>","music":"<path d=\"M9 18V5l12-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"18\" cy=\"16\" r=\"3\"/>","pin":"<path d=\"m16 3 5 5-4 1-4 4 2 5-2 2-4-6-5-1 4-4 1-4Z\"/>","contact":"<circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 21a8 8 0 0 1 16 0\"/>","poll":"<path d=\"M4 19h16M6 16V9m6 7V4m6 12v-5\"/>","chat":"<path d=\"M20 11.5a7.5 7.5 0 0 1-8 7.5 8.6 8.6 0 0 1-3.7-.8L4 20l1.3-3.5A7.2 7.2 0 0 1 4 12c0-4.4 3.6-8 8-8s8 3.1 8 7.5Z\"/>","people":"<circle cx=\"9\" cy=\"8\" r=\"3.5\"/><path d=\"M2 20a7 7 0 0 1 14 0M16 5a3.5 3.5 0 0 1 0 7M18 14a5 5 0 0 1 4 5\"/>","settings":"<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19 15 21 16l-2 3-2-1-2 1v2h-4v-2l-2-1-2 1-2-3 2-1v-2l-2-1 2-3 2 1 2-1V7h4v2l2 1 2-1 2 3-2 1Z\"/>","send":"<path d=\"m22 2-7 20-4-9-9-4Z\"/><path d=\"M22 2 11 13\"/>","mic":"<rect x=\"9\" y=\"3\" width=\"6\" height=\"12\" rx=\"3\"/><path d=\"M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8\"/>","bell":"<path d=\"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4\"/>","bellOff":"<path d=\"M18 8a6 6 0 0 0-11-3M6 8c0 7-3 7-3 9h14M10 21h4M3 3l18 18\"/>","star":"<path d=\"m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z\"/>","close":"<path d=\"m6 6 12 12M18 6 6 18\"/>","smile":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01\"/>","reply":"<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h9a7 7 0 0 1 7 7v2\"/>","sun":"<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42\"/>"};
function uiIcon(name,cls="ui-icon"){const path=UI_ICON_PATHS[name];if(!path)return "";return '<svg class="'+cls+'" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';}
function parseEmoji(root){if(root&&window.twemoji)window.twemoji.parse(root,{base:"https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/",folder:"svg",ext:".svg"});}
function setupExtras(){
 const attach=$("attachmentToggle"),menu=$("attachmentMenu");
 if(attach&&!attach.dataset.ready){attach.dataset.ready="1";attach.addEventListener("click",()=>{menu.hidden=!menu.hidden;attach.setAttribute("aria-expanded",String(!menu.hidden));});}
 [$("chatDocument"),$("chatAudio")].forEach(input=>input?.addEventListener("change",()=>{if(input.files?.[0])status("إرسال الملفات غير مفعّل بعد؛ نحتاج ربط Supabase Storage.",true);input.value="";}));
 $("cameraImage")?.addEventListener("change",e=>{if(e.target.files?.[0])sendImage(e.target.files[0]);e.target.value="";});
 menu?.querySelectorAll("[data-attachment]").forEach(b=>b.addEventListener("click",()=>{menu.hidden=true;if(b.dataset.attachment==="location")status("مشاركة الموقع غير مفعّلة بعد.");else if(b.dataset.attachment==="contact")status("مشاركة جهات الاتصال غير مفعّلة بعد.");else status("إنشاء استطلاع رأي يحتاج جداول خاصة في قاعدة البيانات.");}));
 document.querySelectorAll(".head-icon").forEach(b=>{if(b.dataset.ready)return;b.dataset.ready="1";b.addEventListener("click",()=>{if(b.id==="chatMenuButton"){const m=$("chatMenu");m.hidden=!m.hidden;b.setAttribute("aria-expanded",String(!m.hidden));return;}startCall(b.id==="videoCall"?"video":"audio");});});
 $("chatMenu")?.querySelectorAll("[data-menu-action]").forEach(b=>{if(b.dataset.ready)return;b.dataset.ready="1";b.addEventListener("click",()=>handleChatMenu(b.dataset.menuAction));});
 const tools=document.querySelector(".composer-tools");
 if(!$("emojiPicker")){
  const b=document.createElement("button");b.type="button";b.id="emojiPicker";b.className="attach-button emoji-trigger";b.innerHTML=uiIcon("smile");b.title="كل الإيموجيات";b.setAttribute("aria-label","فتح لوحة الإيموجي");
  b.addEventListener("click",()=>{let panel=$("emojiPanel");if(panel){panel.remove();return;}panel=document.createElement("section");panel.id="emojiPanel";panel.className="emoji-panel emoji-picker-full";panel.setAttribute("aria-label","لوحة الإيموجي");
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
   draw();tools.insertAdjacentElement("afterend",panel);search.focus();
  });tools.appendChild(b);
 }
 const form=$("messageForm");if(!$("replyPreview")){const p=document.createElement("div");p.id="replyPreview";p.className="reply-preview";p.hidden=true;const label=document.createElement("span");label.id="replyPreviewText";p.appendChild(label);const cancel=document.createElement("button");cancel.type="button";cancel.innerHTML=uiIcon("close");cancel.setAttribute("aria-label","إلغاء الرد");cancel.addEventListener("click",clearReply);p.appendChild(cancel);form.parentElement.insertBefore(p,form);}
}
function playSound(){if(localStorage.getItem(SOUND_KEY)==="off")return;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.type="sine";o.frequency.value=740;g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.08,c.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.16);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.17);o.onended=()=>c.close();}catch(e){}}
async function enableNotifications(){if(!("Notification"in window)){status("المتصفح لا يدعم إشعارات سطح المكتب.",true);return false;}try{const p=await Notification.requestPermission();if(p==="granted"){localStorage.setItem(NOTIFY_KEY,"on");status("تم السماح بإشعارات المتصفح.");return true;}localStorage.setItem(NOTIFY_KEY,"off");status("لم يتم السماح بالإشعارات. يمكنك تفعيلها من إعدادات المتصفح.",true);return false;}catch(e){status("تعذر تفعيل الإشعارات.",true);return false;}}
function notifyIncoming(m){if(!JSON.parse(localStorage.getItem(MUTE_KEY)||"{}")[m.sender_id])playSound();if(localStorage.getItem(NOTIFY_KEY)==="on"&&!JSON.parse(localStorage.getItem(MUTE_KEY)||"{}")[m.sender_id]&&"Notification"in window&&Notification.permission==="granted"&&(document.visibilityState!=="visible"||!selectedId||selectedId!==m.sender_id)){try{new Notification(m.sender_name||"رسالة جديدة",{body:m.body||"أرسل صورة",icon:"icon.svg",tag:"seif-msg-"+m.id});}catch(e){}}}
async function savePhoto(file){if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>100*1024){status("اختر صورة JPG أو PNG أو WEBP بحجم لا يتجاوز 100KB.",true);return;}const reader=new FileReader();reader.onload=async()=>{const photo=String(reader.result);localStorage.setItem(PHOTO_KEY,photo);try{await api("wasel_chat_people?user_id=eq."+encodeURIComponent(myId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({avatar_data:photo})});renderPeople();$("chatAvatar").textContent=initials(currentName());status("تم حفظ صورتك في هذا المتصفح وقائمة الأشخاص.");}catch(e){status("حُفظت الصورة محليًا، لكن قاعدة البيانات تحتاج تحديث schema.sql: "+e.message,true);}};reader.readAsDataURL(file);}
async function savePresence(){
 if(!currentName())return;
 const presence={user_id:myId,display_name:currentName(),room_id:ROOM,last_seen:new Date().toISOString()};if(currentPhoto())presence.avatar_data=currentPhoto();
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
 selectedId=id;localStorage.setItem(SELECTED_KEY,id);document.body.classList.add("mobile-chat-open");document.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active",n.dataset.view==="chats"));
 const p=people.find(x=>x.user_id===id);$("chatTitle").textContent=p?(id===myId?"ملاحظاتي":p.display_name):"المحادثة";$("chatSubtitle").textContent=p?(id!==myId&&p.is_typing&&p.typing_to===myId?"يكتب الآن…":Date.now()-new Date(p.last_seen).getTime()<90000?"متصل الآن":"آخر ظهور: "+timeLabel(p.last_seen)):"";
 applyChatBackground();const muteMap=JSON.parse(localStorage.getItem(MUTE_KEY)||"{}");$("muteChat").textContent=muteMap[id]?uiIcon("bellOff")+" إلغاء كتم المحادثة":uiIcon("bell")+" كتم المحادثة";$("chatAvatar").replaceChildren();if(p?.avatar_data){const img=document.createElement("img");img.src=p.avatar_data;img.alt="";$("chatAvatar").appendChild(img);}else $("chatAvatar").textContent=initials(p?.display_name||"S");
 $("messageText").disabled=!p||id===myId;$("sendMessage").disabled=!p||id===myId;$("chatImage").disabled=!p||id===myId;$("cameraImage").disabled=!p||id===myId;$("chatDocument").disabled=!p||id===myId;$("chatAudio").disabled=!p||id===myId;
 status(id===myId?"هذه مساحتك الشخصية. اختر صديقك لإرسال رسالة.":"المحادثة مع "+(p?.display_name||"صديقك"));renderPeople();lastSignature="";await loadMessages();
}
function clearReply(){replyTo=null;$("replyPreview").hidden=true;$("replyPreviewText").textContent="";}
function setReply(m){replyTo=m.id;$("replyPreview").hidden=false;$("replyPreviewText").textContent="رد على: "+(m.body||"صورة");$("messageText").focus();}
async function loadMessages(){
 if(!selectedId)return;
 const rows=await api("wasel_chat_messages?select=id,room_id,sender_id,sender_name,recipient_id,body,image_data,created_at,read_at,delivered_at,reply_to,reactions,deleted_at&room_id=eq."+ROOM+"&order=created_at.asc&limit=500");
 const oldIncoming=new Set(messages.filter(m=>m.sender_id===selectedId).map(m=>String(m.id)));
 messages=rows.filter(m=>(m.sender_id===myId&&m.recipient_id===selectedId)||(m.sender_id===selectedId&&m.recipient_id===myId));
 const incoming=messages.filter(m=>m.sender_id===selectedId&&m.recipient_id===myId&&!m.deleted_at);
 for(const m of incoming){if(!oldIncoming.has(String(m.id))&&lastIncomingId!==0&&!notifiedIds.has(String(m.id))){notifyIncoming(m);notifiedIds.add(String(m.id));}lastIncomingId=Math.max(lastIncomingId,Number(m.id)||0);}
 if(document.visibilityState==="visible"){
  const undelivered=incoming.filter(m=>!m.delivered_at);if(undelivered.length){const now=new Date().toISOString();try{await api("wasel_chat_messages?id=in.("+undelivered.map(m=>m.id).join(",")+")&recipient_id=eq."+encodeURIComponent(myId)+"&delivered_at=is.null",{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({delivered_at:now})});messages=messages.map(m=>undelivered.some(x=>x.id===m.id)?{...m,delivered_at:now}:m);}catch(e){console.warn("Delivery status unavailable",e);}}
  const unread=incoming.filter(m=>!m.read_at);if(unread.length){const now=new Date().toISOString();try{await api("wasel_chat_messages?id=in.("+unread.map(m=>m.id).join(",")+")&recipient_id=eq."+encodeURIComponent(myId)+"&read_at=is.null",{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({read_at:now})});messages=messages.map(m=>unread.some(x=>x.id===m.id)?{...m,read_at:now}:m);}catch(e){console.warn("Read receipts unavailable",e);}}
 }
 const sig=messages.map(m=>[m.id,m.read_at,m.delivered_at,m.deleted_at,JSON.stringify(m.reactions||{})].join(":")).join("|");if(sig!==lastSignature){lastSignature=sig;renderMessages();}
}
function appendFormattedText(root,text){
 const pattern=/\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;let last=0,match;while((match=pattern.exec(text))){if(match.index>last)root.appendChild(document.createTextNode(text.slice(last,match.index)));const node=document.createElement(match[1]?"strong":match[2]?"em":"code");node.textContent=match[1]||match[2]||match[3];root.appendChild(node);last=pattern.lastIndex;}if(last<text.length)root.appendChild(document.createTextNode(text.slice(last)));
}
function renderMessages(){
 const log=$("chatLog");log.replaceChildren();
 if(!selectedId){const w=document.createElement("div");w.className="welcome";w.innerHTML='<div class="welcomeicon">'+uiIcon("mail")+'</div><h3>ابدأ محادثتك</h3><p>ابحث عن صديقك واختره من القائمة. يجب أن يفتح هو أيضًا الموقع ويكتب اسمه.</p>';log.appendChild(w);return;}
 if(!messages.length){const w=document.createElement("div");w.className="welcome";w.innerHTML='<div class="welcomeicon">'+uiIcon("mail")+'</div><h3>لا توجد رسائل بعد</h3><p>ابدأ المحادثة برسالة ترسلها لصديقك.</p>';log.appendChild(w);}
 const visibleMessages=messageSearchTerm?messages.filter(m=>(m.body||"").toLocaleLowerCase().includes(messageSearchTerm)):messages;
 if(messages.length&&!visibleMessages.length){const no=document.createElement("div");no.className="empty";no.textContent="لا توجد رسائل تطابق البحث.";log.appendChild(no);return;}
 const byId=new Map(messages.map(m=>[String(m.id),m]));
 let previousDay="";for(const m of visibleMessages){
  const dayKey=new Date(m.created_at).toLocaleDateString("en-CA");if(dayKey!==previousDay){const divider=document.createElement("div");divider.className="day-divider";const today=new Date().toLocaleDateString("en-CA"),yesterday=new Date(Date.now()-86400000).toLocaleDateString("en-CA");divider.textContent=dayKey===today?"اليوم":dayKey===yesterday?"الأمس":new Date(m.created_at).toLocaleDateString("ar-TN",{year:"numeric",month:"long",day:"numeric"});log.appendChild(divider);previousDay=dayKey;}
  const bubble=document.createElement("div");bubble.className="bubble "+(m.sender_id===myId?"mine":"")+(m.deleted_at?" deleted":"");
  if(m.reply_to){const original=byId.get(String(m.reply_to));const q=document.createElement("div");q.className="quoted-message";q.textContent="↪ "+(original?(original.deleted_at?"تم حذف الرسالة":original.body||"صورة"):"رسالة سابقة");bubble.appendChild(q);}
  if(m.deleted_at){const gone=document.createElement("div");gone.className="deleted-text";gone.textContent="تم حذف هذه الرسالة";bubble.appendChild(gone);}
  else {if(m.image_data){const img=document.createElement("img");img.alt="صورة مرسلة — اضغط للتكبير";img.loading="lazy";img.src=m.image_data;img.style.maxWidth="100%";img.style.borderRadius="12px";img.tabIndex=0;img.role="button";img.addEventListener("click",()=>openImageViewer(m.image_data));img.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openImageViewer(m.image_data);}});bubble.appendChild(img);}if(m.body){const body=document.createElement("div");body.className="formatted-message";appendFormattedText(body,m.body);parseEmoji(body);bubble.appendChild(body);}}
  const reacts=document.createElement("div");reacts.className="reaction-row";const reactions=m.reactions&&typeof m.reactions==="object"?m.reactions:{};Object.entries(reactions).forEach(([emoji,ids])=>{const count=Array.isArray(ids)?ids.length:Number(ids)||0;if(count){const r=document.createElement("button");r.type="button";r.className="reaction-chip";r.textContent=emoji+" "+count;r.addEventListener("click",()=>toggleReaction(m,emoji));parseEmoji(r);reacts.appendChild(r);}});bubble.appendChild(reacts);
  const actions=document.createElement("div");actions.className="message-actions";const pins=JSON.parse(localStorage.getItem(PIN_KEY)||"{}");const pinKey=String(selectedId||"") + ":" + String(m.id);const pin=document.createElement("button");pin.type="button";pin.innerHTML=uiIcon("pin")+" "+(pins[pinKey]?"مثبتة":"تثبيت");pin.addEventListener("click",()=>{const current=JSON.parse(localStorage.getItem(PIN_KEY)||"{}");if(current[pinKey])delete current[pinKey];else current[pinKey]=true;localStorage.setItem(PIN_KEY,JSON.stringify(current));renderMessages();});actions.appendChild(pin);const reply=document.createElement("button");reply.type="button";reply.innerHTML=uiIcon("reply")+" رد";reply.addEventListener("click",()=>setReply(m));actions.appendChild(reply);
  for(const emoji of ["👍","❤️","😂","😮","😢","🙏"]){const react=document.createElement("button");react.type="button";react.textContent=emoji;react.setAttribute("aria-label","تفاعل "+emoji);parseEmoji(react);react.addEventListener("click",()=>toggleReaction(m,emoji));actions.appendChild(react);}const moreReact=document.createElement("button");moreReact.type="button";moreReact.innerHTML=uiIcon("star");moreReact.title="رمز آخر";moreReact.addEventListener("click",()=>{const choice=prompt("اكتب رمز الإيموجي الذي تريد التفاعل به:","✨");if(choice&&choice.trim())toggleReaction(m,choice.trim());});actions.appendChild(moreReact);
  let pressTimer=null,startX=0,startY=0;bubble.addEventListener("pointerdown",e=>{startX=e.clientX;startY=e.clientY;pressTimer=setTimeout(()=>{pressTimer=null;const choice=prompt("تفاعل مع الرسالة: 👍 ❤️ 😂 😮 😢 🙏 أو اكتب رمزًا آخر","❤️");if(choice&&choice.trim())toggleReaction(m,choice.trim());},650);});bubble.addEventListener("pointerup",e=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}const dx=e.clientX-startX,dy=e.clientY-startY;if(Math.abs(dx)>65&&Math.abs(dy)<45)setReply(m);});bubble.addEventListener("pointercancel",()=>{if(pressTimer)clearTimeout(pressTimer);});bubble.addEventListener("pointermove",e=>{if(Math.abs(e.clientX-startX)>15||Math.abs(e.clientY-startY)>15){if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}}});
  if(m.sender_id===myId&&!m.deleted_at){if(m.body){const edit=document.createElement("button");edit.type="button";edit.textContent="تعديل";edit.addEventListener("click",()=>editMessage(m));actions.appendChild(edit);}const del=document.createElement("button");del.type="button";del.textContent="حذف";del.addEventListener("click",()=>deleteMessage(m));actions.appendChild(del);}bubble.appendChild(actions);
  if(pins[pinKey]){const pinned=document.createElement("small");pinned.className="pinned-label";pinned.innerHTML=uiIcon("pin")+" رسالة مثبتة على هذا الجهاز";bubble.appendChild(pinned);}const stamp=document.createElement("span");stamp.className="stamp";stamp.textContent=(m.sender_id===myId?"أنت":m.sender_name||"صديقك")+" · "+timeLabel(m.created_at);
  if(m.sender_id===myId){const receipt=document.createElement("span");receipt.className="read-receipt"+(m.read_at?" is-read":"");receipt.textContent=m.read_at?" ✓✓":m.delivered_at?" ✓✓":" ✓";receipt.title=m.read_at?"تمت القراءة":m.delivered_at?"تم التسليم":"تم الإرسال";stamp.appendChild(receipt);}
  bubble.appendChild(stamp);log.appendChild(bubble);
 }
 log.scrollTop=log.scrollHeight;
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
async function sendText(){
 const field=$("messageText"),body=field.value.trim();if(!body||!selectedId||selectedId===myId)return;
 try{await api("wasel_chat_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({room_id:ROOM,sender_id:myId,sender_name:currentName(),recipient_id:selectedId,body,image_data:null,reply_to:replyTo})});field.value="";field.dispatchEvent(new Event("input",{bubbles:true}));clearReply();await setTyping(false);playSound();status("تم إرسال الرسالة.");await loadMessages();field.focus();}
 catch(e){status("تعذر إرسال الرسالة. شغّل schema.sql المحدّث في Supabase. "+e.message,true);}
}
async function sendImage(file){
 if(!file||!selectedId||selectedId===myId)return;if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){status("اختر صورة JPG أو PNG أو WEBP أو GIF.",true);return;}if(file.size>350*1024){status("اختر صورة أصغر من 350KB حتى يمكن إرسالها.",true);return;}
 const reader=new FileReader();reader.onload=async()=>{try{await api("wasel_chat_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({room_id:ROOM,sender_id:myId,sender_name:currentName(),recipient_id:selectedId,body:"",image_data:reader.result,reply_to:replyTo})});clearReply();status("تم إرسال الصورة.");await loadMessages();}catch(e){status("تعذر إرسال الصورة. شغّل schema.sql المحدّث في Supabase.",true);}};reader.onerror=()=>status("تعذر قراءة الصورة.",true);reader.readAsDataURL(file);
}
async function setTyping(on){if(!currentName()||!selectedId||selectedId===myId)return;try{await api("wasel_chat_people?user_id=eq."+encodeURIComponent(myId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({is_typing:on,typing_to:on?selectedId:null,last_seen:new Date().toISOString()})});}catch(e){}}
function enableMobileSwipeNavigation(){let startX=0,startY=0;const chat=$("chatLog");chat.addEventListener("touchstart",e=>{if(!e.touches||e.touches.length!==1)return;startX=e.touches[0].clientX;startY=e.touches[0].clientY;},{passive:true});chat.addEventListener("touchend",e=>{if(!e.changedTouches||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;if(window.matchMedia("(max-width: 620px)").matches&&document.body.classList.contains("mobile-chat-open")&&dx>100&&Math.abs(dy)<65){mobileBack();}},{passive:true});}enableMobileSwipeNavigation();
function mobileBack(){document.body.classList.remove("mobile-chat-open");document.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active",n.dataset.view==="people"));}
$("mobileBack").addEventListener("click",mobileBack);
$("statusShortcut").addEventListener("click",()=>status("ميزة الحالات اليومية لم تُفعّل بعد."));
$("newChatShortcut").addEventListener("click",()=>{$("peopleSearch").focus();$("peopleSearch").scrollIntoView({block:"nearest"});status("ابحث عن اسم صديقك لبدء محادثة جديدة.");});
$("sidebarMenuButton").addEventListener("click",()=>{const menu=$("sidebarMenu");menu.hidden=!menu.hidden;$("sidebarMenuButton").setAttribute("aria-expanded",String(!menu.hidden));});
$("sidebarProfile").addEventListener("click",()=>{$("sidebarMenu").hidden=true;openProfile();});
$("sidebarFavorites").addEventListener("click",()=>{$("sidebarMenu").hidden=true;$("favoritesToggle").click();});
$("sidebarTheme").addEventListener("click",()=>{$("sidebarMenu").hidden=true;applyMode(document.documentElement.dataset.mode==="dark"?"light":"dark");});
document.addEventListener("click",e=>{if(!$("sidebarMenu").hidden&&!$("sidebarMenu").contains(e.target)&&e.target!==$("sidebarMenuButton")){$("sidebarMenu").hidden=true;$("sidebarMenuButton").setAttribute("aria-expanded","false");}});
$("profileOpen").addEventListener("click",openProfile);$("editName").addEventListener("click",openProfile);$("chatBackground").addEventListener("change",e=>{const all=JSON.parse(localStorage.getItem(BG_KEY)||"{}");if(selectedId){all[selectedId]=e.target.value==="custom"&&all[selectedId]?.type==="custom"?all[selectedId]:(e.target.value==="custom"?"classic":e.target.value);localStorage.setItem(BG_KEY,JSON.stringify(all));}applyChatBackground();});$("wallpaperImage").addEventListener("change",e=>{const file=e.target.files&&e.target.files[0];e.target.value="";if(!file)return;if(!selectedId){status("اختر محادثة أولًا لتخصيص خلفيتها.",true);return;}if(!["image/jpeg","image/png","image/webp"].includes(file.type)){status("اختر صورة JPG أو PNG أو WEBP.",true);return;}if(file.size>12*1024*1024){status("حجم الصورة كبير؛ اختر صورة أصغر من 12MB.",true);return;}const reader=new FileReader();reader.onerror=()=>status("تعذر قراءة الصورة المختارة.",true);reader.onload=()=>{const img=new Image();img.onerror=()=>status("تعذر فتح الصورة.",true);img.onload=()=>{try{const max=1600,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let total=0,count=0;const step=Math.max(4,Math.floor(pixels.length/12000/4)*4);for(let i=0;i<pixels.length;i+=step){total+=(.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2])/255;count++;}const dark=count?total/count<.48:false,data=canvas.toDataURL("image/jpeg",.78),all=JSON.parse(localStorage.getItem(BG_KEY)||"{}");all[selectedId]={type:"custom",data,dark};localStorage.setItem(BG_KEY,JSON.stringify(all));applyChatBackground();status("تم تطبيق الخلفية الخاصة وتنسيق ألوان الفقاعات تلقائيًا.");}catch(err){status("تعذر تجهيز الصورة؛ جرّب صورة أصغر.",true);}};img.src=String(reader.result);};reader.readAsDataURL(file);});$("muteChat").addEventListener("click",()=>{const all=JSON.parse(localStorage.getItem(MUTE_KEY)||"{}");if(!selectedId)return;all[selectedId]=!all[selectedId];localStorage.setItem(MUTE_KEY,JSON.stringify(all));$("muteChat").innerHTML=uiIcon(all[selectedId]?"bellOff":"bell")+" "+(all[selectedId]?"إلغاء كتم المحادثة":"كتم المحادثة");status(all[selectedId]?"تم كتم إشعارات هذه المحادثة على هذا الجهاز":"تم إلغاء كتم المحادثة");});$("profileClose").addEventListener("click",()=>$("profileModal").hidden=true);$("contactClose").addEventListener("click",()=>$("contactModal").hidden=true);$("chatAvatarButton").addEventListener("click",openContactProfile);$("contactMessageSearch").addEventListener("click",()=>{$("contactModal").hidden=true;const term=prompt("اكتب كلمة للبحث في المحادثة:");if(term){const found=messages.find(m=>(m.body||"").toLowerCase().includes(term.toLowerCase()));status(found?"تم العثور على رسالة مطابقة.":"لا توجد رسالة مطابقة.");}});$("themeModeToggle").addEventListener("click",()=>applyMode(document.documentElement.dataset.mode==="dark"?"light":"dark"));$("messageSearchInput").addEventListener("input",e=>{messageSearchTerm=e.target.value.trim().toLocaleLowerCase();renderMessages();});$("imageViewerClose").addEventListener("click",closeImageViewer);$("imageViewer").addEventListener("click",e=>{if(e.target===$("imageViewer"))closeImageViewer();});$("profilePhotoInput").addEventListener("change",e=>{if(e.target.files?.[0])saveProfilePhoto(e.target.files[0]);e.target.value="";});$("favoritesToggle").addEventListener("click",()=>{const active=$("favoritesToggle").getAttribute("aria-pressed")!=="true";$("favoritesToggle").setAttribute("aria-pressed",String(active));$("favoritesToggle").innerHTML=uiIcon("star")+" "+(active?"عرض الكل":"المفضّلون");renderPeople();});$("themeSelect").addEventListener("change",e=>applyTheme(e.target.value));
document.querySelectorAll(".navitem").forEach(b=>b.addEventListener("click",()=>{const v=b.dataset.view;document.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active",n===b));if(v==="settings"){openProfile();return;}if(v==="people"||v==="chats"){document.body.classList.remove("mobile-chat-open");if(v==="chats"){$("peopleSearch").value="";renderPeople();}else $("peopleSearch").focus({preventScroll:true});}}));
function openNameSetup(){$("displayNameInput").value=currentName();$("nameSetupError").hidden=true;$("nameSetup").hidden=false;$("displayNameInput").focus();}
let incomingInitialized=false;
async function pollIncoming(){
 const rows=await api("wasel_chat_messages?select=id,sender_id,sender_name,body,image_data,created_at,delivered_at&recipient_id=eq."+encodeURIComponent(myId)+"&room_id=eq."+ROOM+"&order=created_at.desc&limit=100");
 const newRows=rows.filter(m=>m.sender_id!==myId&&!notifiedIds.has(String(m.id)));
 if(!incomingInitialized){newRows.forEach(m=>notifiedIds.add(String(m.id)));incomingInitialized=true;}
 else newRows.forEach(m=>{notifiedIds.add(String(m.id));notifyIncoming(m);});
 const undelivered=rows.filter(m=>!m.delivered_at&&m.sender_id!==myId);
 if(undelivered.length){const now=new Date().toISOString();await api("wasel_chat_messages?id=in.("+undelivered.map(m=>m.id).join(",")+")&recipient_id=eq."+encodeURIComponent(myId)+"&delivered_at=is.null",{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({delivered_at:now})});}
}
async function refresh(){if(polling||!currentName())return;polling=true;try{await savePresence();await loadPeople();await pollIncoming();if(selectedId)await loadMessages();status("متصل بالخدمة · تحديث تلقائي.");}catch(e){status("قاعدة البيانات تحتاج تحديث schema.sql في Supabase. "+e.message,true);}finally{polling=false;}}
$("peopleSearch").addEventListener("input",renderPeople);
$("profileForm").addEventListener("submit",async event=>{event.preventDefault();const name=$("profileNameInput").value.trim();if(name.length<2){$("profileError").textContent="اكتب اسمًا من حرفين على الأقل.";$("profileError").hidden=false;return;}const changed=name!==currentName();localStorage.setItem(PROFILE_KEY,name.slice(0,30));localStorage.setItem(BIO_KEY,$("profileBioInput").value.trim().slice(0,120));localStorage.setItem(SOUND_KEY,$("soundSetting").checked?"on":"off");if($("notifySetting").checked){await enableNotifications();}else{localStorage.setItem(NOTIFY_KEY,"off");}applyTheme($("themeSelect").value);$("identity").textContent="أهلاً، "+name;$("profileModal").hidden=true;try{await savePresence();await loadPeople();}catch(e){status("حُفظت التعديلات محليًا لكن تعذر تحديث الملف على الخادم: "+e.message,true);}if(changed&&selectedId){const p=people.find(x=>x.user_id===selectedId);if(p)$("chatTitle").textContent=p.display_name;}renderPeople();});
$("nameSetupForm").addEventListener("submit",async event=>{event.preventDefault();const name=$("displayNameInput").value.trim();if(name.length<2){$("nameSetupError").textContent="اكتب اسمًا من حرفين على الأقل.";$("nameSetupError").hidden=false;return;}localStorage.setItem(PROFILE_KEY,name.slice(0,30));$("nameSetup").hidden=true;$("identity").textContent="أهلاً، "+name;$("messageText").disabled=true;$("sendMessage").disabled=true;$("chatImage").disabled=true;$("setupNotice").hidden=false;$("setupNotice").textContent="اختر اسم صديقك من القائمة. يجب أن يفتح صديقك الموقع ويكتب اسمه أيضًا.";selectedId=null;lastSignature="";renderMessages();renderPeople();await refresh();});
$("messageForm").addEventListener("submit",e=>{e.preventDefault();if(!$("messageText").value.trim()){status("الرسائل الصوتية لم تُفعّل بعد. يمكنك إرسال رسالة نصية الآن.");return;}sendText();});
$("chatImage").addEventListener("change",e=>{const f=e.target.files&&e.target.files[0];if(f)sendImage(f);e.target.value="";});
$("messageText").addEventListener("input",()=>{const hasText=Boolean($("messageText").value.trim());$("sendMessage").classList.toggle("has-text",hasText);$("sendIcon").innerHTML=uiIcon(hasText?"send":"mic");$("sendMessage").setAttribute("aria-label",hasText?"إرسال الرسالة":"الرسائل الصوتية غير مفعلة بعد");setTyping(true);clearTimeout(typingTimer);typingTimer=setTimeout(()=>setTyping(false),1800);});
$("messageText").addEventListener("blur",()=>setTyping(false));
function start(){setupExtras();applyTheme(localStorage.getItem(THEME_KEY)||"blue");applyMode(localStorage.getItem(MODE_KEY)||"light");const name=currentName();$("nameSetup").hidden=Boolean(name);$("identity").textContent=name?"أهلاً، "+name:"لم تختر اسمًا بعد";$("setupNotice").hidden=false;$("setupNotice").textContent="يلزم تشغيل schema.sql المحدّث في Supabase لتفعيل الميزات الجديدة."; $("messageText").disabled=true;$("sendMessage").disabled=true;$("chatImage").disabled=true;renderPeople();if(name)refresh();setInterval(refresh,5000);}
start();
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&selectedId)loadMessages().catch(()=>{});});
