// Wasel Social — Supabase client-side MVP. Use only the anon/publishable key here.
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY";
const $ = id => document.getElementById(id);
const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
let sb, user, selected = null, people = [], onlineIds = new Set(), presenceChannel, messageChannel, call = null, recorder = null, recordingChunks = [];
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const shortId = id => "زائر-" + String(id).slice(0,5).toUpperCase();
function status(t,err=false){$("callStatus").textContent=t;$("callStatus").className=err?"error small":"muted small";}
function fmt(t){return new Date(t).toLocaleString("ar");}
function renderPeople(){
 const root=$("people");root.replaceChildren();
 if(!people.length){root.innerHTML='<p class="muted small">لا يوجد أشخاص بعد. افتح الرابط على الجهاز الآخر بعد إعداد الخدمة.</p>';return;}
 people.forEach(p=>{const b=document.createElement("button");b.className="person"+(selected?.id===p.id?" active":"");b.innerHTML='<span class="avatar">'+esc((p.display_name||"ز").slice(-1))+'</span><span class="personmeta"><strong>'+esc(p.display_name||shortId(p.id))+'</strong><small class="'+(onlineIds.has(p.id)?"online":"offline")+'">'+(onlineIds.has(p.id)?"متصل الآن":"غير متصل")+'</small></span>';b.onclick=()=>selectPerson(p);root.appendChild(b);});
}
async function loadPeople(){
 const {data,error}=await sb.from("profiles").select("id,display_name,created_at").neq("id",user.id).order("created_at",{ascending:false}).limit(100);
 if(error){$("people").innerHTML='<p class="error small">تعذر تحميل الأشخاص. نفّذ schema.sql في Supabase.</p>';return;}
 people=data||[];renderPeople();
}
async function startPresence(){
 presenceChannel=sb.channel("wasel-presence",{config:{presence:{key:user.id}}});
 presenceChannel.on("presence",{event:"sync"},()=>{const state=presenceChannel.presenceState();onlineIds=new Set(Object.keys(state).filter(id=>id!==user.id));renderPeople();});
 const {error}=await presenceChannel.subscribe(async s=>{if(s==="SUBSCRIBED"){await presenceChannel.track({user_id:user.id,online_at:new Date().toISOString()});}});
 if(error)status("تعذر تشغيل حالة الاتصال: "+error.message,true);
}
function addMessage(m){
 const d=document.createElement("div");d.className="bubble"+(m.sender_id===user.id?" mine":"");
 if(m.kind==="image"&&m.media_path){const img=document.createElement("img");img.alt="صورة مرسلة";img.style.maxWidth="220px";img.style.display="block";img.style.borderRadius="10px";img.style.marginBottom="6px";sb.storage.from("chat-media").createSignedUrl(m.media_path,3600).then(({data})=>{if(data?.signedUrl)img.src=data.signedUrl;});d.appendChild(img);}
 else if(m.kind==="audio"&&m.media_path){const audio=document.createElement("audio");audio.controls=true;audio.preload="metadata";audio.style.maxWidth="220px";sb.storage.from("chat-media").createSignedUrl(m.media_path,3600).then(({data})=>{if(data?.signedUrl)audio.src=data.signedUrl;});d.appendChild(audio);}
 else if(m.body){const body=document.createElement("div");body.textContent=m.body;d.appendChild(body);}
 const stamp=document.createElement("span");stamp.className="stamp";stamp.textContent=fmt(m.created_at);d.appendChild(stamp);$("chatLog").appendChild(d);
}
async function loadMessages(){
 if(!selected)return;
 const {data,error}=await sb.from("messages").select("id,sender_id,recipient_id,body,kind,media_path,created_at").or("and(sender_id.eq."+user.id+",recipient_id.eq."+selected.id+"),and(sender_id.eq."+selected.id+",recipient_id.eq."+user.id+")").in("kind",["text","image","audio"]).order("created_at",{ascending:true}).limit(200);
 if(error){status("تعذر تحميل الرسائل: "+error.message,true);return;}
 $("chatLog").replaceChildren();(data||[]).forEach(addMessage);$("chatLog").scrollTop=$("chatLog").scrollHeight;
}
async function selectPerson(p){selected=p;$("chatTitle").textContent="محادثة مع "+(p.display_name||shortId(p.id));$("messageText").disabled=false;$("sendMessage").disabled=false;$("chatTools").hidden=false;await loadMessages();renderPeople();}
async function sendText(){
 const body=$("messageText").value.trim();if(!body||!selected)return;
 $("sendMessage").disabled=true;
 const {error}=await sb.from("messages").insert({sender_id:user.id,recipient_id:selected.id,body,kind:"text"});
 $("sendMessage").disabled=false;
 if(error){status("لم تُرسل الرسالة: "+error.message,true);return;}
 $("messageText").value="";await loadMessages();
}
async function sendMedia(file,kind){
 if(!selected||!file)return;
 const max=kind==="image"?8*1024*1024:20*1024*1024;
 if(file.size>max){status("حجم الملف أكبر من المسموح.",true);return;}
 if(kind==="image"&&!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){status("اختر صورة JPG أو PNG أو WEBP أو GIF.",true);return;}
 if(kind==="audio"&&!file.type.startsWith("audio/")){status("الملف ليس صوتيًا.",true);return;}
 const path=user.id+"/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
 const {error:uploadError}=await sb.storage.from("chat-media").upload(path,file,{contentType:file.type||"application/octet-stream"});
 if(uploadError){status("تعذر رفع الملف. تحقق من إعداد bucket chat-media: "+uploadError.message,true);return;}
 const {error}=await sb.from("messages").insert({sender_id:user.id,recipient_id:selected.id,body:"",kind,media_path:path});
 if(error){status("تم رفع الملف لكن لم تُحفظ الرسالة: "+error.message,true);return;}
 await loadMessages();
}
async function startRecording(){
 if(!selected)return;
 try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});recorder=new MediaRecorder(stream);recordingChunks=[];
 recorder.ondataavailable=e=>{if(e.data.size)recordingChunks.push(e.data);};
 recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(recordingChunks,{type:recorder.mimeType||"audio/webm"});await sendMedia(new File([blob],"voice-message.webm",{type:blob.type}),"audio");$("recordVoice").textContent="🎙 تسجيل صوتي";};
 recorder.start();$("recordVoice").textContent="⏹ إيقاف وإرسال";status("جارٍ تسجيل الرسالة الصوتية… اضغط إيقاف وإرسال عند الانتهاء.");
 }catch(e){status("لم يمكن الوصول إلى الميكروفون: "+e.message,true);}
}
function stopRecording(){if(recorder&&recorder.state!=="inactive")recorder.stop();}
async function loadFeed(){
 const {data,error}=await sb.from("posts").select("id,author_id,body,image_path,created_at").order("created_at",{ascending:false}).limit(50);
 if(error){$("feed").innerHTML='<p class="error">تعذر تحميل المنشورات. تأكد من تنفيذ schema.sql.</p>';return;}
 $("feed").replaceChildren();
 for(const p of data||[]){const who=people.find(x=>x.id===p.author_id);const d=document.createElement("article");d.className="post";d.innerHTML='<div class="posthead"><span class="avatar">و</span><strong>'+esc(who?.display_name||shortId(p.author_id))+'</strong><span class="muted small">'+fmt(p.created_at)+'</span></div><div>'+esc(p.body||"")+"</div>";
 if(p.image_path){const {data:u}=await sb.storage.from("post-images").createSignedUrl(p.image_path,3600);if(u?.signedUrl){const img=document.createElement("img");img.src=u.signedUrl;img.alt="صورة منشور";img.loading="lazy";d.appendChild(img);}}$("feed").appendChild(d);}
 if(!data?.length)$("feed").innerHTML='<p class="muted">لا توجد منشورات بعد.</p>';
}
$("messageForm").addEventListener("submit",e=>{e.preventDefault();sendText();});
$("chatImage").addEventListener("change",async e=>{const f=e.target.files?.[0];if(f)await sendMedia(f,"image");e.target.value="";});
$("recordVoice").addEventListener("click",()=>recorder&&recorder.state!=="inactive"?stopRecording():startRecording());
$("postForm").addEventListener("submit",async e=>{
 e.preventDefault();const body=$("postText").value.trim(),file=$("postImage").files[0];if(!body&&!file)return;if(body.length>2000)return alert("المنشور طويل جدًا.");
 let image_path=null;if(file){if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024)return alert("اختر JPG أو PNG أو WEBP حتى 5MB.");const path=user.id+"/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const {error}=await sb.storage.from("post-images").upload(path,file,{contentType:file.type});if(error)return alert("تعذر رفع الصورة: "+error.message);image_path=path;}
 const {error}=await sb.from("posts").insert({author_id:user.id,body,image_path});if(error)return alert("تعذر نشر المنشور: "+error.message);$("postText").value="";$("postImage").value="";await loadFeed();
});
async function init(){
 if(!configured){$("identity").textContent="يلزم إعداد Supabase";$("feed").innerHTML='<p class="error">التطبيق لن يتصل حتى تضبط بيانات مشروع Supabase في app.js وتنفذ schema.sql.</p>';return;}
 sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
 let {data:s}=await sb.auth.getSession();
 if(!s.session){const {error}=await sb.auth.signInAnonymously();if(error){status("تعذر تسجيل الدخول المجهول: "+error.message,true);return;}}
 const {data:a,error}=await sb.auth.getUser();if(error||!a.user){status("تعذر تسجيل الدخول المجهول. فعّل Anonymous Sign-ins في Supabase.",true);return;}
 user=a.user;$("identity").textContent="أنت "+shortId(user.id);
 await loadPeople();await startPresence();await loadFeed();
 sb.channel("posts-feed").on("postgres_changes",{event:"*",schema:"public",table:"posts"},loadFeed).subscribe();
 messageChannel=sb.channel("messages-"+user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"recipient_id=eq."+user.id},m=>{if(selected&&(m.new.sender_id===selected.id||m.new.recipient_id===selected.id))loadMessages();}).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"sender_id=eq."+user.id},m=>{if(selected&&m.new.recipient_id===selected.id)loadMessages();}).subscribe();
}
init().catch(e=>{console.error(e);status("حدث خطأ: "+e.message,true);});
