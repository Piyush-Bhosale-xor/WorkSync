
// dashboard.js — final: uses only `search=` for task queries (space-separated tokens)
// Updated: use /api/get_user/ for project member suggestions to ensure correct IDs.
console.log("[Dashboard] script loaded");

const API_BASE = "http://127.0.0.1:8000";
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const H = s => (typeof s === "string" ? s.replace(/[&<>'\"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])) : s);

// -------- Auth helpers --------
const getAccessToken = () => localStorage.getItem("access_token");
const getRefreshToken = () => localStorage.getItem("refresh_token");
const setTokens = ({ access, refresh }) => { if (access) localStorage.setItem("access_token", access); if (refresh) localStorage.setItem("refresh_token", refresh); };
const clearTokens = () => { localStorage.removeItem("access_token"); localStorage.removeItem("refresh_token"); };
const authHeaders = () => { const t = getAccessToken(); return t ? { "Authorization": "Bearer " + t } : {}; };
const logout = () => { clearTokens(); location.href = "login.html"; };

// -------- Minimal API wrapper with refresh --------
let _refreshing = null;
async function tryRefresh() {
  const refresh = getRefreshToken();
  if (!refresh) { logout(); throw new Error("No refresh token"); }
  if (!_refreshing) {
    _refreshing = fetch(`${API_BASE}/api/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh })
    }).then(r => r.json()).then(data => {
      _refreshing = null;
      if (!data?.access) { logout(); throw new Error("Refresh failed"); }
      setTokens({ access: data.access });
      return data.access;
    }).catch(err => { _refreshing = null; throw err; });
  }
  return _refreshing;
}
async function apiFetch(path, opts = {}) {
  const full = `${API_BASE}${path}`;
  const init = { headers: { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) }, ...opts };
  let res = await fetch(full, init);
  if (res.status === 401) {
    await tryRefresh();
    init.headers = { ...init.headers, ...authHeaders() };
    res = await fetch(full, init);
  }
  return res;
}
async function apiGet(path) {
  const r = await apiFetch(path, { method: "GET" });
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return txt; }
}
async function apiPost(path, body) {
  const r = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(txt || r.statusText);
  try { return JSON.parse(txt); } catch { return txt; }
}
async function apiPatch(path, body) {
  const r = await apiFetch(path, { method: "PATCH", body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(txt || r.statusText);
  try { return JSON.parse(txt); } catch { return txt; }
}
async function apiDelete(path) {
  const r = await apiFetch(path, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return true;
}

// -------- State --------
const STATE = {
  projects: [],
  tasks: [],
  users: [],
  selectedProjectId: null,
  currentTaskId: null,
  addedProjectMembers: [],
  currentUserRole: null
};

// --------- Utilities ---------
const safeName = o => {
  if (!o) return null;
  if (typeof o === "string") return o;
  if (o.username) return o.username;
  if (o.name) return o.name;
  if (o.user && o.user.username) return o.user.username;
  return null;
};
const safeId = o => {
  if (!o) return null;
  if (typeof o === "number") return o;
  if (o.id) return o.id;
  if (o.pk) return o.pk;
  if (o.user && o.user.id) return o.user.id;
  return null;
};

// resolve username input to id when possible — otherwise keep string (server search will handle)
function resolveUsernameInput(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const low = s.toLowerCase();
  for (const u of STATE.users) {
    const uname = (safeName(u) || "").toLowerCase();
    if (uname === low) return safeId(u);
  }
  for (const u of STATE.users) {
    const uname = (safeName(u) || "").toLowerCase();
    if (uname.startsWith(low)) return safeId(u);
  }
  return s; // let backend fuzzy-search by username or other fields
}

// ----------------- CRITICAL: build search-only query -----------------
// The server expects a single 'search' query: space-separated tokens
// Format: search = "<projectId> <priority> <status> <assigned_username_or_id_or_term> <global-search-text>"
function buildTaskSearchQuery() {
  const tokens = [];

  // project id as first token (if selected)
  if (STATE.selectedProjectId) tokens.push(String(STATE.selectedProjectId));

  // priority token
  const pri = ($("#filter-priority") && $("#filter-priority").value) || "";
  if (pri) tokens.push(pri);

  // status token
  const st = ($("#filter-status") && $("#filter-status").value) || "";
  if (st) tokens.push(st);

  // assigned username / id (resolve to id if possible; otherwise send as text)
  const userInput = ($("#filter-user") && $("#filter-user").value) || "";
  if (userInput) {
    const resolved = resolveUsernameInput(userInput);
    tokens.push(String(resolved));
  }

  // global search box
  const global = ($("#search") && $("#search").value) || "";
  if (global) tokens.push(global);

  // join with single space and encode
  if (tokens.length === 0) return "";
  const joined = tokens.join(" ").trim();
  return `?search=${encodeURIComponent(joined)}`;
}

// --------- Rendering helpers & UI ---------
// --- helper: resolve numeric user id to username (fallback if unknown) ---
function usernameOrFallback(id, fallback = "—") {
  if (id == null) return fallback;
  const num = Number(id);
  // check cached users list first
  for (const u of STATE.users || []) {
    if (safeId(u) === num) return safeName(u) || fallback;
  }
  // check project members as extra source
  for (const p of STATE.projects || []) {
    const members = p.members_user || p.members || [];
    for (const m of members) {
      if (safeId(m) === num) return safeName(m) || fallback;
    }
  }
  // last resort
  return fallback || `Unknown (ID ${id})`;
}

function showError(msg) {
  const e = $("#dash-error"); if (!e) return console.error(msg);
  e.textContent = msg || "Something went wrong"; e.hidden = false;
}
function clearError() {
  const e = $("#dash-error"); if (!e) return; e.textContent = ""; e.hidden = true;
}
function updateProjectHeader() {
  const p = STATE.projects.find(x => x.id === STATE.selectedProjectId) || null;
  $("#project-title") && ($("#project-title").textContent = p ? (p.name || "Project") : "Project");
  $("#project-meta") && ($("#project-meta").textContent = p ? (`Members: ${((p.members_user||p.members||[]).map(m=>safeName(m)).filter(Boolean).join(", ") || "—")}`) : "");
}

// Render project list with Open/Delete buttons
function renderProjects() {
  const wrap = $("#projects-list"); if (!wrap) return;
  wrap.innerHTML = "";
  for (const p of STATE.projects) {
    const div = document.createElement("div");
    div.className = "item" + (p.id === STATE.selectedProjectId ? " active" : "");
    div.dataset.pid = p.id;
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="flex:1;cursor:pointer" data-role="project-click">
          <strong>${H(p.name || "Untitled")}</strong>
          <div class="muted" style="font-size:13px">${H(p.description || "")}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn ghost btn-project-open" data-id="${H(String(p.id))}">Open</button>
          <button class="btn danger btn-project-delete" data-id="${H(String(p.id))}">Delete</button>
        </div>
      </div>
    `;
    wrap.appendChild(div);
  }

  $$(".btn-project-open").forEach(b => b.onclick = e => { const id = Number(e.currentTarget.dataset.id); selectProject(id); });
  $$(".btn-project-delete").forEach(b => b.onclick = async e => {
    const id = Number(e.currentTarget.dataset.id);
    if (!confirm(`Delete project #${id}?`)) return;
    try { await apiPatch(`/api/project/${id}/`, { is_deleted: true }); await loadAll(); } catch (err) { alert("Delete project failed: " + (err.message || err)); }
  });

  wrap.querySelectorAll("[data-role='project-click']").forEach(el => {
    el.addEventListener("click", () => {
      const parent = el.closest(".item");
      if (!parent) return;
      const id = Number(parent.dataset.pid);
      selectProject(id);
    });
  });

  const pc = $("#project-count"); if (pc) pc.textContent = String((STATE.projects || []).length || 0);
}


// ---- Pagination-aware task fetching & controls (added by ChatGPT) ----

// ensure STATE has pagination fields
if (!STATE.taskPagination) {
  STATE.taskPagination = { count: 0, next: null, previous: null, currentPage: 1, pageSize: 3 };
}

// Build query params string for tasks: includes search tokens and page number
function buildTaskQueryParams(page = 1) {
  // buildTaskSearchQuery() in your code may return a string like "?search=1&status=pending" or "search=1"
  // Normalize it and add page param.
  let searchPart = "";
  try {
    searchPart = buildTaskSearchQuery() || "";
  } catch (e) {
    // fallback if buildTaskSearchQuery not available
    searchPart = "";
  }
  searchPart = String(searchPart).replace(/^\?+/, ""); // remove leading '?'
  const qs = new URLSearchParams(searchPart);
  qs.set('page', String(page));
  return `?${qs.toString()}`;
}

// Fetch tasks for the selected project (handles DRF pagination response)
// Replace your existing fetchTasksForSelectedProject with this robust version:

async function fetchTasksForSelectedProject(page = 1) {
  const loader = document.getElementById('tasks-loader');
  try {
    if (loader) loader.style.display = 'block';

    const params = buildTaskQueryParams(page);
    const resp = await apiGet(`/api/task/${params}`); // parsed JSON

    // Debug: log the raw response so you can see what's being returned
    console.debug('fetchTasksForSelectedProject raw response:', resp);

    // Normalize tasks into an array no matter what
    let tasksArray = [];

    if (Array.isArray(resp)) {
      // backend returned plain array
      tasksArray = resp;
      STATE.taskPagination = { count: resp.length, next: null, previous: null, currentPage: 1, pageSize: resp.length };
    } else if (resp && typeof resp === 'object') {
      // Common DRF paginated shape: { count, next, previous, results: [...] }
      if (Array.isArray(resp.results)) {
        tasksArray = resp.results;
        STATE.taskPagination = {
          count: resp.count || tasksArray.length,
          next: resp.next || null,
          previous: resp.previous || null,
          currentPage: page,
          pageSize: (resp.results || []).length || STATE.taskPagination.pageSize || 3
        };
      }
      // Some APIs use data or tasks key
      else if (Array.isArray(resp.data)) {
        tasksArray = resp.data;
        STATE.taskPagination = { count: resp.total || tasksArray.length, next: resp.next || null, previous: resp.previous || null, currentPage: page, pageSize: tasksArray.length };
      } else if (Array.isArray(resp.tasks)) {
        tasksArray = resp.tasks;
        STATE.taskPagination = { count: resp.count || tasksArray.length, next: resp.next || null, previous: resp.previous || null, currentPage: page, pageSize: tasksArray.length };
      } else {
        // Fallback: if the response is an object but contains no array, try to guard:
        // maybe the API returned single object for a task; coerce to single-element array
        if (Object.keys(resp).length > 0 && resp.id) {
          tasksArray = [resp];
          STATE.taskPagination = { count: 1, next: null, previous: null, currentPage: page, pageSize: 1 };
        } else {
          tasksArray = [];
          STATE.taskPagination = { count: 0, next: null, previous: null, currentPage: page, pageSize: 0 };
        }
      }
    } else {
      // resp is null/undefined/primitive
      tasksArray = [];
      STATE.taskPagination = { count: 0, next: null, previous: null, currentPage: page, pageSize: 0 };
    }

    // Finally set STATE.tasks to an array (guaranteed)
    STATE.tasks = tasksArray;

    // Render UI
    if (typeof renderTasksForSelectedProject === 'function') renderTasksForSelectedProject();
    if (typeof renderTaskPaginationControls === 'function') renderTaskPaginationControls();
    updatePendingCount && updatePendingCount();

  } catch (err) {
    console.error("fetchTasksForSelectedProject err", err);
    if (typeof showError === 'function') showError("Failed to load tasks: " + (err.message || err));
  } finally {
    if (loader) loader.style.display = 'none';
  }
}

// Safe version of updatePendingCount (use this or replace your existing fn)
function updatePendingCount() {
  try {
    const pendingCountEl = document.getElementById('pending-count');
    const tasks = Array.isArray(STATE.tasks) ? STATE.tasks : [];
    const pending = tasks.filter(t => String((t.status || "").toLowerCase()) === "pending").length;
    if (pendingCountEl) pendingCountEl.textContent = String(pending);
  } catch (e) {
    console.error('updatePendingCount error', e);
  }
}

// Simple pagination controls renderer (expects an element with id="task-pagination")
function renderTaskPaginationControls() {
  const pag = STATE.taskPagination || { count: 0, next: null, previous: null, currentPage: 1, pageSize: 3 };
  const container = document.getElementById('task-pagination');
  if (!container) return;

  container.innerHTML = ''; // clear

  const prevBtn = document.createElement('button');
  prevBtn.textContent = 'Prev';
  prevBtn.disabled = !pag.previous && pag.currentPage <= 1;
  prevBtn.className = 'pag-btn prev-btn';
  prevBtn.onclick = () => {
    if (pag.currentPage <= 1) return;
    fetchTasksForSelectedProject(pag.currentPage - 1);
  };

  const totalPages = Math.max(1, Math.ceil((pag.count || 0) / (pag.pageSize || 3)));
  const pageInfo = document.createElement('span');
  pageInfo.textContent = ` Page ${pag.currentPage} of ${totalPages} `;

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next';
  nextBtn.disabled = !pag.next && pag.currentPage >= totalPages;
  nextBtn.className = 'pag-btn next-btn';
  nextBtn.onclick = () => {
    if (pag.currentPage >= totalPages) return;
    fetchTasksForSelectedProject(pag.currentPage + 1);
  };

  container.appendChild(prevBtn);
  container.appendChild(pageInfo);
  container.appendChild(nextBtn);
}

// When selecting a project, reset page to 1 and fetch tasks for that project
function selectProject_patched(id) {
  STATE.selectedProjectId = Number(id);
  // reset pagination page
  STATE.taskPagination.currentPage = 1;
  // UI updates (existing helpers)
  if (typeof renderProjects === 'function') renderProjects();
  if (typeof updateProjectHeader === 'function') updateProjectHeader();
  // fetch tasks for selected project page 1
  fetchTasksForSelectedProject(1);
}

// Replace original selectProject if present, otherwise define new selectProject

// Original selectProject replaced above. Use selectProject_patched instead.


// Render tasks for selected project (pending tasks are shown inline)
function renderTasksForSelectedProject() {
  const tbody = $("#tasks-tbody"); if (!tbody) return;
  tbody.innerHTML = "";
  const pid = STATE.selectedProjectId;
  if (!pid) { tbody.innerHTML = "<tr><td colspan='7' class='empty'>Select a project</td></tr>"; return; }
  const rows = (STATE.tasks || []).filter(t => Number(t.project?.id ?? t.project) === Number(pid));
  if (rows.length === 0) { tbody.innerHTML = "<tr><td colspan='7' class='empty'>No tasks</td></tr>"; return; }

  const isManager = String(STATE.currentUserRole || "").toLowerCase() === "manager";

  for (const t of rows) {
    const tr = document.createElement("tr");
    if (t.delay_status === true || String(t.delay_status) === "true") tr.classList.add("row-delayed");
    else if (String((t.status || "").toLowerCase()) === "completed") tr.classList.add("row-completed");

    const assignedTo = safeName(t.assigned_to_user) || safeName(t.assigned_to) || "—";
    const assignedBy = safeName(t.assigned_by_user) || safeName(t.assigned_by) || "—";
    const statusLower = String((t.status || "").toLowerCase());
    const isPending = statusLower === "pending";

    let actionsHtml = "";
    if (isPending) {
      if (isManager) {
        actionsHtml = `<button class="btn primary btn-approve" data-id="${H(String(t.id))}">Approve</button>
                       <button class="btn ghost btn-edit" data-id="${H(String(t.id))}">Edit</button>
                       <button class="btn danger btn-reject" data-id="${H(String(t.id))}">Reject</button>`;
      } else {
        actionsHtml = `<span class="badge-status delayed" style="padding:6px 10px; margin-right:8px">PENDING</span>
                       <button class="btn ghost btn-edit" data-id="${H(String(t.id))}">Edit</button>`;
      }
    } else {
      actionsHtml = `<button class="btn ghost btn-edit" data-id="${H(String(t.id))}">Edit</button>
                     <button class="btn ghost btn-more" data-id="${H(String(t.id))}">More</button>
                     <button class="btn danger btn-delete" data-id="${H(String(t.id))}">Delete</button>`;
    }

    tr.innerHTML = `
      <td>#${H(String(t.id))}</td>
      <td>${H(t.name || "Untitled")}</td>
      <td>${H(t.status || "—")}</td>
      <td>${H(t.priority || "—")}</td>
      <td>${H(assignedTo)}</td>
      <td>${H(assignedBy)}</td>
      <td style="text-align:right">${actionsHtml}</td>
    `;
    tbody.appendChild(tr);
  }

  // wire actions
  $$(".btn-edit").forEach(b => b.onclick = e => { e.stopPropagation(); openUpdateModal(Number(e.currentTarget.dataset.id)); });
  $$(".btn-more").forEach(b => b.onclick = e => { e.stopPropagation(); const id = Number(e.currentTarget.dataset.id); const task = STATE.tasks.find(x => x.id === id); if (task) openDetailsModal(task); });
  $$(".btn-delete").forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const id = Number(e.currentTarget.dataset.id);
    if (!confirm(`Delete task #${id}?`)) return;
    try { await apiDelete(`/api/task/${id}/`); await loadAll(); } catch (err) { alert("Delete failed: " + (err.message || err)); }
  });

  // manager-only approve/reject endpoints (note: your backend urls are /api/task_approve/<id>/ and /api/task_reject/<id>/)
  $$(".btn-approve").forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const id = Number(e.currentTarget.dataset.id);
    if (!confirm(`Approve task #${id}?`)) return;
    try { await apiPatch(`/api/task_approve/${id}/`, { status: "todo" }); await loadAll(); } catch (err) { alert("Approve failed: " + (err.message || err)); }
  });
  $$(".btn-reject").forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const id = Number(e.currentTarget.dataset.id);
    if (!confirm(`Reject task #${id}?`)) return;
    try { await apiPatch(`/api/task_reject/${id}/`, { status: "rejected" }); await loadAll(); } catch (err) { alert("Reject failed: " + (err.message || err)); }
  });
}

