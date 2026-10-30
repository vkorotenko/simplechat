const form = document.querySelector("#room-form");
const tokenInput = document.querySelector("#admin-token");
const status = document.querySelector("#form-status");
const createdRoom = document.querySelector("#created-room");

tokenInput.value = sessionStorage.getItem("simplechat-admin-token") || "";

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
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});
