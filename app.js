// أدخل رابط Supabase ومفتاح anon/publishable فقط. لا تستخدم service_role key.
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY";
const $ = id => document.getElementById(id);
const ready = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
let sb, user, selected = null, people = [];
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const shortId = id => "زائر-" + String(id).slice(0,5).toUpperCase();
function status(t,err=false){$("callStatus").textContent=t;$("callStatus").className=err?"error small":"muted small";}
async function init(){
 if(!ready){$("identity").textContent="يلزم إعداد Supabase";$("feed").innerHTML='<p class="error">أدخل بيانات Supabase في app.js ثم أعد النشر. راجع README.md.</p>';return;}
 sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
 let {data:s}=await sb.auth.getSession();
 if(!s.session){const {error}=await sb.auth.signInAnonymously();if(error){status(error.message,true);return;}}
 const {data:a,error}=await sb.auth.getUser();if(error||!a.user){status("تعذر تسجيل الدخول المجهول. فعّل Anonymous Sign-ins في Supabase.",true);return;}
 user=a.user;$("identity").textContent="أنت "+shortId(user.id);
 await loadPeople();await loadFeed();
 sb.channel("posts-feed").on("postgres_changes",{event:"*",schema:"public",table:"posts"},loadFeed).subscribe();
 sb.channel("incoming-msg").on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"recipient_id=eq."+user.id},m=>{if(selected&&m.new.sender_id===selected.id)loadMessages();}).subscribe();
}
async function loadPeople(){
 const {data,error}=await sb.from("profiles").select("id,display_name,created_at").neq("id",user.id).order("created_at",{ascending:false}).limit(100);
 if(error){$("people").innerHTML='<p class="error small">تعذر تحميل الأشخاص. نفّذ schema.sql في Supabase.</p>';return;}
 people=data||[];$("people").innerHTML=people.length?"":'<p class="muted small">لا يوجد أشخاص بعد. افتح الموقع بمتصفح آخر للتجربة.</p>';
 people.forEach(p=>{const b=document.createElement("button");b.className="person"+(selected?.id===p.id?" active":"");b.innerHTML='<span class="avatar">'+esc((p.display_name||"ز").slice(-1))+'</span><span>'+esc(p.display_name||shortId(p.id))+'</span>';b.onclick=()=>selectPerson(p);$("people").appendChild(b);});
}
async function selectPerson(p){selected=p;$("chatTitle").textContent="محادثة مع "+(p.display_name||shortId(p.id));$("messageText").disabled=false;$("sendMessage").disabled=false;await loadMessages();await loadPeople();}
async function loadMessages(){
 if(!selected)return;
 const {data,error}=await sb.from("messages").select("sender_id,recipient_id,body,kind,created_at").or("and(sender_id.eq."+user.id+",recipient_id.eq."+selected.id+"),and(sender_id.eq."+selected.id+",recipient_id.eq."+user.id+")").eq("kind","text").order("created_at",{ascending:true}).limit(100);
 if(error){status("تعذر تحميل الرسائل. تحقق من إعدادات Supabase.",true);return;}
 $("chatLog").innerHTML="";(data||[]).forEach(m=>{const d=document.createElement("div");d.className="bubble"+(m.sender_id===user.id?" mine":"");d.innerHTML=esc(m.body)+'<span class="stamp">'+new Date(m.created_at).toLocaleString("ar")+"</span>";$("chatLog").appendChild(d);});$("chatLog").scrollTop=$("chatLog").scrollHeight;
}
$("messageForm").addEventListener("submit",async e=>{e.preventDefault();const body=$("messageText").value.trim();if(!body||!selected)return;const {error}=await sb.from("messages").insert({sender_id:user.id,recipient_id:selected.id,body,kind:"text"});if(error)status("لم تُرسل الرسالة: "+error.message,true);else{$("messageText").value="";await loadMessages();}});
$("postForm").addEventListener("submit",async e=>{
 e.preventDefault();const body=$("postText").value.trim(),file=$("postImage").files[0];if(!body&&!file)return;if(body.length>2000)return alert("المنشور طويل جدًا.");
 let image_path=null;if(file){if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024)return alert("اختر JPG أو PNG أو WEBP حتى 5MB.");const path=user.id+"/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const {error}=await sb.storage.from("post-images").upload(path,file,{contentType:file.type});if(error)return alert("تعذر رفع الصورة: "+error.message);image_path=path;}
 const {error}=await sb.from("posts").insert({author_id:user.id,body,image_path});if(error)return alert("تعذر نشر المنشور: "+error.message);$("postText").value="";$("postImage").value="";await loadFeed();
});
async function loadFeed(){
 const {data,error}=await sb.from("posts").select("id,author_id,body,image_path,created_at").order("created_at",{ascending:false}).limit(50);
 if(error){$("feed").innerHTML='<p class="error">تعذر تحميل المنشورات. تأكد من تنفيذ schema.sql.</p>';return;}
 $("feed").innerHTML="";
 for(const p of data||[]){const who=people.find(x=>x.id===p.author_id);const d=document.createElement("article");d.className="post";d.innerHTML='<div class="posthead"><span class="avatar">و</span><strong>'+esc(who?.display_name||shortId(p.author_id))+'</strong><span class="muted small">'+new Date(p.created_at).toLocaleString("ar")+'</span></div><div>'+esc(p.body||"")+"</div>";
 if(p.image_path){const {data:u}=await sb.storage.from("post-images").createSignedUrl(p.image_path,3600);if(u?.signedUrl){const img=document.createElement("img");img.src=u.signedUrl;img.alt="صورة منشور";img.loading="lazy";d.appendChild(img);}}$("feed").appendChild(d);}
 if(!data?.length)$("feed").innerHTML='<p class="muted">لا توجد منشورات بعد. كن أول من ينشر!</p>';
}
init().catch(e=>{console.error(e);status("حدث خطأ: "+e.message,true);});