// -------- details modal --------
function formatDate(iso) { if (!iso) return "—"; try { const d = new Date(iso); if (isNaN(d.getTime())) return String(iso); return d.toLocaleString(); } catch { return String(iso); } }
function buildDetailsHTML(task) {
  const boolToYesNo = v => (v === true || String(v).toLowerCase() === "true") ? "Yes" : (v === false || String(v).toLowerCase() === "false") ? "No" : "—";

  return `
    <table style="width:100%;border-collapse:collapse;font-family:system-ui,Segoe UI,Roboto,Arial;font-size:14px;">
      <tr><td style="font-weight:600;width:30%;padding:8px 10px;vertical-align:top">ID</td><td style="padding:8px 10px;vertical-align:top">${H(String(task.id))}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Name</td><td style="padding:8px 10px;vertical-align:top">${H(task.name || "—")}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Description</td><td style="padding:8px 10px;vertical-align:top">${H(task.description || "—")}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Project</td><td style="padding:8px 10px;vertical-align:top">${H((task.project && (task.project.name || task.project)) || task.project || "—")}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Status</td><td style="padding:8px 10px;vertical-align:top">${H(task.status || "—")}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Priority</td><td style="padding:8px 10px;vertical-align:top">${H(task.priority || "—")}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Assigned To</td><td style="padding:8px 10px;vertical-align:top">${H(safeName(task.assigned_to_user) || safeName(task.assigned_to) || "—")}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Assigned By</td><td style="padding:8px 10px;vertical-align:top">${H(safeName(task.assigned_by_user) || safeName(task.assigned_by) || "—")}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">ETA</td><td style="padding:8px 10px;vertical-align:top">${H(task.eta || "—")}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Created At</td><td style="padding:8px 10px;vertical-align:top">${H(task.created_at ? formatDate(task.created_at) : "—")}</td></tr>

      <!-- new fields -->
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Modified At</td><td style="padding:8px 10px;vertical-align:top">${H(task.modified_at ? formatDate(task.modified_at) : "—")}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Modified By</td><td style="padding:8px 10px;vertical-align:top">${H(usernameOrFallback(safeId(task.modified_by), "—"))}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Delay Status</td><td style="padding:8px 10px;vertical-align:top">${H(boolToYesNo(task.delay_status))}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Task Age (days)</td><td style="padding:8px 10px;vertical-align:top">${H((task.task_age != null) ? String(task.task_age) : "—")}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Days Left</td><td style="padding:8px 10px;vertical-align:top">${H((task.days_left != null) ? String(task.days_left) : "—")}</td></tr>
      <tr><td style="font-weight:600;padding:8px 10px;vertical-align:top">Delayed Days</td><td style="padding:8px 10px;vertical-align:top">${H((task.delayed_days != null) ? String(task.delayed_days) : "—")}</td></tr>
    </table>
  `;
}

