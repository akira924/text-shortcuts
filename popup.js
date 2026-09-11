const listEl = document.getElementById("list");
const form = document.getElementById("add-form");
const keyInput = document.getElementById("key-input");
const valueInput = document.getElementById("value-input");

function render(shortcuts) {
  listEl.innerHTML = "";
  const keys = Object.keys(shortcuts).sort();

  if (keys.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No shortcuts yet.";
    listEl.appendChild(li);
    return;
  }

  for (const key of keys) {
    const li = document.createElement("li");

    const label = document.createElement("div");
    label.className = "key";
    label.textContent = key;

    const value = document.createElement("div");
    value.className = "value";
    value.textContent = shortcuts[key];

    const controls = document.createElement("div");
    controls.className = "controls";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      keyInput.value = key;
      valueInput.value = shortcuts[key];
      keyInput.focus();
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => removeShortcut(key));

    controls.append(editBtn, delBtn);
    li.append(label, value, controls);
    listEl.appendChild(li);
  }
}

function loadAndRender() {
  chrome.storage.sync.get("shortcuts", (data) => {
    render(data.shortcuts || {});
  });
}

function removeShortcut(key) {
  chrome.storage.sync.get("shortcuts", (data) => {
    const shortcuts = data.shortcuts || {};
    delete shortcuts[key];
    chrome.storage.sync.set({ shortcuts });
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const key = keyInput.value.trim();
  const value = valueInput.value;
  if (!key || !value) return;

  chrome.storage.sync.get("shortcuts", (data) => {
    const shortcuts = data.shortcuts || {};
    shortcuts[key] = value;
    chrome.storage.sync.set({ shortcuts }, () => {
      keyInput.value = "";
      valueInput.value = "";
    });
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.shortcuts) {
    render(changes.shortcuts.newValue || {});
  }
});

loadAndRender();
