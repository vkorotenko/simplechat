const loginDialog = document.querySelector("#login-dialog");
const loginForm = document.querySelector("#login-form");
const loginInput = document.querySelector("#login-input");
const loginError = document.querySelector("#login-error");
const roomList = document.querySelector("#room-list");
const messageList = document.querySelector("#message-list");
const emptyState = document.querySelector("#empty-state");
const loadOlderButton = document.querySelector("#load-older-button");
const messageForm = document.querySelector("#message-form");
const messageInput = document.querySelector("#message-input");
const imageInput = document.querySelector("#image-input");
const attachmentName = document.querySelector("#attachment-name");
const sendButton = messageForm.querySelector("button[type=submit]");
const MESSAGE_PAGE_SIZE = 50;
const state = {
  user: null,
  adminToken: localStorage.getItem("simplechat-admin-token")
    || sessionStorage.getItem("simplechat-admin-token")
    || null,
  room: null,
  rooms: [],
  roomToken: null,
  lastMessageId: 0,
  hasOlderMessages: false,
  loadingOlderMessages: false,
  pollTimer: null,
};

function roomIdFromPath() {
  const match = window.location.pathname.match(/^\/c_(\d+)$/);
  return match ? Number(match[1]) : null;
}

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
    const headers = state.adminToken ? { "X-Admin-Token": state.adminToken } : {};
    state.user = await api("/api/me", { headers });
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
    state.rooms = rooms;
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
    const roomId = roomIdFromPath();
    if (roomId !== null) {
      const room = rooms.find((item) => item.id === roomId);
      if (room) {
        await openRoom(room, false);
      } else {
        setStatus("Комната не найдена");
      }
    }
  } catch (error) {
    setStatus(error.message);
  }
}

async function openRoom(room, updateHistory = true) {
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
    state.hasOlderMessages = false;
    state.loadingOlderMessages = false;
    clearInterval(state.pollTimer);
    messageList.replaceChildren();
    messageList.append(loadOlderButton, emptyState);
    loadOlderButton.hidden = true;
    loadOlderButton.disabled = false;
    emptyState.hidden = false;
    document.querySelector("#room-title").textContent = room.name;
    document.querySelector("#room-description").textContent = room.description || "Без описания";
    document.querySelector("#room-eyebrow").textContent = room.has_password ? "ЗАКРЫТАЯ КОМНАТА" : "ОТКРЫТАЯ КОМНАТА";
    document.querySelectorAll(".room-item").forEach((item) => item.classList.toggle("active", Number(item.dataset.roomId) === room.id));
    messageInput.disabled = false;
    sendButton.disabled = false;
    if (updateHistory && roomIdFromPath() !== room.id) {
      window.history.pushState({ roomId: room.id }, "", `/c_${room.id}`);
    }
    await refreshMessages();
    messageInput.focus();
    state.pollTimer = window.setInterval(refreshMessages, 2500);
  } catch (error) {
    window.alert(error.message);
  }
}

function clearRoom() {
  state.room = null;
  state.roomToken = null;
  clearInterval(state.pollTimer);
  state.pollTimer = null;
  state.hasOlderMessages = false;
  state.loadingOlderMessages = false;
  messageList.replaceChildren(loadOlderButton, emptyState);
  loadOlderButton.hidden = true;
  emptyState.hidden = false;
  document.querySelector("#room-title").textContent = "Выберите комнату";
  document.querySelector("#room-description").textContent = "Сообщения появятся здесь.";
  document.querySelector("#room-eyebrow").textContent = "ПРОСТРАНСТВО ДЛЯ РАЗГОВОРА";
  document.querySelectorAll(".room-item").forEach((item) => item.classList.remove("active"));
  messageInput.disabled = true;
  sendButton.disabled = true;
  setStatus("Не подключено");
}

window.addEventListener("popstate", () => {
  const roomId = roomIdFromPath();
  if (roomId === null) {
    clearRoom();
    return;
  }
  const room = state.rooms.find((item) => item.id === roomId);
  if (room) {
    openRoom(room, false);
  } else {
    clearRoom();
    setStatus("Комната не найдена");
  }
});

function createMessage(message) {
  const article = document.createElement("article");
  article.className = "message";
  article.dataset.messageId = String(message.id);
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
  if (state.user?.is_admin && state.adminToken) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-message-inline";
    deleteButton.textContent = "Удалить";
    deleteButton.setAttribute("aria-label", `Удалить сообщение автора ${message.login}`);
    deleteButton.addEventListener("click", async () => {
      if (!window.confirm(`Удалить сообщение автора «${message.login}»?`)) return;
      deleteButton.disabled = true;
      try {
        await api(`/api/admin/messages/${message.id}`, {
          method: "DELETE",
          headers: { "X-Admin-Token": state.adminToken },
        });
        article.remove();
        if (!messageList.querySelector(".message")) {
          emptyState.hidden = false;
        }
      } catch (error) {
        window.alert(error.message);
        deleteButton.disabled = false;
      }
    });
    meta.append(deleteButton);
  }
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
  return article;
}

async function refreshMessages() {
  if (!state.room || !state.roomToken) return;
  try {
    const initialLoad = state.lastMessageId === 0;
    const query = initialLoad ? "" : `?after=${state.lastMessageId}`;
    let messages = await api(`/api/rooms/${state.room.id}/messages${query}`, {
      headers: { "X-Room-Token": state.roomToken },
    });
    if (initialLoad) {
      state.hasOlderMessages = messages.length > MESSAGE_PAGE_SIZE;
      if (state.hasOlderMessages) messages = messages.slice(-MESSAGE_PAGE_SIZE);
      loadOlderButton.hidden = !state.hasOlderMessages;
    }
    if (messages.length) {
      const shouldScroll = !initialLoad
        && messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 120;
      emptyState.hidden = true;
      for (const message of messages) {
        messageList.append(createMessage(message));
        state.lastMessageId = message.id;
      }
      if (shouldScroll || initialLoad) {
        messageList.scrollTop = messageList.scrollHeight;
      }
    }
    setStatus("На связи", true);
  } catch (error) {
    setStatus(error.message);
  }
}

loadOlderButton.addEventListener("click", async () => {
  if (!state.room || !state.roomToken || !state.hasOlderMessages || state.loadingOlderMessages) return;
  const firstMessage = messageList.querySelector(".message[data-message-id]");
  if (!firstMessage) return;
  const firstMessageId = Number(firstMessage.dataset.messageId);
  const previousTop = firstMessage.getBoundingClientRect().top;
  state.loadingOlderMessages = true;
  loadOlderButton.disabled = true;
  try {
    const messages = await api(`/api/rooms/${state.room.id}/messages?before=${firstMessageId}`, {
      headers: { "X-Room-Token": state.roomToken },
    });
    state.hasOlderMessages = messages.length > MESSAGE_PAGE_SIZE;
    const olderMessages = state.hasOlderMessages ? messages.slice(-MESSAGE_PAGE_SIZE) : messages;
    for (const message of olderMessages) {
      messageList.insertBefore(createMessage(message), firstMessage);
    }
    loadOlderButton.hidden = !state.hasOlderMessages;
    if (olderMessages.length) {
      messageList.scrollTop += firstMessage.getBoundingClientRect().top - previousTop;
    }
  } catch (error) {
    setStatus(error.message);
  } finally {
    state.loadingOlderMessages = false;
    loadOlderButton.disabled = false;
  }
});

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
    messageInput.focus();
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
