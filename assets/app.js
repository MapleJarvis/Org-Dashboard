const SUPABASE_URL = "https://rnaqjsscaxunphmonyzg.supabase.co";
const SUPABASE_KEY = "sb_publishable_vx1oCt5WrLzxnM7g_v3LrA_eS91pPBe";
const SUPABASE_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json"
};

const PEOPLE = {
  Daniel: { initials: "DJ", color: "#f97316", title: "Owner" },
  Maple: { initials: "MJ", color: "#38bdf8", title: "Orchestrator" },
  "Engineering Lead": { initials: "EN", color: "#a855f7", title: "Engineering" },
  "Data Operations Lead": { initials: "DO", color: "#22c55e", title: "Data Ops" },
  "Research & Marketing Lead": { initials: "RM", color: "#eab308", title: "Research & Marketing" },
  "Systems & Security Lead": { initials: "SS", color: "#f43f5e", title: "Systems & Security" }
};

const lanesEl = document.getElementById("lanes");
const searchInput = document.getElementById("searchInput");
const refreshBtn = document.getElementById("refreshBtn");
const addTaskBtn = document.getElementById("addTask");
const downloadBtn = document.getElementById("downloadJson");
const lastSyncedEl = document.getElementById("lastSynced");
const modalEl = document.getElementById("taskModal");
const modalTitle = document.getElementById("modalTitle");
const modalMeta = document.getElementById("modalMeta");
const modalCloseBtn = document.getElementById("closeModal");
const modalCancelBtn = document.getElementById("cancelModal");
const formEl = document.getElementById("taskForm");
const titleInput = document.getElementById("taskTitle");
const ownerInput = document.getElementById("taskOwner");
const roleInput = document.getElementById("taskRole");
const statusSelect = document.getElementById("taskStatus");
const prioritySelect = document.getElementById("taskPriority");
const dueDateInput = document.getElementById("taskDue");
const descriptionInput = document.getElementById("taskDescription");
const contextInput = document.getElementById("taskContext");
const nextStepsInput = document.getElementById("taskNextSteps");

const STATUS_META = [
  { key: "backlog", label: "Backlog" },
  { key: "in-progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Complete" }
];

const STORAGE_KEY = "org-dashboard-cache";
let tasks = [];
let activeTaskId = null;

async function fetchTasks() {
  const url = `${SUPABASE_URL}/rest/v1/tasks?select=*`;
  const response = await fetch(url, { headers: SUPABASE_HEADERS });
  if (!response.ok) throw new Error("Supabase fetch failed");
  const data = await response.json();
  storeCache(data);
  return data;
}

