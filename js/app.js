const loginDialog = document.querySelector("#login-dialog");
const loginForm = document.querySelector("#login-form");
const loginInput = document.querySelector("#login-input");
const loginError = document.querySelector("#login-error");
const roomList = document.querySelector("#room-list");
const messageList = document.querySelector("#message-list");
const emptyState = document.querySelector("#empty-state");
const messageForm = document.querySelector("#message-form");
const messageInput = document.querySelector("#message-input");
const imageInput = document.querySelector("#image-input");
const attachmentName = document.querySelector("#attachment-name");
const sendButton = messageForm.querySelector("button[type=submit]");
const state = { user: null, room: null, roomToken: null, lastMessageId: 0, pollTimer: null };

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  if (!response.ok) {
    let detail = `Ошибка ${response.status}`;
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : detail;
    } catch { /* The response may not contain JSON. */ }
    throw new Error(detail);
  }
  if (response.status === 204) return null;
  return response.json();
}

function setStatus(text, online = false) {
  document.querySelector("#connection-label").textContent = text;
  document.querySelector(".status-dot").classList.toggle("online", online);
}

function showLogin() {
  if (!loginDialog.open) loginDialog.showModal();
  loginInput.focus();
}

async function startSession() {
  try {
    state.user = await api("/api/me");
    document.querySelector("#profile").hidden = false;
    document.querySelector("#profile-name").textContent = state.user.login;
    document.querySelector("#avatar").textContent = state.user.login.slice(0, 1);
    await loadRooms();
  } catch {
    showLogin();
  }
}

async function loadRooms() {
  try {
    const rooms = await api("/api/rooms");
    document.querySelector("#room-count").textContent = String(rooms.length).padStart(2, "0");
    roomList.replaceChildren();
    for (const room of rooms) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "room-item";
      button.dataset.roomId = room.id;
      const name = document.createElement("span");
      name.className = "room-item-name";
      name.textContent = room.name;
      button.append(name);
      if (room.has_password) {
        const lock = document.createElement("span");
        lock.className = "room-lock";
        lock.textContent = "ЗАКРЫТА";
        button.append(lock);
      }
      const description = document.createElement("span");
      description.className = "room-item-description";
      description.textContent = room.description || "Без описания";
      button.append(description);
      button.addEventListener("click", () => openRoom(room));
      roomList.append(button);
    }
    if (!rooms.length) {
      const note = document.createElement("p");
      note.className = "room-item-description";
      note.textContent = "Пока нет комнат";
      roomList.append(note);
    }
  } catch (error) {
    setStatus(error.message);
  }
}

async function openRoom(room) {
  let password = "";
  if (room.has_password) {
    password = window.prompt(`Комната «${room.name}» защищена паролем.`);
    if (password === null) return;
  }
  try {
    const result = await api(`/api/rooms/${room.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    state.room = room;
    state.roomToken = result.room_token;
    state.lastMessageId = 0;
    clearInterval(state.pollTimer);
    messageList.replaceChildren();
    messageList.append(emptyState);
    emptyState.hidden = false;
    document.querySelector("#room-title").textContent = room.name;
    document.querySelector("#room-description").textContent = room.description || "Без описания";
    document.querySelector("#room-eyebrow").textContent = room.has_password ? "ЗАКРЫТАЯ КОМНАТА" : "ОТКРЫТАЯ КОМНАТА";
    document.querySelectorAll(".room-item").forEach((item) => item.classList.toggle("active", Number(item.dataset.roomId) === room.id));
    messageInput.disabled = false;
    sendButton.disabled = false;
    await refreshMessages();
    state.pollTimer = window.setInterval(refreshMessages, 2500);
  } catch (error) {
    window.alert(error.message);
  }
}

function appendMessage(message) {
  const article = document.createElement("article");
  article.className = "message";
  const avatar = document.createElement("span");
  avatar.className = "message-avatar";
  avatar.textContent = message.login.slice(0, 1);
  const meta = document.createElement("div");
  meta.className = "message-meta";
  const author = document.createElement("span");
  author.className = "message-author";
  author.textContent = message.login;
  const time = document.createElement("time");
  time.className = "message-time";
  time.dateTime = message.created_at;
  time.textContent = new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.created_at));
  meta.append(author, time);
  article.append(avatar, meta);
  if (message.content) {
    const content = document.createElement("p");
    content.className = "message-content";
    content.textContent = message.content;
    article.append(content);
  }
  if (message.image_url) {
    const image = document.createElement("img");
    image.className = "message-image";
    image.src = message.image_url;
    image.alt = `Изображение от ${message.login}`;
    image.loading = "lazy";
    article.append(image);
  }
  messageList.append(article);
}

async function refreshMessages() {
  if (!state.room || !state.roomToken) return;
  try {
    const messages = await api(`/api/rooms/${state.room.id}/messages?after=${state.lastMessageId}`, {
      headers: { "X-Room-Token": state.roomToken },
    });
    if (messages.length) {
      const shouldScroll = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 120;
      emptyState.hidden = true;
      for (const message of messages) {
        appendMessage(message);
        state.lastMessageId = message.id;
      }
      if (shouldScroll) messageList.scrollTop = messageList.scrollHeight;
    }
    setStatus("На связи", true);
  } catch (error) {
    setStatus(error.message);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  const submit = loginForm.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    await api("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: loginInput.value.trim() }),
    });
    loginDialog.close();
    await startSession();
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.room || !state.roomToken) return;
  const content = messageInput.value.trim();
  const image = imageInput.files[0];
  if (!content && !image) return;
  const formData = new FormData();
  formData.set("content", content);
  if (image) formData.set("image", image);
  sendButton.disabled = true;
  try {
    await api(`/api/rooms/${state.room.id}/messages`, {
      method: "POST",
      headers: { "X-Room-Token": state.roomToken },
      body: formData,
    });
    messageInput.value = "";
    messageInput.style.height = "";
    imageInput.value = "";
    attachmentName.hidden = true;
    await refreshMessages();
    messageList.scrollTop = messageList.scrollHeight;
  } catch (error) {
    window.alert(error.message);
  } finally {
    sendButton.disabled = false;
  }
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  attachmentName.textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} МБ` : "";
  attachmentName.hidden = !file;
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 130)}px`;
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  window.location.reload();
});

startSession();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
