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
      const text = document.createElement("div");
      const name = document.createElement("strong");
      name.className = "room-manager-name";
      name.textContent = room.name;
      const description = document.createElement("span");
      description.className = "room-manager-description";
      description.textContent = room.description || "Без описания";
      text.append(name, description);
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
      item.append(text, remove);
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
