// Wasel Personal Chat — single-user, browser-local version.
// Messages and images stay in this browser's localStorage; no account or Supabase required.
const $ = id => document.getElementById(id);
const STORE_KEY = "wasel-personal-chat-v1";
const PROFILE_KEY = "wasel-personal-name-v1";
let selected = true;
let messages = [];
function status(text, error=false) {
  $("callStatus").textContent = text;
  $("callStatus").className = "statusline" + (error ? " error" : "");
}
function timeLabel(value) {
  return new Date(value).toLocaleTimeString("ar-TN", {hour:"2-digit",minute:"2-digit"});
}
function readMessages() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function saveMessages() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(messages));
    return true;
  } catch {
    status("مساحة التخزين ممتلئة. احذف بعض الصور أو الرسائل القديمة.", true);
    return false;
  }
}
function renderPeople() {
  const root = $("people");
  root.replaceChildren();
  const query = $("peopleSearch").value.trim().toLowerCase();
  $("peopleCount").textContent = "1";
  if ("محادثتي الخاصة".includes(query) || "ملاحظاتي".includes(query)) {
    const button = document.createElement("button");
    button.className = "person active";
    button.innerHTML = '<span class="avatar">و</span><span class="personmeta"><strong>محادثتي الخاصة</strong><small class="personstatus"><i class="dot online"></i><span class="online">محفوظة على هذا الجهاز</span></small></span>';
    button.onclick = renderMessages;
    root.appendChild(button);
  } else {
    root.innerHTML = '<div class="empty">لا توجد نتائج.</div>';
  }
}
function renderMessages() {
  const log = $("chatLog");
  log.replaceChildren();
  if (!messages.length) {
    const welcome = document.createElement("div");
    welcome.className = "welcome";
    welcome.innerHTML = '<div class="welcomeicon">✉</div><h3>مساحتك الخاصة</h3><p>اكتب رسالة لنفسك أو أرفق صورة. ستُحفظ على هذا المتصفح.</p>';
    log.appendChild(welcome);
  }
  for (const message of messages) {
    const bubble = document.createElement("div");
    bubble.className = "bubble mine";
    if (message.image) {
      const image = document.createElement("img");
      image.alt = "صورة محفوظة";
      image.loading = "lazy";
      image.src = message.image;
      image.style.maxWidth = "100%";
      image.style.borderRadius = "12px";
      bubble.appendChild(image);
    }
    if (message.text) {
      const body = document.createElement("div");
      body.textContent = message.text;
      bubble.appendChild(body);
    }
    const stamp = document.createElement("span");
    stamp.className = "stamp";
    stamp.textContent = timeLabel(message.createdAt);
    bubble.appendChild(stamp);
    log.appendChild(bubble);
  }
  log.scrollTop = log.scrollHeight;
}
function sendText() {
  const field = $("messageText");
  const text = field.value.trim();
  if (!text) return;
  messages.push({id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), text, createdAt:new Date().toISOString()});
  if (!saveMessages()) { messages.pop(); return; }
  field.value = "";
  status("تم حفظ الرسالة على هذا الجهاز.");
  renderMessages();
  field.focus();
}
function sendImage(file) {
  if (!file) return;
  if (!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)) {
    status("اختر صورة JPG أو PNG أو WEBP أو GIF.", true); return;
  }
  if (file.size > 2 * 1024 * 1024) {
    status("للحفاظ على مساحة التخزين، اختر صورة أصغر من 2MB.", true); return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    messages.push({id:String(Date.now()), image:reader.result, createdAt:new Date().toISOString()});
    if (!saveMessages()) { messages.pop(); return; }
    status("تم حفظ الصورة على هذا الجهاز.");
    renderMessages();
  };
  reader.onerror = () => status("تعذر قراءة الصورة.", true);
  reader.readAsDataURL(file);
}
function setupName() {
  const saved = localStorage.getItem(PROFILE_KEY) || "";
  $("identity").textContent = saved ? "أهلاً، " + saved : "مساحتك الشخصية";
  $("chatTitle").textContent = "محادثتي الخاصة";
  $("chatSubtitle").textContent = "رسائل وصور محفوظة على هذا الجهاز";
  $("chatAvatar").textContent = "و";
  $("messageText").disabled = false;
  $("sendMessage").disabled = false;
  $("chatImage").disabled = false;
  $("setupNotice").hidden = false;
  $("setupNotice").textContent = "هذه نسخة شخصية لا تحتاج إلى حساب. الرسائل والصور محفوظة في متصفح هذا الجهاز فقط، وليست متاحة تلقائيًا على أجهزة أخرى.";
  document.querySelector(".privacyhint").textContent = "نصيحة: لا تمسح بيانات المتصفح إذا أردت الاحتفاظ برسائلك.";
  const oldOverlay = $("nameSetup");
  oldOverlay.hidden = true;
  renderPeople();
}
$("peopleSearch").addEventListener("input", renderPeople);
$("messageForm").addEventListener("submit", event => { event.preventDefault(); sendText(); });
$("chatImage").addEventListener("change", event => {
  const file = event.target.files && event.target.files[0];
  if (file) sendImage(file);
  event.target.value = "";
});
messages = readMessages();
setupName();
renderMessages();
