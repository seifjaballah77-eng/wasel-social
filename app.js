// Wasel: automatic anonymous session, live presence, direct messages and private image sharing.
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY";
const $ = id => document.getElementById(id);
const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
let sb,user,selected=null,people=[],onlineIds=new Set(),presenceChannel;
const shortId=id=>"زائر-"+String(id).slice(0,5).toUpperCase();
function status(t,error=false){$("callStatus").textContent=t;$("callStatus").className="statusline"+(error?" error":"");}
function fmt(t){return new Date(t).toLocaleTimeString("ar",{hour:"2-digit",minute:"2-digit"});}
function renderPeople(){
 const root=$("people"),q=$("peopleSearch").value.trim().toLowerCase();root.replaceChildren();
 const visible=people.filter(p=>(p.display_name||shortId(p.id)).toLowerCase().includes(q)||shortId(p.id).toLowerCase().includes(q));
 $("peopleCount").textContent=String(people.length);
 if(!visible.length){root.innerHTML='<div class="empty">'+(people.length?"لا توجد حسابات تطابق البحث.":"لا يوجد أشخاص بعد. أرسل الرابط للشخص الآخر واطلب منه فتحه.")+'</div>';return;}
 visible.forEach(p=>{const b=document.createElement("button");b.className="person"+(selected?.id===p.id?" active":"");const name=p.display_name||shortId(p.id);b.innerHTML='<span class="avatar">'+name.slice(-1).replace(/[&<>"]/g,"")+'</span><span class="personmeta"><strong></strong><small class="personstatus"><i class="dot '+(onlineIds.has(p.id)?"online":"")+'"></i><span class="'+(onlineIds.has(p.id)?"online":"offline")+'">'+(onlineIds.has(p.id)?"متصل الآن":"غير متصل")+'</span></small></span>';b.querySelector("strong").textContent=name;b.onclick=()=>selectPerson(p);root.appendChild(b);});
}
async function loadPeople(){
 const {data,error}=await sb.from("profiles").select("id,display_name,created_at").neq("id",user.id).order("created_at",{ascending:false}).limit(200);
 if(error){$("people").innerHTML='<div class="empty">تعذر تحميل الحسابات. تأكد من إعداد قاعدة البيانات.</div>';status("خطأ تحميل الحسابات: "+error.message,true);return;}
 people=data||[];renderPeople();
}
async function startPresence(){
 presenceChannel=sb.channel("wasel-presence",{config:{presence:{key:user.id}}});
 presenceChannel.on("presence",{event:"sync"},()=>{const state=presenceChannel.presenceState();onlineIds=new Set(Object.keys(state).filter(id=>id!==user.id));renderPeople();if(selected)$("chatSubtitle").textContent=onlineIds.has(selected.id)?"متصل الآن · يمكنك مراسلته":"غير متصل · ستظهر الرسالة عند عودته";});
 presenceChannel.subscribe(async s=>{if(s==="SUBSCRIBED"){const {error}=await presenceChannel.track({user_id:user.id,online_at:new Date().toISOString()});if(error)status("تعذر تحديث حالة الاتصال: "+error.message,true);}});
}
async function addMessage(m){
 const d=document.createElement("div");d.className="bubble"+(m.sender_id===user.id?" mine":"");
 if(m.kind==="image"&&m.media_path){const img=document.createElement("img");img.alt="صورة مرسلة";img.loading="lazy";d.appendChild(img);const {data,error}=await sb.storage.from("chat-media").createSignedUrl(m.media_path,3600);if(error){img.alt="تعذر تحميل الصورة";}else img.src=data.signedUrl;}
 else {const body=document.createElement("div");body.textContent=m.body||"";d.appendChild(body);}
 const stamp=document.createElement("span");stamp.className="stamp";stamp.textContent=fmt(m.created_at);d.appendChild(stamp);$("chatLog").appendChild(d);
}
async function loadMessages(){
 if(!selected)return;
 const {data,error}=await sb.from("messages").select("id,sender_id,recipient_id,body,kind,media_path,created_at").or("and(sender_id.eq."+user.id+",recipient_id.eq."+selected.id+"),and(sender_id.eq."+selected.id+",recipient_id.eq."+user.id+")").in("kind",["text","image"]).order("created_at",{ascending:true}).limit(300);
 if(error){status("تعذر تحميل المحادثة: "+error.message,true);return;}
 $("chatLog").replaceChildren();for(const m of data||[])await addMessage(m);$("chatLog").scrollTop=$("chatLog").scrollHeight;
}
async function selectPerson(p){
 selected=p;$("chatTitle").textContent=p.display_name||shortId(p.id);$("chatSubtitle").textContent=onlineIds.has(p.id)?"متصل الآن · يمكنك مراسلته":"غير متصل · ستظهر الرسالة عند عودته";$("chatAvatar").textContent=(p.display_name||"و").slice(-1);$("messageText").disabled=false;$("sendMessage").disabled=false;$("chatImage").disabled=false;status("");renderPeople();await loadMessages();$("messageText").focus();
}
async function sendText(){
 const body=$("messageText").value.trim();if(!body||!selected)return;
 $("sendMessage").disabled=true;const {error}=await sb.from("messages").insert({sender_id:user.id,recipient_id:selected.id,body,kind:"text"});$("sendMessage").disabled=false;
 if(error){status("لم تُرسل الرسالة: "+error.message,true);return;}
 $("messageText").value="";await loadMessages();$("messageText").focus();
}
async function sendImage(file){
 if(!selected||!file)return;
 if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){status("اختر صورة JPG أو PNG أو WEBP أو GIF.",true);return;}
 if(file.size>8*1024*1024){status("حجم الصورة الأقصى 8MB.",true);return;}
 status("جارٍ إرسال الصورة…");$("chatImage").disabled=true;
 const path=user.id+"/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
 const {error:uploadError}=await sb.storage.from("chat-media").upload(path,file,{contentType:file.type});
 if(uploadError){status("تعذر رفع الصورة: "+uploadError.message,true);$("chatImage").disabled=false;return;}
 const {error}=await sb.from("messages").insert({sender_id:user.id,recipient_id:selected.id,body:"",kind:"image",media_path:path});$("chatImage").disabled=false;
 if(error){status("رُفعت الصورة لكن تعذر إرسالها: "+error.message,true);return;}
 status("");await loadMessages();
}
async function init(){
 if(!configured){$("identity").textContent="بانتظار الإعداد";$("setupNotice").hidden=false;$("setupNotice").textContent="باقي خطوة واحدة قبل التشغيل: أضف رابط Supabase ومفتاح anon/publishable في app.js، ثم نفّذ schema.sql في Supabase. لا توجد شاشة تسجيل دخول؛ سيُنشأ حساب زائر تلقائيًا.";return;}
 sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const {data:s,error:sessionError}=await sb.auth.getSession();if(sessionError)throw sessionError;
 if(!s.session){const {error}=await sb.auth.signInAnonymously();if(error)throw new Error("فعّل Anonymous Sign-Ins في Supabase: "+error.message);}
 const {data:a,error}=await sb.auth.getUser();if(error||!a.user)throw new Error(error?.message||"تعذر إنشاء حساب زائر.");
 user=a.user;$("identity").textContent="حسابك "+shortId(user.id);await loadPeople();await startPresence();
 sb.channel("wasel-message-in-"+user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"recipient_id=eq."+user.id},m=>{if(selected&&m.new.sender_id===selected.id)loadMessages();else status("وصلتك رسالة جديدة من "+shortId(m.new.sender_id));}).subscribe();
 sb.channel("wasel-message-out-"+user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"sender_id=eq."+user.id},m=>{if(selected&&m.new.recipient_id===selected.id)loadMessages();}).subscribe();
 sb.channel("wasel-profile-updates").on("postgres_changes",{event:"INSERT",schema:"public",table:"profiles"},()=>loadPeople()).subscribe();
 setInterval(loadPeople,10000);
}
$("peopleSearch").addEventListener("input",renderPeople);
$("messageForm").addEventListener("submit",e=>{e.preventDefault();sendText();});
$("chatImage").addEventListener("change",async e=>{const f=e.target.files?.[0];if(f)await sendImage(f);e.target.value="";});
init().catch(e=>{console.error(e);$("identity").textContent="الاتصال غير مكتمل";$("setupNotice").hidden=false;$("setupNotice").textContent="تعذر تشغيل التطبيق: "+e.message+" — راجع إعدادات Supabase وschema.sql.";status("تعذر الاتصال بالخدمة.",true);});