function openDetailsModal(task) { const body = $("#details-body"); if (!body) return; body.innerHTML = buildDetailsHTML(task); openModal($("#details-modal")); }

// -------- modals (small) --------
function openModal(el) { if (!el) return; el.classList.remove("hidden"); el.setAttribute("aria-hidden", "false"); focusFirst(el); }
function closeModal(el) { if (!el) return; el.classList.add("hidden"); el.setAttribute("aria-hidden", "true"); }
function focusFirst(container) { if (!container) return; const s='input:not([disabled]),button:not([disabled]),select:not([disabled]),textarea:not([disabled])'; const el = container.querySelector(s); if (el && typeof el.focus==='function') el.focus(); }

// -------- create/update flows --------
function fillMembersSelect(selectEl, project) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const blank = document.createElement("option"); blank.value=""; blank.textContent="— Select member —"; selectEl.appendChild(blank);
  const list = project?.members_user ?? project?.members ?? [];
  if (!Array.isArray(list) || list.length === 0) { const none = document.createElement("option"); none.value=""; none.textContent="(no members)"; selectEl.appendChild(none); return; }
  for (const m of list) { const id = safeId(m); const name = safeName(m) || `user#${id}`; const opt = document.createElement("option"); opt.value = id; opt.textContent = name; selectEl.appendChild(opt); }
}
function isoToDateInput(iso) { if (!iso) return ""; try { const d = new Date(iso); if (isNaN(d.getTime())) return iso; const pad=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;} catch { return ""; } }

