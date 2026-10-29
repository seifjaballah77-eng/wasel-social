// Seif Messages — lightweight public-room chat prototype.
// This app uses browser-stored IDs, not authenticated accounts. Do not use for sensitive conversations.
const $ = id => document.getElementById(id);
const SUPABASE_URL = "https://qlcrvffejuscbftjotmp.supabase.co";
const SUPABASE_KEY = "sb_publishable_nY14ZzU_YiOfBrySQlBuFA_G-jg2VOc";
const ROOM = "wasel-friends", PROFILE_KEY = "wasel-personal-name-v1", ID_KEY = "wasel-chat-user-id-v1";
const PHOTO_KEY = "wasel-chat-photo-v1", SOUND_KEY = "wasel-chat-sound-v1", NOTIFY_KEY = "wasel-chat-notify-v1";
const API = SUPABASE_URL + "/rest/v1/";
const myId = localStorage.getItem(ID_KEY) || crypto.randomUUID();
localStorage.setItem(ID_KEY,myId);
let people=[],selectedId=null,messages=[],unreadCounts={},lastSignature="",polling=false,replyTo=null,typingTimer=null,lastIncomingId=0,notifiedIds=new Set();
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
function setupExtras(){
 const tools=document.querySelector(".composer-tools");
 if(!$("profilePhotoButton")){
  const photo=document.createElement("label");photo.id="profilePhotoButton";photo.className="toolbutton extra-tool";photo.textContent="♙ الصورة الشخصية";
  const input=document.createElement("input");input.type="file";input.accept="image/jpeg,image/png,image/webp";input.hidden=true;input.id="profilePhotoInput";
  input.addEventListener("change",()=>{if(input.files?.[0])savePhoto(input.files[0]);input.value="";});photo.appendChild(input);tools.appendChild(photo);
 }
 if(!$("soundToggle")){const b=document.createElement("button");b.type="button";b.id="soundToggle";b.className="toolbutton extra-tool";b.textContent=localStorage.getItem(SOUND_KEY)==="off"?"🔇 الصوت":"🔊 الصوت";b.addEventListener("click",()=>{const off=localStorage.getItem(SOUND_KEY)!=="off";localStorage.setItem(SOUND_KEY,off?"off":"on");b.textContent=off?"🔇 الصوت":"🔊 الصوت";status(off?"تم إيقاف أصوات الرسائل":"تم تشغيل أصوات الرسائل");});tools.appendChild(b);}
 if(!$("notifyToggle")){const b=document.createElement("button");b.type="button";b.id="notifyToggle";b.className="toolbutton extra-tool";b.textContent="🔔 الإشعارات";b.addEventListener("click",enableNotifications);tools.appendChild(b);}
 if(!$("emojiPicker")){const b=document.createElement("button");b.type="button";b.id="emojiPicker";b.className="toolbutton extra-tool";b.textContent="😊 إيموجي";b.addEventListener("click",()=>{let panel=$("emojiPanel");if(panel){panel.remove();return;}panel=document.createElement("div");panel.id="emojiPanel";panel.className="emoji-panel";"😀 😃 😄 😁 😂 🥹 😊 😍 🥰 😎 🤔 😢 😭 😡 👍 👎 👏 🙌 ❤️ 💙 🔥 🎉 🙏".split(" ").forEach(e=>{const x=document.createElement("button");x.type="button";x.textContent=e;x.addEventListener("click",()=>{$("messageText").value += e;$("messageText").focus();});panel.appendChild(x);});b.parentElement.insertAdjacentElement("afterend",panel);});tools.appendChild(b);}
 const form=$("messageForm");if(!$("replyPreview")){const p=document.createElement("div");p.id="replyPreview";p.className="reply-preview";p.hidden=true;const label=document.createElement("span");label.id="replyPreviewText";p.appendChild(label);const cancel=document.createElement("button");cancel.type="button";cancel.textContent="×";cancel.setAttribute("aria-label","إلغاء الرد");cancel.addEventListener("click",clearReply);p.appendChild(cancel);form.parentElement.insertBefore(p,form);}
}
function playSound(){if(localStorage.getItem(SOUND_KEY)==="off")return;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.type="sine";o.frequency.value=740;g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.08,c.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.16);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.17);o.onended=()=>c.close();}catch(e){}}
async function enableNotifications(){if(!("Notification"in window)){status("المتصفح لا يدعم إشعارات سطح المكتب.",true);return;}try{const p=await Notification.requestPermission();if(p==="granted"){localStorage.setItem(NOTIFY_KEY,"on");$("notifyToggle").textContent="🔔 الإشعارات مفعّلة";status("تم السماح بالإشعارات على هذا المتصفح.");}else status("لم يتم السماح بالإشعارات. يمكنك تفعيلها من إعدادات المتصفح.",true);}catch(e){status("تعذر تفعيل الإشعارات.",true);}}
function notifyIncoming(m){playSound();if(localStorage.getItem(NOTIFY_KEY)==="on"&&"Notification"in window&&Notification.permission==="granted"&&(document.visibilityState!=="visible"||!selectedId||selectedId!==m.sender_id)){try{new Notification(m.sender_name||"رسالة جديدة",{body:m.body||"أرسل صورة",icon:"icon.svg",tag:"seif-msg-"+m.id});}catch(e){}}}
async function savePhoto(file){if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>100*1024){status("اختر صورة JPG أو PNG أو WEBP بحجم لا يتجاوز 100KB.",true);return;}const reader=new FileReader();reader.onload=async()=>{const photo=String(reader.result);localStorage.setItem(PHOTO_KEY,photo);try{await api("wasel_chat_people?user_id=eq."+encodeURIComponent(myId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({avatar_data:photo})});renderPeople();$("chatAvatar").textContent=initials(currentName());status("تم حفظ صورتك في هذا المتصفح وقائمة الأشخاص.");}catch(e){status("حُفظت الصورة محليًا، لكن قاعدة البيانات تحتاج تحديث schema.sql: "+e.message,true);}};reader.readAsDataURL(file);}
async function savePresence(){
 if(!currentName())return;
 await api("wasel_chat_people?on_conflict=user_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_id:myId,display_name:currentName(),room_id:ROOM,last_seen:new Date().toISOString(),avatar_data:currentPhoto()||null})});
}
async function loadPeople(){
 people=await api("wasel_chat_people?select=user_id,display_name,last_seen,room_id,avatar_data,is_typing,typing_to&room_id=eq."+ROOM+"&order=last_seen.desc&limit=300");
 const unread=await api("wasel_chat_messages?select=id,sender_id&recipient_id=eq."+encodeURIComponent(myId)+"&read_at=is.null&deleted_at=is.null&room_id=eq."+ROOM+"&limit=1000");
 unreadCounts={};for(const m of unread)unreadCounts[m.sender_id]=(unreadCounts[m.sender_id]||0)+1;
 renderPeople();
}
function renderPeople(){
 const root=$("people");root.replaceChildren();const query=$("peopleSearch").value.trim().toLocaleLowerCase(),now=Date.now();
 const matches=people.filter(p=>(p.display_name||"").toLocaleLowerCase().includes(query));$("peopleCount").textContent=String(matches.length);
 if(!matches.length){const e=document.createElement("div");e.className="empty";e.textContent=query?"لا يوجد شخص بهذا الاسم. تأكد أن صديقك فتح الموقع وكتب اسمه.":"لا يوجد أشخاص بعد. افتح الموقع واكتب اسمك.";root.appendChild(e);}
 for(const p of matches){
  const online=now-new Date(p.last_seen).getTime()<90000,b=document.createElement("button");b.type="button";b.className="person"+(p.user_id===selectedId?" active":"");
  const av=document.createElement("span");av.className="avatar";if(p.avatar_data){const img=document.createElement("img");img.src=p.avatar_data;img.alt="";av.appendChild(img);}else av.textContent=initials(p.display_name);
  const meta=document.createElement("span");meta.className="personmeta";const strong=document.createElement("strong");strong.textContent=(p.display_name||"مستخدم")+(p.user_id===myId?" (أنت)":"");
  const small=document.createElement("small");small.className="personstatus";const dot=document.createElement("i");dot.className="dot"+(online?" online":"");const label=document.createElement("span");label.className=online?"online":"offline";label.textContent=p.user_id!==myId&&p.is_typing&&p.typing_to===myId?"يكتب الآن…":online?"متصل الآن":"آخر ظهور: "+timeLabel(p.last_seen);small.append(dot,label);meta.append(strong,small);b.append(av,meta);
  if(unreadCounts[p.user_id]){const badge=document.createElement("span");badge.className="unread-badge";badge.textContent=unreadCounts[p.user_id]>99?"99+":String(unreadCounts[p.user_id]);b.appendChild(badge);}
  b.addEventListener("click",()=>selectPerson(p.user_id));root.appendChild(b);
 }
}
async function selectPerson(id){
 selectedId=id;document.body.classList.add("mobile-chat-open");document.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active",n.dataset.view==="chats"));
 const p=people.find(x=>x.user_id===id);$("chatTitle").textContent=p?(id===myId?"ملاحظاتي":p.display_name):"المحادثة";$("chatSubtitle").textContent=p?(id!==myId&&p.is_typing&&p.typing_to===myId?"يكتب الآن…":Date.now()-new Date(p.last_seen).getTime()<90000?"متصل الآن":"آخر ظهور: "+timeLabel(p.last_seen)):"";
 $("chatAvatar").replaceChildren();if(p?.avatar_data){const img=document.createElement("img");img.src=p.avatar_data;img.alt="";$("chatAvatar").appendChild(img);}else $("chatAvatar").textContent=initials(p?.display_name||"S");
 $("messageText").disabled=!p||id===myId;$("sendMessage").disabled=!p||id===myId;$("chatImage").disabled=!p||id===myId;
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
function renderMessages(){
 const log=$("chatLog");log.replaceChildren();
 if(!selectedId){const w=document.createElement("div");w.className="welcome";w.innerHTML='<div class="welcomeicon">✉</div><h3>ابدأ محادثتك</h3><p>ابحث عن صديقك واختره من القائمة. يجب أن يفتح هو أيضًا الموقع ويكتب اسمه.</p>';log.appendChild(w);return;}
 if(!messages.length){const w=document.createElement("div");w.className="welcome";w.innerHTML='<div class="welcomeicon">✉</div><h3>لا توجد رسائل بعد</h3><p>ابدأ المحادثة برسالة ترسلها لصديقك.</p>';log.appendChild(w);}
 const byId=new Map(messages.map(m=>[String(m.id),m]));
 for(const m of messages){
  const bubble=document.createElement("div");bubble.className="bubble "+(m.sender_id===myId?"mine":"")+(m.deleted_at?" deleted":"");
  if(m.reply_to){const original=byId.get(String(m.reply_to));const q=document.createElement("div");q.className="quoted-message";q.textContent="↪ "+(original?(original.deleted_at?"تم حذف الرسالة":original.body||"صورة"):"رسالة سابقة");bubble.appendChild(q);}
  if(m.deleted_at){const gone=document.createElement("div");gone.className="deleted-text";gone.textContent="تم حذف هذه الرسالة";bubble.appendChild(gone);}
  else {if(m.image_data){const img=document.createElement("img");img.alt="صورة مرسلة";img.loading="lazy";img.src=m.image_data;img.style.maxWidth="100%";img.style.borderRadius="12px";bubble.appendChild(img);}if(m.body){const body=document.createElement("div");body.textContent=m.body;bubble.appendChild(body);}}
  const reacts=document.createElement("div");reacts.className="reaction-row";const reactions=m.reactions&&typeof m.reactions==="object"?m.reactions:{};Object.entries(reactions).forEach(([emoji,ids])=>{const count=Array.isArray(ids)?ids.length:Number(ids)||0;if(count){const r=document.createElement("button");r.type="button";r.className="reaction-chip";r.textContent=emoji+" "+count;r.addEventListener("click",()=>toggleReaction(m,emoji));reacts.appendChild(r);}});bubble.appendChild(reacts);
  const actions=document.createElement("div");actions.className="message-actions";const reply=document.createElement("button");reply.type="button";reply.textContent="↩ رد";reply.addEventListener("click",()=>setReply(m));actions.appendChild(reply);
  const react=document.createElement("button");react.type="button";react.textContent="👍";react.setAttribute("aria-label","تفاعل");react.addEventListener("click",()=>toggleReaction(m,"👍"));actions.appendChild(react);
  if(m.sender_id===myId&&!m.deleted_at){const del=document.createElement("button");del.type="button";del.textContent="حذف";del.addEventListener("click",()=>deleteMessage(m));actions.appendChild(del);}bubble.appendChild(actions);
  const stamp=document.createElement("span");stamp.className="stamp";stamp.textContent=(m.sender_id===myId?"أنت":m.sender_name||"صديقك")+" · "+timeLabel(m.created_at);
  if(m.sender_id===myId){const receipt=document.createElement("span");receipt.className="read-receipt"+(m.read_at?" is-read":"");receipt.textContent=m.read_at?" ✓✓":m.delivered_at?" ✓✓":" ✓";receipt.title=m.read_at?"تمت القراءة":m.delivered_at?"تم التسليم":"تم الإرسال";stamp.appendChild(receipt);}
  bubble.appendChild(stamp);log.appendChild(bubble);
 }
 log.scrollTop=log.scrollHeight;
}
async function toggleReaction(m,emoji){const old=m.reactions&&typeof m.reactions==="object"?{...m.reactions}:{};let ids=Array.isArray(old[emoji])?old[emoji].slice():[];ids=ids.includes(myId)?ids.filter(x=>x!==myId):[...ids,myId];if(ids.length)old[emoji]=ids;else delete old[emoji];try{await api("wasel_chat_messages?id=eq."+m.id+"&room_id=eq."+ROOM,{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({reactions:old})});m.reactions=old;lastSignature="";renderMessages();}catch(e){status("تعذر حفظ التفاعل. تحقق من تشغيل schema.sql.",true);}}
async function deleteMessage(m){if(!confirm("حذف هذه الرسالة من المحادثة؟"))return;try{await api("wasel_chat_messages?id=eq."+m.id+"&sender_id=eq."+encodeURIComponent(myId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({deleted_at:new Date().toISOString(),})});status("تم وضع علامة الحذف على الرسالة.");await loadMessages();}catch(e){status("تعذر حذف الرسالة. تحقق من تحديث قاعدة البيانات.",true);}}
async function sendText(){
 const field=$("messageText"),body=field.value.trim();if(!body||!selectedId||selectedId===myId)return;
 try{await api("wasel_chat_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({room_id:ROOM,sender_id:myId,sender_name:currentName(),recipient_id:selectedId,body,image_data:null,reply_to:replyTo})});field.value="";clearReply();await setTyping(false);status("تم إرسال الرسالة.");await loadMessages();field.focus();}
 catch(e){status("تعذر إرسال الرسالة. شغّل schema.sql المحدّث في Supabase. "+e.message,true);}
}
async function sendImage(file){
 if(!file||!selectedId||selectedId===myId)return;if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){status("اختر صورة JPG أو PNG أو WEBP أو GIF.",true);return;}if(file.size>350*1024){status("اختر صورة أصغر من 350KB حتى يمكن إرسالها.",true);return;}
 const reader=new FileReader();reader.onload=async()=>{try{await api("wasel_chat_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({room_id:ROOM,sender_id:myId,sender_name:currentName(),recipient_id:selectedId,body:"",image_data:reader.result,reply_to:replyTo})});clearReply();status("تم إرسال الصورة.");await loadMessages();}catch(e){status("تعذر إرسال الصورة. شغّل schema.sql المحدّث في Supabase.",true);}};reader.onerror=()=>status("تعذر قراءة الصورة.",true);reader.readAsDataURL(file);
}
async function setTyping(on){if(!currentName()||!selectedId||selectedId===myId)return;try{await api("wasel_chat_people?user_id=eq."+encodeURIComponent(myId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({is_typing:on,typing_to:on?selectedId:null,last_seen:new Date().toISOString()})});}catch(e){}}
function mobileBack(){document.body.classList.remove("mobile-chat-open");document.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active",n.dataset.view==="people"));}
$("mobileBack").addEventListener("click",mobileBack);
document.querySelectorAll(".navitem").forEach(b=>b.addEventListener("click",()=>{const v=b.dataset.view;document.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active",n===b));if(v==="settings"){openNameSetup();return;}if(v==="people"||v==="chats"){document.body.classList.remove("mobile-chat-open");if(v==="chats"){$("peopleSearch").value="";renderPeople();}else $("peopleSearch").focus({preventScroll:true});}}));
function openNameSetup(){$("displayNameInput").value=currentName();$("nameSetupError").hidden=true;$("nameSetup").hidden=false;$("displayNameInput").focus();}
async function refresh(){if(polling||!currentName())return;polling=true;try{await savePresence();await loadPeople();if(selectedId)await loadMessages();status("متصل بالخدمة · تحديث تلقائي.");}catch(e){status("قاعدة البيانات تحتاج تحديث schema.sql في Supabase. "+e.message,true);}finally{polling=false;}}
$("peopleSearch").addEventListener("input",renderPeople);$("editName").addEventListener("click",openNameSetup);
$("nameSetupForm").addEventListener("submit",async event=>{event.preventDefault();const name=$("displayNameInput").value.trim();if(name.length<2){$("nameSetupError").textContent="اكتب اسمًا من حرفين على الأقل.";$("nameSetupError").hidden=false;return;}localStorage.setItem(PROFILE_KEY,name.slice(0,30));$("nameSetup").hidden=true;$("identity").textContent="أهلاً، "+name;$("messageText").disabled=true;$("sendMessage").disabled=true;$("chatImage").disabled=true;$("setupNotice").hidden=false;$("setupNotice").textContent="اختر اسم صديقك من القائمة. يجب أن يفتح صديقك الموقع ويكتب اسمه أيضًا.";selectedId=null;lastSignature="";renderMessages();renderPeople();await refresh();});
$("messageForm").addEventListener("submit",e=>{e.preventDefault();sendText();});
$("chatImage").addEventListener("change",e=>{const f=e.target.files&&e.target.files[0];if(f)sendImage(f);e.target.value="";});
$("messageText").addEventListener("input",()=>{setTyping(true);clearTimeout(typingTimer);typingTimer=setTimeout(()=>setTyping(false),1800);});
$("messageText").addEventListener("blur",()=>setTyping(false));
function start(){setupExtras();const name=currentName();$("nameSetup").hidden=Boolean(name);$("identity").textContent=name?"أهلاً، "+name:"لم تختر اسمًا بعد";$("setupNotice").hidden=false;$("setupNotice").textContent="يلزم تشغيل schema.sql المحدّث في Supabase لتفعيل الميزات الجديدة."; $("messageText").disabled=true;$("sendMessage").disabled=true;$("chatImage").disabled=true;renderPeople();if(name)refresh();setInterval(refresh,5000);}
start();
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&selectedId)loadMessages().catch(()=>{});});
