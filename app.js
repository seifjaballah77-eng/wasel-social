// Wasel — simple local prototype. Cross-device chat needs a shared backend.
const $ = id => document.getElementById(id);
const STORE_KEY = "wasel-personal-chat-v1";
const PROFILE_KEY = "wasel-personal-name-v1";
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
function currentName() {
  return localStorage.getItem(PROFILE_KEY) || "";
}
function initials(name) {
  return (name.trim().charAt(0) || "؟").toUpperCase();
}
function renderPeople() {
  const root = $("people");
  root.replaceChildren();
  const name = currentName();
  const query = $("peopleSearch").value.trim().toLowerCase();
  $("peopleCount").textContent = "1";
  if (name.toLowerCase().includes(query) || "أنت على هذا الجهاز".includes(query)) {
    const button = document.createElement("button");
    button.className = "person active";
    button.type = "button";
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = initials(name);
    const meta = document.createElement("span");
    meta.className = "personmeta";
    const strong = document.createElement("strong");
    strong.textContent = name + " (أنت)";
    const small = document.createElement("small");
    small.className = "personstatus";
    const dot = document.createElement("i");
    dot.className = "dot";
    const label = document.createElement("span");
    label.className = "offline";
    label.textContent = "على هذا الجهاز فقط";
    small.append(dot, label);
    meta.append(strong, small);
    button.append(avatar, meta);
    button.onclick = renderMessages;
    root.appendChild(button);
  } else {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "لا توجد نتائج.";
    root.appendChild(empty);
  }
  const hint = document.createElement("div");
  hint.className = "peoplehint";
  hint.textContent = "ستظهر أسماء الأشخاص المتصلين هنا بعد ربط الموقع بين الأجهزة.";
  root.appendChild(hint);
}
function renderMessages() {
  const log = $("chatLog");
  log.replaceChildren();
  if (!messages.length) {
    const welcome = document.createElement("div");
    welcome.className = "welcome";
    welcome.innerHTML = '<div class="welcomeicon">✉</div><h3>أهلاً بك في واصل</h3><p>اكتب رسالة أو أرفق صورة. الرسائل في هذه النسخة محفوظة على هذا المتصفح فقط.</p>';
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
  status("تم حفظ الرسالة على هذا الجهاز، ولم تُرسل إلى جهاز آخر.");
  renderMessages();
  field.focus();
}
function sendImage(file) {
  if (!file) return;
  if (!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)) {
    status("اختر صورة JPG أو PNG أو WEBP أو GIF.", true); return;
  }
  if (file.size > 2 * 1024 * 1024) {
    status("اختر صورة أصغر من 2MB.", true); return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    messages.push({id:String(Date.now()), image:reader.result, createdAt:new Date().toISOString()});
    if (!saveMessages()) { messages.pop(); return; }
    status("تم حفظ الصورة على هذا الجهاز، ولم تُرسل إلى جهاز آخر.");
    renderMessages();
  };
  reader.onerror = () => status("تعذر قراءة الصورة.", true);
  reader.readAsDataURL(file);
}
function openNameSetup() {
  $("displayNameInput").value = currentName();
  $("nameSetupError").hidden = true;
  $("nameSetup").hidden = false;
  $("displayNameInput").focus();
}
function setupName() {
  const saved = currentName();
  $("identity").textContent = saved ? "أهلاً، " + saved : "لم تختر اسمًا بعد";
  $("chatTitle").textContent = saved ? "محادثة " + saved : "محادثة واصل";
  $("chatSubtitle").textContent = "قائمة الأشخاص ومكان المحادثة";
  $("chatAvatar").textContent = initials(saved || "و");
  $("messageText").disabled = !saved;
  $("sendMessage").disabled = !saved;
  $("chatImage").disabled = !saved;
  $("setupNotice").hidden = false;
  $("setupNotice").textContent = "تنبيه: هذه النسخة تحفظ الرسائل في المتصفح الحالي فقط. لكي ترى صديقك متصلًا وتراسلاه من جهازين، يجب ربط قاعدة بيانات مشتركة.";
  document.querySelector(".privacyhint").textContent = "الرسائل لا تصل إلى صديقك في هذه النسخة التجريبية.";
  $("nameSetup").hidden = Boolean(saved);
  renderPeople();
}
$("peopleSearch").addEventListener("input", renderPeople);
$("editName").addEventListener("click", openNameSetup);
$("nameSetupForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("displayNameInput").value.trim();
  if (name.length < 2) {
    $("nameSetupError").textContent = "اكتب اسمًا من حرفين على الأقل.";
    $("nameSetupError").hidden = false;
    return;
  }
  localStorage.setItem(PROFILE_KEY, name.slice(0,30));
  $("nameSetup").hidden = true;
  setupName();
  status("تم حفظ اسمك على هذا الجهاز.");
});
$("messageForm").addEventListener("submit", event => { event.preventDefault(); sendText(); });
$("chatImage").addEventListener("change", event => {
  const file = event.target.files && event.target.files[0];
  if (file) sendImage(file);
  event.target.value = "";
});
messages = readMessages();
setupName();
renderMessages();