function openCreateModal() {
  const project = STATE.projects.find(p => p.id === STATE.selectedProjectId);
  if (!project) { alert("Select a project first."); return; }
  $("#create-name").value=""; $("#create-description").value=""; $("#create-priority").value="medium";
  if ($("#create-eta")) $("#create-eta").value="";
  fillMembersSelect($("#create-assignedto"), project);
  if ($("#create-name")) { $("#create-name").style.padding="10px 12px"; $("#create-name").style.fontSize="16px"; }
  openModal($("#create-modal"));
}

async function handleCreate(e) {
  if (e && e.preventDefault) e.preventDefault();
  const pid = STATE.selectedProjectId; if (!pid) { alert("Select a project first."); return; }
  const assigned = ($("#create-assignedto") && $("#create-assignedto").value) || "";
  const payload = { project: Number(pid), name: ($("#create-name").value||"").trim(), description: ($("#create-description").value||"").trim(), priority: $("#create-priority").value || "medium" };
  if ($("#create-eta") && $("#create-eta").value) payload.eta = $("#create-eta").value;
  const role = STATE.currentUserRole;
  try {
    if (role && String(role).toLowerCase() === "employee") {
      // employee -> emp_task
      await apiPost("/api/emp_task", payload);
      closeModal($("#create-modal")); await loadAll(); alert("Task created and pending approval.");
      return;
    } else {
      if (assigned) payload.assigned_to = Number(assigned);
      payload.status = $("#create-status") ? $("#create-status").value || "todo" : "todo";
      await apiPost("/api/task/", payload);
      closeModal($("#create-modal")); await loadAll(); return;
    }
  } catch (err) { console.error("create error", err); alert("Create failed: " + (err.message || err)); }
}

