// Seif Messages chat prototype using Supabase REST. Existing room and local-storage keys are preserved.
const $ = id => document.getElementById(id);
const SUPABASE_URL = "https://qlcrvffejuscbftjotmp.supabase.co";
const SUPABASE_KEY = "sb_publishable_nY14ZzU_YiOfBrySQlBuFA_G-jg2VOc";
const ROOM = "wasel-friends";
const PROFILE_KEY = "wasel-personal-name-v1";
const ID_KEY = "wasel-chat-user-id-v1";
const API = SUPABASE_URL + "/rest/v1/";
const myId = localStorage.getItem(ID_KEY) || crypto.randomUUID();
localStorage.setItem(ID_KEY, myId);
let people = [];
let selectedId = null;
let messages = [];
let lastMessageIds = "";
let polling = false;
const headers = {"apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY,"Content-Type":"application/json"};
function status(text, error=false) {
  $("callStatus").textContent = text;
  $("callStatus").className = "statusline" + (error ? " error" : "");
}
function currentName(){ return localStorage.getItem(PROFILE_KEY) || ""; }
function initials(name){ return (name.trim().charAt(0) || "؟").toUpperCase(); }
function timeLabel(value){ return new Date(value).toLocaleTimeString("ar-TN",{hour:"2-digit",minute:"2-digit"}); }
async function api(path, options={}) {
  const response = await fetch(API + path, { ...options, headers:{...headers,...(options.headers||{})} });
  if(!response.ok) {
    const detail = await response.text();
    throw new Error(detail || ("HTTP " + response.status));
  }
  if(response.status === 204) return [];
  const raw = await response.text();
  return raw ? JSON.parse(raw) : [];
}
async function savePresence(){
  const name = currentName();
  if(!name) return;
  await api("wasel_chat_people?on_conflict=user_id",{
    method:"POST",
    headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},
    body:JSON.stringify({user_id:myId,display_name:name,room_id:ROOM,last_seen:new Date().toISOString()})
  });
}
async function loadPeople(){
  const data = await api("wasel_chat_people?select=user_id,display_name,last_seen,room_id&room_id=eq."+ROOM+"&order=last_seen.desc&limit=300");
  people = data;
  renderPeople();
}
function renderPeople(){
  const root=$("people"); root.replaceChildren();
  const query=$("peopleSearch").value.trim().toLocaleLowerCase();
  const now=Date.now();
  const matches=people.filter(p=>(p.display_name||"").toLocaleLowerCase().includes(query));
  $("peopleCount").textContent=String(matches.length);
  if(!matches.length){
    const empty=document.createElement("div"); empty.className="empty";
    empty.textContent=query ? "لا يوجد شخص بهذا الاسم. تأكد أن صديقك فتح الموقع وكتب اسمه." : "لا يوجد أشخاص بعد. افتح الموقع واكتب اسمك.";
    root.appendChild(empty);
  }
  for(const person of matches){
    const isOnline=now-new Date(person.last_seen).getTime()<90000;
    const button=document.createElement("button"); button.type="button";
    button.className="person"+(person.user_id===selectedId?" active":"");
    const avatar=document.createElement("span"); avatar.className="avatar"; avatar.textContent=initials(person.display_name||"؟");
    const meta=document.createElement("span"); meta.className="personmeta";
    const strong=document.createElement("strong"); strong.textContent=person.display_name+(person.user_id===myId?" (أنت)":"");
    const small=document.createElement("small"); small.className="personstatus";
    const dot=document.createElement("i"); dot.className="dot"+(isOnline?" online":"");
    const label=document.createElement("span"); label.className=isOnline?"online":"offline"; label.textContent=isOnline?"متصل الآن":"غير متصل";
    small.append(dot,label); meta.append(strong,small); button.append(avatar,meta);
    button.addEventListener("click",()=>selectPerson(person.user_id));
    root.appendChild(button);
  }
}
async function selectPerson(id){
  selectedId=id;
  document.body.classList.add("mobile-chat-open");
  document.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active",n.dataset.view==="chats"));
  const p=people.find(x=>x.user_id===id);
  $("chatTitle").textContent=p ? (p.user_id===myId ? "ملاحظاتي" : p.display_name) : "المحادثة";
  $("chatSubtitle").textContent=p ? (Date.now()-new Date(p.last_seen).getTime()<90000?"متصل الآن":"آخر ظهور: "+timeLabel(p.last_seen)) : "";
  $("chatAvatar").textContent=initials(p?.display_name||"و");
  $("messageText").disabled=!p || id===myId;
  $("sendMessage").disabled=!p || id===myId;
  $("chatImage").disabled=!p || id===myId;
  if(id===myId) status("هذه مساحتك الشخصية. اختر اسم صديقك لإرسال رسالة.");
  else status("المحادثة مع "+(p?.display_name||"صديقك"));
  renderPeople();
  await loadMessages();
}
async function loadMessages(){
  if(!selectedId) return;
  const rows=await api("wasel_chat_messages?select=id,room_id,sender_id,sender_name,recipient_id,body,image_data,created_at,read_at&room_id=eq."+ROOM+"&order=created_at.asc&limit=300");
  messages=rows.filter(m=>(m.sender_id===myId&&m.recipient_id===selectedId)||(m.sender_id===selectedId&&m.recipient_id===myId));
  if(document.visibilityState==="visible"){
    const unread=messages.filter(m=>m.sender_id===selectedId&&m.recipient_id===myId&&!m.read_at);
    if(unread.length){
      try{
        await api("wasel_chat_messages?id=in.("+unread.map(m=>m.id).join(",")+")&recipient_id=eq."+encodeURIComponent(myId)+"&read_at=is.null",{
          method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({read_at:new Date().toISOString()})
        });
        const readAt=new Date().toISOString();
        const ids=new Set(unread.map(m=>String(m.id)));
        messages=messages.map(m=>ids.has(String(m.id))?{...m,read_at:readAt}:m);
      }catch(e){console.warn("Read receipts could not be updated",e);}
    }
  }
  const signature=messages.map(m=>m.id+":"+(m.read_at||"")).join(",");
  if(signature!==lastMessageIds){lastMessageIds=signature;renderMessages();}
}
function renderMessages(){
  const log=$("chatLog"); log.replaceChildren();
  if(!selectedId){
    const w=document.createElement("div");w.className="welcome";
    w.innerHTML='<div class="welcomeicon">✉</div><h3>ابدأ محادثتك</h3><p>اكتب اسم صديقك في البحث، ثم اختره من القائمة. يجب أن يفتح هو أيضًا الموقع ويكتب اسمه.</p>';
    log.appendChild(w);return;
  }
  if(!messages.length){
    const w=document.createElement("div");w.className="welcome";
    w.innerHTML='<div class="welcomeicon">✉</div><h3>لا توجد رسائل بعد</h3><p>ابدأ المحادثة برسالة ترسلها لصديقك.</p>';
    log.appendChild(w);
  }
  for(const m of messages){
    const bubble=document.createElement("div");bubble.className="bubble "+(m.sender_id===myId?"mine":"");
    if(m.image_data){const img=document.createElement("img");img.alt="صورة مرسلة";img.loading="lazy";img.src=m.image_data;img.style.maxWidth="100%";img.style.borderRadius="12px";bubble.appendChild(img);}
    if(m.body){const body=document.createElement("div");body.textContent=m.body;bubble.appendChild(body);}
    const stamp=document.createElement("span");stamp.className="stamp";stamp.textContent=(m.sender_id===myId?"أنت":"صديقك")+" · "+timeLabel(m.created_at);
    if(m.sender_id===myId){
      const receipt=document.createElement("span");
      receipt.className="read-receipt"+(m.read_at?" is-read":"");
      receipt.textContent=m.read_at?" ✓✓":" ✓";
      receipt.setAttribute("aria-label",m.read_at?"تمت القراءة":"تم الإرسال");
      stamp.appendChild(receipt);
    }
    bubble.appendChild(stamp);
    log.appendChild(bubble);
  }
  log.scrollTop=log.scrollHeight;
}
async function sendText(){
  const field=$("messageText"), body=field.value.trim();
  if(!body||!selectedId||selectedId===myId)return;
  const p=people.find(x=>x.user_id===myId);
  try{
    await api("wasel_chat_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({room_id:ROOM,sender_id:myId,sender_name:currentName(),recipient_id:selectedId,body,image_data:null})});
    field.value="";status("تم إرسال الرسالة.");await loadMessages();field.focus();
  }catch(e){status("تعذر إرسال الرسالة. افتح Supabase ونفّذ ملف schema.sql المحدّث. "+e.message,true);}
}
async function sendImage(file){
  if(!file||!selectedId||selectedId===myId)return;
  if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){status("اختر صورة JPG أو PNG أو WEBP أو GIF.",true);return;}
  if(file.size>350*1024){status("اختر صورة أصغر من 350KB حتى يمكن إرسالها.",true);return;}
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      await api("wasel_chat_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({room_id:ROOM,sender_id:myId,sender_name:currentName(),recipient_id:selectedId,body:"",image_data:reader.result})});
      status("تم إرسال الصورة.");await loadMessages();
    }catch(e){status("تعذر إرسال الصورة. نفّذ schema.sql المحدّث في Supabase.",true);}
  };
  reader.onerror=()=>status("تعذر قراءة الصورة.",true);reader.readAsDataURL(file);
}
function mobileBack(){document.body.classList.remove("mobile-chat-open");document.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active",n.dataset.view==="people"));}
$("mobileBack").addEventListener("click",mobileBack);
document.querySelectorAll(".navitem").forEach(button=>button.addEventListener("click",()=>{
  const view=button.dataset.view;
  document.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active",n===button));
  if(view==="settings"){openNameSetup();return;}
  if(view==="people"||view==="chats"){
    document.body.classList.remove("mobile-chat-open");
    if(view==="chats"){$("peopleSearch").value="";renderPeople();}
    else $("peopleSearch").focus({preventScroll:true});
  }
}));
function openNameSetup(){
  $("displayNameInput").value=currentName();$("nameSetupError").hidden=true;$("nameSetup").hidden=false;$("displayNameInput").focus();
}
async function refresh(){
  if(polling||!currentName())return;
  polling=true;
  try{await savePresence();await loadPeople();if(selectedId)await loadMessages();status("متصل بالخدمة · يتم تحديث قائمة الأشخاص تلقائيًا.");}
  catch(e){status("قاعدة البيانات غير جاهزة بعد. افتح SQL Editor وشغّل schema.sql المحدّث. "+e.message,true);}
  finally{polling=false;}
}
$("peopleSearch").addEventListener("input",renderPeople);
$("editName").addEventListener("click",openNameSetup);
$("nameSetupForm").addEventListener("submit",async event=>{
  event.preventDefault();const name=$("displayNameInput").value.trim();
  if(name.length<2){$("nameSetupError").textContent="اكتب اسمًا من حرفين على الأقل.";$("nameSetupError").hidden=false;return;}
  localStorage.setItem(PROFILE_KEY,name.slice(0,30));$("nameSetup").hidden=true;
  $("identity").textContent="أهلاً، "+name;
  $("messageText").disabled=true;$("sendMessage").disabled=true;$("chatImage").disabled=true;
  $("setupNotice").hidden=false;
  $("setupNotice").textContent="اختر اسم صديقك من القائمة الجانبية لبدء المحادثة. يجب أن يفتح صديقك الموقع ويكتب اسمه أيضًا.";
  selectedId=null;lastMessageIds="";renderMessages();renderPeople();
  await refresh();
});
$("messageForm").addEventListener("submit",event=>{event.preventDefault();sendText();});
$("chatImage").addEventListener("change",event=>{const file=event.target.files&&event.target.files[0];if(file)sendImage(file);event.target.value="";});
async function start(){
  const name=currentName();
  $("nameSetup").hidden=Boolean(name);
  $("identity").textContent=name?"أهلاً، "+name:"لم تختر اسمًا بعد";
  $("setupNotice").hidden=false;
  $("setupNotice").textContent="ملاحظة: يلزم تشغيل ملف schema.sql المحدّث في Supabase مرة واحدة لتفعيل البحث والرسائل بين الأجهزة.";
  $("messageText").disabled=true;$("sendMessage").disabled=true;$("chatImage").disabled=true;
  renderPeople();
  if(name) await refresh();
  setInterval(refresh,5000);
}
start();

// Installable PWA support (GitHub Pages HTTPS).
if ("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&selectedId)loadMessages().catch(()=>{});});
