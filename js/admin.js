const form = document.querySelector("#room-form");
const tokenInput = document.querySelector("#admin-token");
const status = document.querySelector("#form-status");
const createdRoom = document.querySelector("#created-room");
const roomsStatus = document.querySelector("#rooms-status");
const roomManagerList = document.querySelector("#room-manager-list");

tokenInput.value = sessionStorage.getItem("simplechat-admin-token") || "";

async function loadRooms() {
  const token = tokenInput.value;
  roomsStatus.textContent = "";
  roomsStatus.classList.remove("success");
  roomManagerList.replaceChildren();
  if (!token) return;
  try {
    const response = await fetch("/api/admin/rooms", {
      headers: { "X-Admin-Token": token },
    });
    const rooms = await response.json();
    if (!response.ok) throw new Error(typeof rooms.detail === "string" ? rooms.detail : "Не удалось загрузить комнаты");
    if (!rooms.length) {
      const empty = document.createElement("p");
      empty.className = "room-manager-empty";
      empty.textContent = "Комнат пока нет.";
      roomManagerList.append(empty);
      return;
    }
    for (const room of rooms) {
      const item = document.createElement("div");
      item.className = "room-manager-item";
      const top = document.createElement("div");
      top.className = "room-manager-top";
      const text = document.createElement("div");
      const name = document.createElement("strong");
      name.className = "room-manager-name";
      name.textContent = room.name;
      const description = document.createElement("span");
      description.className = "room-manager-description";
      description.textContent = room.description || "Без описания";
      text.append(name, description);
      const actions = document.createElement("div");
      actions.className = "room-manager-actions";
      const messagesToggle = document.createElement("button");
      messagesToggle.type = "button";
      messagesToggle.className = "messages-toggle-button";
      messagesToggle.textContent = "Показать сообщения";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-room-button";
      remove.textContent = "Удалить";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Удалить комнату «${room.name}» и все её сообщения?`)) return;
        remove.disabled = true;
        try {
          const deleteResponse = await fetch(`/api/admin/rooms/${room.id}`, {
            method: "DELETE",
            headers: { "X-Admin-Token": token },
          });
          if (!deleteResponse.ok) {
            const result = await deleteResponse.json();
            throw new Error(typeof result.detail === "string" ? result.detail : "Не удалось удалить комнату");
          }
          roomsStatus.textContent = `Комната «${room.name}» удалена.`;
          roomsStatus.classList.add("success");
          await loadRooms();
        } catch (error) {
          roomsStatus.textContent = error.message;
          remove.disabled = false;
        }
      });
      actions.append(messagesToggle, remove);
      top.append(text, actions);

      const messagesPanel = document.createElement("div");
      messagesPanel.className = "room-messages";
      messagesPanel.hidden = true;

      async function loadMessages() {
        messagesPanel.replaceChildren();
        const loading = document.createElement("p");
        loading.className = "room-manager-empty";
        loading.textContent = "Загрузка сообщений...";
        messagesPanel.append(loading);
        const response = await fetch(`/api/admin/rooms/${room.id}/messages`, {
          headers: { "X-Admin-Token": token },
        });
        const messages = await response.json();
        if (!response.ok) throw new Error(typeof messages.detail === "string" ? messages.detail : "Не удалось загрузить сообщения");
        messagesPanel.replaceChildren();
        if (!messages.length) {
          const empty = document.createElement("p");
          empty.className = "room-manager-empty";
          empty.textContent = "В комнате нет сообщений.";
          messagesPanel.append(empty);
          return;
        }
        for (const message of messages) {
          const row = document.createElement("div");
          row.className = "admin-message";
          const content = document.createElement("div");
          content.className = "admin-message-content";
          const author = document.createElement("strong");
          author.textContent = message.login;
          const textContent = document.createElement("span");
          textContent.textContent = message.content || (message.image_url ? "Изображение" : "");
          content.append(author, textContent);
          const deleteMessage = document.createElement("button");
          deleteMessage.type = "button";
          deleteMessage.className = "delete-message-button";
          deleteMessage.textContent = "Удалить";
          deleteMessage.addEventListener("click", async () => {
            if (!window.confirm(`Удалить сообщение автора «${message.login}»?`)) return;
            deleteMessage.disabled = true;
            try {
              const deleteResponse = await fetch(`/api/admin/rooms/${room.id}/messages/${message.id}`, {
                method: "DELETE",
                headers: { "X-Admin-Token": token },
              });
              if (!deleteResponse.ok) {
                const result = await deleteResponse.json();
                throw new Error(typeof result.detail === "string" ? result.detail : "Не удалось удалить сообщение");
              }
              roomsStatus.textContent = "Сообщение удалено.";
              roomsStatus.classList.add("success");
              await loadMessages();
            } catch (error) {
              roomsStatus.textContent = error.message;
              deleteMessage.disabled = false;
            }
          });
          row.append(content, deleteMessage);
          messagesPanel.append(row);
        }
      }

      messagesToggle.addEventListener("click", async () => {
        if (!messagesPanel.hidden) {
          messagesPanel.hidden = true;
          messagesToggle.textContent = "Показать сообщения";
          return;
        }
        messagesPanel.hidden = false;
        messagesToggle.textContent = "Скрыть сообщения";
        try {
          await loadMessages();
        } catch (error) {
          roomsStatus.textContent = error.message;
        }
      });

      item.append(top, messagesPanel);
      roomManagerList.append(item);
    }
  } catch (error) {
    roomsStatus.textContent = error.message;
  }
}

tokenInput.addEventListener("change", () => {
  loadRooms();
});

loadRooms();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";
  status.classList.remove("success");
  createdRoom.hidden = true;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  const token = tokenInput.value;
  try {
    const response = await fetch("/api/admin/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Token": token },
      body: JSON.stringify({
        name: document.querySelector("#room-name").value.trim(),
        description: document.querySelector("#room-description").value.trim(),
        password: document.querySelector("#room-password").value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Не удалось создать комнату");
    sessionStorage.setItem("simplechat-admin-token", token);
    document.querySelector("#created-name").textContent = result.name;
    document.querySelector("#created-description").textContent = result.description || "Без описания";
    createdRoom.hidden = false;
    status.textContent = "Готово. Комната уже доступна в общем списке.";
    status.classList.add("success");
    form.reset();
    tokenInput.value = token;
    await loadRooms();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});