function openUpdateModal(taskId) {
  const task = STATE.tasks.find(t => t.id === Number(taskId)); if (!task) return;
  STATE.currentTaskId = taskId;
  $("#update-name").value = task.name || "";
  $("#update-description").value = task.description || "";
  $("#update-status").value = task.status || "todo";
  $("#update-priority").value = task.priority || "medium";
  fillMembersSelect($("#update-assignedto"), STATE.projects.find(p => p.id === STATE.selectedProjectId));
  const assId = safeId(task.assigned_to_user) ?? safeId(task.assigned_to) ?? "";
  if ($("#update-assignedto")) $("#update-assignedto").value = assId || "";
  if ($("#update-eta")) $("#update-eta").value = isoToDateInput(task.eta);
  if ($("#update-name")) { $("#update-name").style.padding="10px 12px"; $("#update-name").style.fontSize="16px"; }
  openModal($("#update-modal"));
}

async function handleUpdate(e) {
  if (e && e.preventDefault) e.preventDefault();
  const id = STATE.currentTaskId; if (!id) return;
  const payload = {
    name: ($("#update-name").value||"").trim(),
    description: ($("#update-description").value||"").trim(),
    status: $("#update-status").value,
    priority: $("#update-priority").value,
    assigned_to: ($("#update-assignedto").value) ? Number($("#update-assignedto").value) : null
  };
  if ($("#update-eta") && $("#update-eta").value) payload.eta = $("#update-eta").value;
  try { await apiPatch(`/api/task/${id}/`, payload); closeModal($("#update-modal")); await loadAll(); } catch (err) { alert("Update failed: " + (err.message || err)); }
}