async function syncTask(id, updates) {
  const url = `${SUPABASE_URL}/rest/v1/tasks?id=eq.${id}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { ...SUPABASE_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error("Update failed");
  const payload = await response.json();
  return payload[0];
}

async function createTask(payload) {
  const url = `${SUPABASE_URL}/rest/v1/tasks`;
  const response = await fetch(url, {
    method: "POST",
    headers: { ...SUPABASE_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Create failed");
  const data = await response.json();
  return data[0];
}

function storeCache(data) {
  const payload = { updated: new Date().toISOString(), tasks: data };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  updateLastSynced(payload.updated);
}

function loadCache() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    updateLastSynced(parsed.updated);
    return parsed.tasks;
  } catch (err) {
    console.error("Cache parse error", err);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function updateLastSynced(iso) {
  if (!iso) {
    lastSyncedEl.textContent = "–";
    return;
  }
  const date = new Date(iso);
  lastSyncedEl.textContent = date.toLocaleString();
}

function renderBoard(filter = "") {
  lanesEl.innerHTML = "";
  const query = filter.toLowerCase();

  STATUS_META.forEach((status) => {
    const columnTasks = tasks.filter((task) => {
      const matchesStatus = task.status === status.key;
      const matchesSearch =
        task.title.toLowerCase().includes(query) ||
        (task.owner || "").toLowerCase().includes(query) ||
        (task.description || "").toLowerCase().includes(query) ||
        (task.context || "").toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });

    const lane = document.createElement("div");
    lane.className = "lane";
    lane.dataset.status = status.key;
    lane.innerHTML = `
      <div class="lane-header">
        <span class="lane-title">${status.label}</span>
        <span class="lane-count">${columnTasks.length}</span>
      </div>
      <div class="cards" data-drop-zone="${status.key}"></div>
    `;

    const cardsEl = lane.querySelector(".cards");
    columnTasks.forEach((task) => {
      const profile = PEOPLE[task.owner] || { initials: task.owner?.slice(0, 2) || "?", color: "#94a3b8", title: task.role || "" };
      const card = document.createElement("article");
      card.className = "card";
      card.draggable = true;
      card.dataset.id = task.id;
      card.innerHTML = `
        <div class="card-header">
          <div class="avatar" style="background:${profile.color}">${profile.initials}</div>
          <div>
            <p class="owner">${task.owner || "Unassigned"}</p>
            <p class="role">${task.role || profile.title || ""}</p>
          </div>
        </div>
        <h3>${task.title}</h3>
        <p>${task.description || "Add a description"}</p>
        <div class="card-footer">
          <span class="tag priority-${task.priority || "medium"}">${task.priority || "medium"}</span>
          <span>${task.due_date || task.dueDate || ""}</span>
        </div>
      `;
      registerCardInteractions(card, task);
      cardsEl.appendChild(card);
    });

    registerDropHandlers(cardsEl);
    lanesEl.appendChild(lane);
  });
}

function registerCardInteractions(card, task) {
  card.addEventListener("dragstart", (event) => {
    card.classList.add("dragging");
    event.dataTransfer.setData("application/task-id", card.dataset.id);
    event.dataTransfer.effectAllowed = "move";
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
  });

  card.addEventListener("dblclick", () => openTaskModal(task));
}

function registerDropHandlers(zone) {
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });

  zone.addEventListener("drop", async (event) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/task-id");
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const nextStatus = zone.dataset.dropZone;
    if (task.status === nextStatus) return;

    const previousStatus = task.status;
    task.status = nextStatus;
    renderBoard(searchInput.value);

    try {
      const updated = await syncTask(task.id, { status: nextStatus });
      replaceTask(updated);
      storeCache(tasks);
    } catch (err) {
      console.error(err);
      task.status = previousStatus;
      renderBoard(searchInput.value);
      alert("Failed to update task. Please try again.");
    }
  });
}

function replaceTask(updated) {
  tasks = tasks.map((task) => (task.id === updated.id ? { ...task, ...updated } : task));
}

function exportJson() {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tasks.json";
  link.click();
  URL.revokeObjectURL(url);
}

function openTaskModal(task = null) {
  if (task) {
    activeTaskId = task.id;
    modalTitle.textContent = "Edit task";
    modalMeta.textContent = `${task.owner || "Unassigned"} · ${task.role || ""}`;
    titleInput.value = task.title || "";
    ownerInput.value = task.owner || "";
    roleInput.value = task.role || "";
    statusSelect.value = task.status || "backlog";
    prioritySelect.value = task.priority || "medium";
    dueDateInput.value = (task.due_date || task.dueDate || "").slice(0, 10);
    descriptionInput.value = task.description || "";
    contextInput.value = task.context || "";
    nextStepsInput.value = task.next_steps || task.nextSteps || "";
  } else {
    activeTaskId = null;
    formEl.reset();
    modalTitle.textContent = "New task";
    modalMeta.textContent = "Fill in the details and assign an owner";
    statusSelect.value = "backlog";
    prioritySelect.value = "medium";
  }
  modalEl.classList.remove("hidden");
}

function closeTaskModal() {
  activeTaskId = null;
  modalEl.classList.add("hidden");
}

async function initialize() {
  const cached = loadCache();
  if (cached) {
    tasks = cached;
    renderBoard();
  }

  try {
    const fresh = await fetchTasks();
    tasks = fresh;
    renderBoard(searchInput.value);
  } catch (err) {
    console.error(err);
    if (!cached) {
      lanesEl.innerHTML = "<p>Unable to reach Supabase. Check console.</p>";
    }
  }
}

searchInput.addEventListener("input", (event) => {
  renderBoard(event.target.value);
});

refreshBtn.addEventListener("click", () => {
  fetchTasks()
    .then((data) => {
      tasks = data;
      renderBoard(searchInput.value);
    })
    .catch((err) => console.error(err));
});

downloadBtn.addEventListener("click", exportJson);
addTaskBtn.addEventListener("click", () => openTaskModal());
modalCloseBtn.addEventListener("click", closeTaskModal);
modalCancelBtn.addEventListener("click", closeTaskModal);
modalEl.addEventListener("click", (event) => {
  if (event.target === modalEl) closeTaskModal();
});

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    title: titleInput.value.trim(),
    owner: ownerInput.value.trim(),
    role: roleInput.value.trim(),
    status: statusSelect.value,
    priority: prioritySelect.value,
    due_date: dueDateInput.value || null,
    description: descriptionInput.value.trim(),
    context: contextInput.value.trim(),
    next_steps: nextStepsInput.value.trim()
  };

  if (!payload.title || !payload.owner) {
    alert("Title and owner are required.");
    return;
  }

  try {
    if (activeTaskId) {
      const updated = await syncTask(activeTaskId, payload);
      replaceTask(updated);
    } else {
      const created = await createTask(payload);
      tasks = [created, ...tasks];
    }
    storeCache(tasks);
    renderBoard(searchInput.value);
    closeTaskModal();
  } catch (err) {
    console.error(err);
    alert("Failed to save changes. Please try again.");
  }
});

window.addEventListener("load", initialize);