// -------- project creation with member suggestions --------
let _projDeb = null;
// IMPORTANT: use /api/get_user/ to get exact id/username list from backend
async function searchUsers(q) {
  if (!q) return [];
  try {
    const all = await apiGet("/api/get_user/");
    const lower = q.toLowerCase();
    return (Array.isArray(all) ? all : []).filter(u => (safeName(u) || "").toLowerCase().includes(lower)).slice(0, 10)
      .map(u => ({ id: Number(safeId(u)), username: safeName(u) }));
  } catch (err) { console.error("searchUsers", err); return []; }
}
function renderAddedProjectMembers() {
  const wrap = $("#project-members-added"); if (!wrap) return; wrap.innerHTML = "";
  for (const m of STATE.addedProjectMembers) {
    const chip = document.createElement("div"); chip.className="chip"; chip.style.display="inline-flex"; chip.style.gap="8px"; chip.style.margin="4px"; chip.style.alignItems="center";
    chip.innerHTML = `<span>${H(m.username)}</span>`;
    const btn = document.createElement("button"); btn.className="btn"; btn.textContent="Remove"; btn.onclick = () => { STATE.addedProjectMembers = STATE.addedProjectMembers.filter(x => x.id !== m.id); renderAddedProjectMembers(); };
    chip.appendChild(btn); wrap.appendChild(chip);
  }
}
function openProjectModal() {
  $("#project-name").value=""; $("#project-description").value=""; STATE.addedProjectMembers=[];
  const pm = $("#project-members"); if (!pm) return;
  pm.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px">
      <input id="proj-member-search" placeholder="Search members by username" autocomplete="off" style="padding:8px;border-radius:8px;border:1px solid #e6eefc;">
      <div id="proj-member-suggestions" style="display:none;border:1px solid #e6eefc;border-radius:8px;background:#fff;max-height:160px;overflow:auto;"></div>
      <div id="project-members-added" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;"></div>
    </div>`;
  renderAddedProjectMembers();
  const input = $("#proj-member-search"); const sugg = $("#proj-member-suggestions");
  if (!input || !sugg) { openModal($("#project-modal")); return; }
  input.addEventListener("input", () => {
    clearTimeout(_projDeb);
    const q = input.value.trim();
    if (!q) { sugg.style.display="none"; sugg.innerHTML=""; return; }
    _projDeb = setTimeout(async () => {
      const results = await searchUsers(q);
      sugg.innerHTML = "";
      if (!results || results.length === 0) { sugg.innerHTML = `<div style="padding:8px;color:#666">No users found</div>`; sugg.style.display="block"; return; }
      for (const u of results) {
        const row = document.createElement("div");
        row.style.display="flex"; row.style.justifyContent="space-between"; row.style.padding="8px"; row.style.cursor="pointer";
        row.innerHTML = `<span>${H(u.username)} <small style="color:#666">#${H(String(u.id))}</small></span><button class="btn">Add</button>`;
        row.querySelector("button").onclick = (ev) => { ev.stopPropagation(); if (!STATE.addedProjectMembers.some(x=>x.id===u.id)) { STATE.addedProjectMembers.push(u); renderAddedProjectMembers(); } sugg.style.display="none"; input.value=""; };
        row.onclick = () => { if (!STATE.addedProjectMembers.some(x=>x.id===u.id)) { STATE.addedProjectMembers.push(u); renderAddedProjectMembers(); } sugg.style.display="none"; input.value=""; };
        sugg.appendChild(row);
      }
      sugg.style.display="block";
    }, 220);
  });
  document.addEventListener("click", ev => { if (!sugg) return; if (ev.target !== input && !sugg.contains(ev.target)) { sugg.style.display="none"; } });
  if ($("#project-name")) { $("#project-name").style.padding="10px 12px"; $("#project-name").style.fontSize="16px"; }
  openModal($("#project-modal"));
}
async function saveProject() {
  const name = ($("#project-name") && $("#project-name").value || "").trim(); if (!name) { alert("Project name required"); return; }
  const description = ($("#project-description") && $("#project-description").value || "").trim();
  // use ids from STATE.addedProjectMembers — these are taken from backend user objects (safeId)
  const members = STATE.addedProjectMembers.map(m => Number(m.id)).filter(Boolean);
  const candidates = [{ name, description, members }, { name, description, members_user: members }];
  let lastErr = null;
  for (const p of candidates) {
    try { await apiPost("/api/project/", p); closeModal($("#project-modal")); await loadAll(); return; } catch (err) { lastErr = err; }
  }
  alert("Create project failed: " + (lastErr?.message || lastErr));
}

// -------- fetch role & load data --------
async function fetchCurrentUserRole() {
  try {
    const r = await apiGet("/api/user/me");
    if (r && typeof r === "object") {
      STATE.currentUserRole = r.role || r.user?.role || null;
      console.log("[Dashboard] Role:", STATE.currentUserRole);
      return STATE.currentUserRole;
    }
  } catch (err) { console.debug("fetch role err", err); }
  STATE.currentUserRole = null;
  return null;
}

async function loadAll() {
  clearError();
  $("#projects-list") && ($("#projects-list").innerHTML = "<div class='empty'>Loading projects…</div>");
  $("#tasks-tbody") && ($("#tasks-tbody").innerHTML = "<tr><td colspan='7' class='empty'>Loading tasks…</td></tr>");
  try {
    await fetchCurrentUserRole();
    const searchQuery = buildTaskSearchQuery(); // returns "" or "?search=..."
    const [projects, users, tasks] = await Promise.all([
      apiGet("/api/project/"),
      apiGet("/api/user/"),
      apiGet(`/api/task/${searchQuery}`)
    ]);
    STATE.projects = Array.isArray(projects) ? projects : (projects?.results || []);
    STATE.users = Array.isArray(users) ? users : (users?.results || []);
    STATE.tasks = Array.isArray(tasks) ? tasks : (tasks?.results || []);
    if (!STATE.selectedProjectId && STATE.projects.length) STATE.selectedProjectId = STATE.projects[0].id;
    renderProjects(); updateProjectHeader(); renderTasksForSelectedProject();
    const pendingCount = (STATE.tasks || []).filter(t => String((t.status||"").toLowerCase()) === "pending").length;
    const pendingChip = $("#pending-count"); if (pendingChip) pendingChip.textContent = String(pendingCount);
  } catch (err) { console.error("loadAll err", err); showError(err.message || String(err)); }
}

// -------- Wiring --------
document.addEventListener("DOMContentLoaded", () => {
  $("#logout")?.addEventListener("click", () => { clearTokens(); location.href = "login.html"; });
  $("#refresh")?.addEventListener("click", loadAll);

  // global search debounce
  let _deb = null;
  $("#search")?.addEventListener("input", () => { clearTimeout(_deb); _deb = setTimeout(() => loadAll(), 300); });

  // filter apply/clear (no reload)
  $("#filter-apply")?.addEventListener("click", (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); loadAll(); });
  $("#filter-clear")?.addEventListener("click", (ev) => {
    if (ev && ev.preventDefault) ev.preventDefault();
    if ($("#filter-user")) $("#filter-user").value = "";
    if ($("#filter-priority")) $("#filter-priority").value = "";
    if ($("#filter-status")) $("#filter-status").value = "";
    loadAll();
  });

  // project modal wiring
  $("#btn-open-project")?.addEventListener("click", openProjectModal);
  $("#project-save")?.addEventListener("click", saveProject);
  document.querySelectorAll("#project-cancel, #project-cancel-2").forEach(b => b.addEventListener("click", () => closeModal($("#project-modal"))));

  // create task wiring
  $("#btn-open-create")?.addEventListener("click", openCreateModal);
  $("#create-save")?.addEventListener("click", handleCreate);
  document.querySelectorAll("#create-cancel, #create-cancel-2").forEach(b => b.addEventListener("click", () => closeModal($("#create-modal"))));

  // update wiring
  $("#update-save")?.addEventListener("click", handleUpdate);
  $("#update-cancel")?.addEventListener("click", () => closeModal($("#update-modal")));

  // details close
  $("#details-close")?.addEventListener("click", () => closeModal($("#details-modal")));

  // backdrop close for modals
  ["project-modal","create-modal","update-modal","details-modal"].forEach(id => {
    const el = $("#"+id);
    if (!el) return;
    el.addEventListener("click", (ev) => { if (ev.target.id === id) closeModal(el); });
  });

  // ESC closes modals
  window.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal($("#project-modal")); closeModal($("#create-modal")); closeModal($("#update-modal")); closeModal($("#details-modal")); } });

  // initial load
  loadAll();
});

// alias so older code calling selectProject still works
function selectProject(id) { return selectProject_patched(id); }
