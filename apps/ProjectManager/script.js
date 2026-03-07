// ProjectManager.js
//
// Project tree manager — new Registry/responsibility architecture.
// Uses "dbuserfractioning" for per-user data isolation.
// Uses "DomHandler"        for the floating window.
//
// ── Startup sequencing ───────────────────────────────────────────────────────
//   1. Waits for "DomHandler"        before opening the window.
//   2. Mounts the UI immediately so the user sees a shell.
//   3. Waits for "dbuserfractioning" before loading data.
//   4. On label / 🎞 click: waits for "SlideShowHandler" then fires load_project.
//      If SlideShowHandler is already up, fires immediately (on_available is instant).
//
// ── DB contract ──────────────────────────────────────────────────────────────
//   ProjectManager NEVER touches slideRefs — those belong to SlideShowHandler.
//   It round-trips them opaquely through dataset so they survive saves.
//
// ── Share feature ────────────────────────────────────────────────────────────
//   Root-level projects have a 🔗 share button in their action bar.
//   Clicking it opens a share modal where you enter a recipient's email.
//   Flow:
//     1. Look up email in DB at user_index/{encoded_email} → recipientUid
//     2. Write users/{recipientUid}/dataRefs/projects/{hash}: true
//        — the recipient now points at the same data/projects/{hash} as the owner.
//        Both users see live changes through their normal frac_get calls.
//
import { Registry } from "../../WebAppPlatform-main.js";

const FRAC_REF = "projects";
const APP_ID = "ProjectManager";

// ─── Utilities ────────────────────────────────────────────────────────────────

function colorFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `hsl(${(h >>> 0) % 360}, 50%, 68%)`;
}

function randomHash() {
  return "p" + Math.random().toString(36).substr(2, 9);
}

function ensureHashes(projects) {
  projects.forEach((p) => {
    if (!p.hash) p.hash = randomHash();
    if (!p.description) p.description = "";
    if (!p.footer) p.footer = "";
    // deliberately NOT touching p.slideRefs — SlideShowHandler owns those
    if (p.children?.length) ensureHashes(p.children);
  });
}

function sortProjects(projects) {
  projects.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

// ─── Wait helper ─────────────────────────────────────────────────────────────

function waitFor(responsibilityName) {
  return new Promise((resolve) => {
    Registry.responsibility_on_available(responsibilityName, resolve);
  });
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function loadProjects() {
  const res = await Registry.responsibility_call("dbuserfractioning", APP_ID, {
    type: "frac_get",
    id: APP_ID,
    ref: FRAC_REF,
  });
  if (res.type !== "success") {
    console.error("[ProjectManager] frac_get failed:", res.status);
    return [];
  }
  const body = res.body ?? {};
  const projects = Object.entries(body).map(([hash, proj]) => ({
    ...proj,
    hash,
    children: proj.children || [],
  }));
  ensureHashes(projects);
  sortProjects(projects);
  return projects;
}

async function saveProjects(projects) {
  const body = {};
  projects.forEach((p) => {
    body[p.hash] = { ...p };
  });
  const res = await Registry.responsibility_call("dbuserfractioning", APP_ID, {
    type: "frac_set",
    ref: FRAC_REF,
    body,
  });
  if (res.type !== "success")
    console.error("[ProjectManager] frac_set failed:", res.status);
}

// ─── Share helpers ────────────────────────────────────────────────────────────
// Encodes email the same way Firebase.js does on login (dots → commas).

function encodeEmail(email) {
  return email.trim().toLowerCase().replace(/\./g, ",");
}

// Share a root-level project with another user identified by email.
// Returns { ok: true } or { ok: false, reason: string }.
//
// We simply add the project's existing hash to the recipient's dataRefs index:
//   users/{recipientUid}/dataRefs/projects/{hash}: true
//
// Both users then point at the same data/projects/{hash} — fully live-synced.
async function shareProjectWithEmail(project, recipientEmail) {
  // 1. Resolve email → UID via the index written by Firebase.js on login
  const encoded = encodeEmail(recipientEmail);
  const idxRes = await Registry.responsibility_call("Database", APP_ID, {
    type: "db_get",
    path: `user_index/${encoded}`,
  });
  if (idxRes.type !== "success" || !idxRes.data) {
    return {
      ok: false,
      reason:
        "No account found for that email. They must sign in at least once first.",
    };
  }
  const recipientUid = idxRes.data;

  // 2. Guard against sharing with yourself
  const authRes = await Registry.responsibility_call("Authentication", APP_ID, {
    type: "get_current_user",
  });
  const senderUid = authRes?.data?.uid ?? "unknown";
  if (recipientUid === senderUid) {
    return { ok: false, reason: "That's your own account!" };
  }

  // 3. Grant access — just point the recipient's index at the same hash
  const refRes = await Registry.responsibility_call("Database", APP_ID, {
    type: "db_set",
    path: `users/${recipientUid}/dataRefs/projects/${project.hash}`,
    value: true,
  });
  if (refRes.type !== "success") {
    return {
      ok: false,
      reason: "Access grant failed: " + (refRes.status || "unknown error"),
    };
  }

  return { ok: true };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600&family=DM+Mono:wght@400;500&display=swap');
  :host {
    --bg:#0c0e13; --surface:#13151d; --surface2:#1a1d28;
    --border:rgba(255,255,255,0.07); --text:rgba(255,255,255,0.85);
    --muted:rgba(255,255,255,0.32); --accent:#818cf8;
    --danger:#f87171; --green:#34d399; --share:#fb923c;
    --font:'Sora',sans-serif; --mono:'DM Mono',monospace; --radius:8px;
  }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  #__app_root__{width:100%;height:100%;background:var(--bg);font-family:var(--font);color:var(--text);font-size:13px;display:flex;flex-direction:column;overflow:hidden;}
  .header{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0;}
  .header-title{font-size:13px;font-weight:600;color:var(--accent);flex:1;letter-spacing:-0.01em;}
  .icon-btn{width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .12s,border-color .12s;font-family:inherit;}
  .icon-btn:hover{background:rgba(129,140,248,0.14);border-color:rgba(129,140,248,0.4);}
  .icon-btn.danger:hover{background:rgba(248,113,113,0.12);border-color:rgba(248,113,113,0.4);}
  .panel{flex:1;overflow-y:auto;padding:8px 6px;}
  .panel::-webkit-scrollbar{width:4px;}
  .panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
  ul.tree,ul.subtree{list-style:none;display:flex;flex-direction:column;gap:3px;}
  ul.subtree{margin-left:16px;padding-left:8px;border-left:1px solid rgba(255,255,255,0.07);margin-top:4px;}
  li{display:flex;flex-direction:column;}
  .item{display:flex;flex-direction:column;background:var(--surface);border-radius:var(--radius);border-left:3px solid var(--accent);overflow:hidden;cursor:grab;user-select:none;transition:box-shadow .15s;}
  .item:hover{box-shadow:0 2px 12px rgba(0,0,0,.35);}
  .item.completed .row .label{text-decoration:line-through;opacity:.45;}
  .row{display:flex;align-items:center;gap:7px;padding:7px 8px 5px;}
  .toggle{font-size:8px;color:var(--muted);width:12px;flex-shrink:0;cursor:pointer;}
  .toggle.hidden{visibility:hidden;}
  input[type="checkbox"]{accent-color:var(--accent);width:13px;height:13px;flex-shrink:0;cursor:pointer;}
  .label{flex:1;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;}
  .label:hover{color:#fff;}
  .open-btn{font-size:10px;padding:1px 5px;border-radius:4px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--muted);cursor:pointer;opacity:0;transition:opacity .12s,background .1s;font-family:inherit;}
  .item:hover .open-btn{opacity:1;}
  .open-btn:hover{background:rgba(129,140,248,0.18);color:var(--accent);border-color:rgba(129,140,248,0.4);}
  .rename-input{flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(129,140,248,0.45);border-radius:4px;color:var(--text);font-family:var(--font);font-size:12.5px;padding:1px 5px;outline:none;}
  .actions{display:flex;gap:3px;opacity:0;transition:opacity .12s;}
  .item:hover .actions{opacity:1;}
  .actions button{font-size:11px;padding:1px 5px;border-radius:4px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--muted);cursor:pointer;transition:background .1s,color .1s;font-family:inherit;}
  .actions button:hover{background:rgba(129,140,248,0.14);color:var(--text);}
  .actions .del:hover{background:rgba(248,113,113,0.14);color:var(--danger);}
  .actions .share:hover{background:rgba(251,146,60,0.14);color:var(--share);}
  .progress-bar{height:2px;width:100%;background:rgba(255,255,255,0.05);}
  .progress{height:100%;width:0%;transition:width .3s;}
  li.dragging>.item{opacity:.35;box-shadow:none;}
  .empty{display:flex;align-items:center;justify-content:center;height:80px;color:var(--muted);font-size:12px;}

  /* ── Delete confirmation modal ─────────────────────────────────────────── */
  .modal-backdrop{display:none;position:absolute;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(3px);align-items:center;justify-content:center;z-index:100;}
  .modal-backdrop.open{display:flex;}
  .modal{background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:20px 24px;max-width:300px;width:90%;display:flex;flex-direction:column;gap:16px;box-shadow:0 16px 48px rgba(0,0,0,.6);}
  .modal p{font-size:13px;color:var(--text);line-height:1.5;}
  .modal-actions{display:flex;gap:8px;justify-content:flex-end;}
  .modal-actions button{padding:6px 14px;border-radius:6px;font-family:var(--font);font-size:12px;cursor:pointer;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text);transition:background .12s;}
  .modal-actions .confirm{background:rgba(248,113,113,0.15);color:var(--danger);border-color:rgba(248,113,113,0.3);}
  .modal-actions .confirm:hover{background:rgba(248,113,113,0.28);}
  .modal-actions .cancel:hover{background:rgba(255,255,255,0.08);}

  /* ── Share modal ───────────────────────────────────────────────────────── */
  .share-backdrop{display:none;position:absolute;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(3px);align-items:center;justify-content:center;z-index:101;}
  .share-backdrop.open{display:flex;}
  .share-modal{background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:20px 24px;max-width:320px;width:90%;display:flex;flex-direction:column;gap:14px;box-shadow:0 16px 48px rgba(0,0,0,.6);}
  .share-title{font-size:13px;font-weight:600;color:var(--share);display:flex;align-items:center;gap:6px;}
  .share-sub{font-size:11.5px;color:var(--muted);line-height:1.5;}
  .share-sub strong{color:var(--text);font-weight:600;}
  .share-input-row{display:flex;gap:6px;}
  .share-input{flex:1;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text);font-family:var(--mono);font-size:12px;outline:none;transition:border-color .12s;}
  .share-input:focus{border-color:rgba(251,146,60,0.5);}
  .share-send{padding:7px 14px;border-radius:6px;border:1px solid rgba(251,146,60,0.35);background:rgba(251,146,60,0.12);color:var(--share);font-family:var(--font);font-size:12px;cursor:pointer;transition:background .12s;white-space:nowrap;}
  .share-send:hover{background:rgba(251,146,60,0.22);}
  .share-send:disabled{opacity:.45;cursor:default;}
  .share-feedback{font-size:11.5px;min-height:16px;font-family:var(--mono);}
  .share-feedback.ok{color:var(--green);}
  .share-feedback.err{color:var(--danger);}
  .share-close{align-self:flex-end;padding:5px 12px;border-radius:6px;font-family:var(--font);font-size:12px;cursor:pointer;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--muted);transition:background .12s;}
  .share-close:hover{background:rgba(255,255,255,0.08);color:var(--text);}

  .status-bar{padding:4px 14px;border-top:1px solid var(--border);font-size:10px;color:var(--muted);font-family:var(--mono);flex-shrink:0;}
`;

// ─── Tree Manager Class ───────────────────────────────────────────────────────

class ProjectTree {
  constructor(root, onSave) {
    this.root = root;
    this.onSave = onSave;
    this.projects = [];
    this.draggedEl = null;
    this.draggedIndex = null;
    this.currentDropIndex = null;
    this.autoScrollInterval = null;
    this.nodeToDelete = null;
    this._isRenaming = false;
    // Share modal state
    this._shareProject = null; // project data being shared
  }

  // ── Mount DOM ──────────────────────────────────────────────────────────────

  mount() {
    this.root.innerHTML = `
      <div class="header">
        <span class="header-title">📁 Projects</span>
        <button class="icon-btn" id="add-root" title="New project">＋</button>
        <button class="icon-btn" id="reload-btn" title="Reload">↻</button>
      </div>
      <div class="panel"><ul class="tree" id="treeRoot"></ul></div>
      <div class="status-bar" id="status">Waiting for database…</div>

      <!-- Delete confirmation modal -->
      <div class="modal-backdrop" id="modal">
        <div class="modal">
          <p id="modal-text"></p>
          <div class="modal-actions">
            <button class="cancel">Cancel</button>
            <button class="confirm">Delete</button>
          </div>
        </div>
      </div>

      <!-- Share modal -->
      <div class="share-backdrop" id="share-modal">
        <div class="share-modal">
          <div class="share-title">🔗 Share Project</div>
          <p class="share-sub">Sharing <strong id="share-project-name"></strong> — enter the recipient's email address. They must have signed in at least once.</p>
          <div class="share-input-row">
            <input class="share-input" id="share-email" type="email" placeholder="user@example.com" autocomplete="off" spellcheck="false" />
            <button class="share-send" id="share-send">Send</button>
          </div>
          <div class="share-feedback" id="share-feedback"></div>
          <button class="share-close" id="share-close">Close</button>
        </div>
      </div>
    `;

    this.treeEl = this.root.querySelector("#treeRoot");
    this.statusEl = this.root.querySelector("#status");
    this.modalEl = this.root.querySelector("#modal");
    this.modalTextEl = this.root.querySelector("#modal-text");
    this.shareModalEl = this.root.querySelector("#share-modal");
    this.shareNameEl = this.root.querySelector("#share-project-name");
    this.shareEmailEl = this.root.querySelector("#share-email");
    this.shareSendEl = this.root.querySelector("#share-send");
    this.shareFeedback = this.root.querySelector("#share-feedback");

    this.root.querySelector("#add-root").onclick = () => this._addRootProject();
    this.root.querySelector("#reload-btn").onclick = () => this.reload();

    // Delete modal
    this.root.querySelector(".confirm").onclick = () => {
      const expanded = this._getExpanded();
      this.nodeToDelete?.remove();
      this.nodeToDelete = null;
      this.modalEl.classList.remove("open");
      this._updateProgress();
      this._persist(expanded);
    };
    this.root.querySelector(".cancel").onclick = () => {
      this.nodeToDelete = null;
      this.modalEl.classList.remove("open");
    };

    // Share modal
    this.root.querySelector("#share-close").onclick = () =>
      this._closeShareModal();
    this.shareSendEl.onclick = () => this._doShare();
    this.shareEmailEl.onkeydown = (e) => {
      if (e.key === "Enter") this._doShare();
    };
    // Close on backdrop click
    this.shareModalEl.addEventListener("click", (e) => {
      if (e.target === this.shareModalEl) this._closeShareModal();
    });

    // Double-click label → rename
    this.treeEl.addEventListener("dblclick", (e) => {
      const label = e.target.closest(".label");
      if (!label || this._isRenaming) return;
      e.preventDefault();
      e.stopPropagation();
      this._startRename(label);
    });
  }

  // ── Share Modal Helpers ────────────────────────────────────────────────────

  _openShareModal(project) {
    this._shareProject = project;
    this.shareNameEl.textContent = project.name;
    this.shareEmailEl.value = "";
    this.shareFeedback.textContent = "";
    this.shareFeedback.className = "share-feedback";
    this.shareSendEl.disabled = false;
    this.shareModalEl.classList.add("open");
    setTimeout(() => this.shareEmailEl.focus(), 60);
  }

  _closeShareModal() {
    this.shareModalEl.classList.remove("open");
    this._shareProject = null;
  }

  async _doShare() {
    const email = this.shareEmailEl.value.trim();
    if (!email) {
      this._setShareFeedback("Please enter an email address.", false);
      return;
    }
    this.shareSendEl.disabled = true;
    this._setShareFeedback("Sending…", null);

    const result = await shareProjectWithEmail(this._shareProject, email);

    if (result.ok) {
      this._setShareFeedback(`✓ Shared successfully with ${email}`, true);
      // Keep modal open with success so user can share to more people if needed
      this.shareSendEl.disabled = false;
      this.shareEmailEl.value = "";
    } else {
      this._setShareFeedback("✗ " + result.reason, false);
      this.shareSendEl.disabled = false;
    }
  }

  _setShareFeedback(msg, ok) {
    this.shareFeedback.textContent = msg;
    this.shareFeedback.className =
      "share-feedback" + (ok === true ? " ok" : ok === false ? " err" : "");
  }

  // ── Load / Reload ──────────────────────────────────────────────────────────

  async reload() {
    this._setStatus("Loading…");
    try {
      this.projects = await loadProjects();
      this._renderTree();
      this._setStatus(`${this._countAll(this.projects)} project(s) loaded`);
    } catch (e) {
      this._setStatus("Error loading: " + e.message);
    }
  }

  _countAll(projects) {
    return projects.reduce(
      (n, p) => n + 1 + this._countAll(p.children || []),
      0,
    );
  }

  // ── Open project → SlideShowHandler ───────────────────────────────────────

  _openProject(li) {
    const segments = [];
    let current = li;
    while (current?.matches("li")) {
      const parentUl = current.parentElement;
      const parentLi = parentUl?.closest("li");
      if (!parentLi) {
        segments.unshift(current.dataset.hash);
        break;
      }
      const idx = [...parentUl.children].indexOf(current);
      segments.unshift(idx, "children");
      current = parentLi;
    }
    const hash = segments.join("/");
    const name = li.querySelector(".label, .rename-input")?.textContent ?? hash;

    Registry.responsibility_call("SlideShowHandler", APP_ID, {
      type: "load_project",
      hash,
      name,
    }).catch((e) => console.error("[ProjectManager] load_project failed:", e));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  _renderTree(expandedHashes = null) {
    const toRestore = expandedHashes ?? this._getExpanded();
    this.treeEl.innerHTML = "";
    if (this.projects.length === 0) {
      this.treeEl.innerHTML = `<div class="empty">No projects yet — click ＋ to add one</div>`;
      return;
    }
    this.projects.forEach((p) => this._appendNode(this.treeEl, p, null, true));
    this._setupDnd(this.treeEl);
    this._restoreExpanded(toRestore);
    this._updateProgress();
  }

  // isRoot flag controls whether to render the 🔗 share button
  _appendNode(parentUl, project, inheritedColor, isRoot = false) {
    const color = inheritedColor ?? colorFromString(project.name);
    const li = this._createLi(project, color, isRoot);
    if (project.children?.length) {
      const ul = document.createElement("ul");
      ul.className = "subtree";
      ul.style.display = "none";
      project.children.forEach((child) =>
        this._appendNode(ul, child, color, false),
      );
      this._setupDnd(ul);
      li.append(ul);
      const toggle = li.querySelector(".toggle");
      toggle.classList.remove("hidden");
      toggle.textContent = "▶";
    }
    parentUl.append(li);
  }

  // ── Create a single <li> ──────────────────────────────────────────────────

  _createLi(project, color, isRoot = false) {
    const li = document.createElement("li");
    li.dataset.hash = project.hash ?? randomHash();
    li.dataset.description = JSON.stringify(project.description ?? "");
    li.dataset.footer = JSON.stringify(project.footer ?? "");
    li.dataset.slideRefs = JSON.stringify(project.slideRefs ?? null);

    const item = document.createElement("div");
    item.className = "item";
    item.draggable = true;
    item.style.borderLeftColor = color;

    const row = document.createElement("div");
    row.className = "row";

    const toggle = document.createElement("span");
    toggle.className = "toggle hidden";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = project.completed ?? false;

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = project.name;

    const openBtn = document.createElement("button");
    openBtn.className = "open-btn";
    openBtn.textContent = "🎞";
    openBtn.title = "Open slides";
    openBtn.onclick = (e) => {
      e.stopPropagation();
      this._openProject(li);
    };

    label.onclick = (e) => {
      e.stopPropagation();
      if (!this._isRenaming) this._openProject(li);
    };

    const actions = document.createElement("div");
    actions.className = "actions";

    const addBtn = document.createElement("button");
    addBtn.textContent = "＋";
    addBtn.title = "Add child";

    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑";
    delBtn.className = "del";
    delBtn.title = "Delete";

    actions.append(addBtn, delBtn);

    // 🔗 Share button — root level only
    if (isRoot) {
      const shareBtn = document.createElement("button");
      shareBtn.textContent = "🔗";
      shareBtn.className = "share";
      shareBtn.title = "Share with another user";
      shareBtn.onclick = (e) => {
        e.stopPropagation();
        // Capture current project data from the DOM at click time
        const proj = this._extractSingleLi(li);
        this._openShareModal(proj);
      };
      actions.append(shareBtn);
    }

    row.append(toggle, checkbox, label, openBtn, actions);

    const bar = document.createElement("div");
    bar.className = "progress-bar";
    const prog = document.createElement("div");
    prog.className = "progress";
    prog.style.background = color;
    bar.append(prog);

    item.append(row, bar);
    li.append(item);

    // ── events
    toggle.onclick = (e) => {
      e.stopPropagation();
      const ul = li.querySelector(":scope > ul");
      if (!ul) return;
      const open = ul.style.display !== "none";
      ul.style.display = open ? "none" : "block";
      toggle.textContent = open ? "▶" : "▼";
    };
    checkbox.onchange = () => {
      this._updateProgress();
      this._persist();
    };
    addBtn.onclick = (e) => {
      e.stopPropagation();
      this._addChild(li, color);
    };
    delBtn.onclick = (e) => {
      e.stopPropagation();
      this.nodeToDelete = li;
      this.modalTextEl.textContent = `Delete "${label.textContent}" and all its children?`;
      this.modalEl.classList.add("open");
    };

    return li;
  }

  // ── Extract a single li → project object (for share snapshot) ─────────────

  _extractSingleLi(li) {
    const label = li.querySelector(".label, .rename-input");
    const name = label?.value ?? label?.textContent ?? "";
    const checkbox = li.querySelector("input[type=checkbox]");
    const completed = checkbox?.checked ?? false;
    const hash = li.dataset.hash || randomHash();
    const description = JSON.parse(li.dataset.description || '""');
    const footer = JSON.parse(li.dataset.footer || '""');
    const rawSR = li.dataset.slideRefs;
    const slideRefs =
      rawSR && rawSR !== "null" && rawSR !== "undefined"
        ? JSON.parse(rawSR)
        : undefined;
    const subUl = li.querySelector(":scope > ul");
    const children = subUl ? this._extractProjects(subUl) : [];
    const result = { name, completed, hash, description, footer, children };
    if (slideRefs !== undefined) result.slideRefs = slideRefs;
    return result;
  }

  // ── Add helpers ────────────────────────────────────────────────────────────

  _addRootProject() {
    const expanded = this._getExpanded();
    this.treeEl.querySelector(".empty")?.remove();
    const name = this._uniqueName(this.treeEl, "New Project");
    const color = colorFromString(name);
    const hash = randomHash();
    const li = this._createLi(
      {
        name,
        completed: false,
        hash,
        description: "",
        footer: "",
        children: [],
      },
      color,
      true,
    );
    this.treeEl.append(li);
    this._setupDnd(this.treeEl);
    this._persist(expanded);
  }

  _addChild(parentLi, inheritedColor) {
    const expanded = this._getExpanded();
    let ul = parentLi.querySelector(":scope > ul");
    if (!ul) {
      ul = document.createElement("ul");
      ul.className = "subtree";
      ul.style.display = "block";
      parentLi.append(ul);
      this._setupDnd(ul);
      const toggle = parentLi.querySelector(".toggle");
      toggle.classList.remove("hidden");
      toggle.textContent = "▼";
      expanded.add(parentLi.dataset.hash);
    }
    const name = this._uniqueName(ul, "New item");
    const hash = randomHash();
    // Children are never root, so isRoot = false
    const li = this._createLi(
      {
        name,
        completed: false,
        hash,
        description: "",
        footer: "",
        children: [],
      },
      inheritedColor,
      false,
    );
    ul.append(li);
    this._updateProgress();
    this._persist(expanded);
  }

  // ── Rename ─────────────────────────────────────────────────────────────────

  _startRename(labelEl) {
    const li = labelEl.closest("li");
    const parentUl = li.parentElement;
    const original = labelEl.textContent;
    this._isRenaming = true;

    const input = document.createElement("input");
    input.className = "rename-input";
    input.value = original;
    labelEl.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const trimmed = input.value.trim();
      const finalName =
        commit && trimmed
          ? this._uniqueName(parentUl, trimmed, input)
          : original;
      const span = document.createElement("span");
      span.className = "label";
      span.textContent = finalName;
      span.onclick = (e) => {
        e.stopPropagation();
        if (!this._isRenaming) this._openProject(li);
      };
      input.replaceWith(span);
      if (commit && finalName !== original) {
        if (!li.parentElement.closest("li"))
          this._recolorSubtree(li, colorFromString(finalName));
        this._persist();
      }
      setTimeout(() => {
        this._isRenaming = false;
      }, 80);
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    };
    input.onblur = () => finish(true);
  }

  _recolorSubtree(li, color) {
    const item = li.querySelector(":scope > .item");
    item.style.borderLeftColor = color;
    item.querySelector(".progress").style.background = color;
    li.querySelectorAll(":scope ul li").forEach((c) =>
      this._recolorSubtree(c, color),
    );
  }

  // ── Progress ───────────────────────────────────────────────────────────────

  _updateProgress() {
    [...this.treeEl.querySelectorAll("li")].reverse().forEach((li) => {
      const item = li.querySelector(":scope > .item");
      const checkbox = item.querySelector("input[type=checkbox]");
      const prog = item.querySelector(".progress");
      const children = li.querySelectorAll(":scope > ul > li > .item");
      let pct = checkbox.checked
        ? 100
        : children.length
          ? [...children].reduce(
              (s, c) =>
                s + (parseFloat(c.querySelector(".progress").style.width) || 0),
              0,
            ) / children.length
          : 0;
      prog.style.width = Math.round(pct) + "%";
      item.classList.toggle("completed", checkbox.checked);
    });
  }

  // ── Extract DOM → project array ────────────────────────────────────────────

  _extractProjects(ul) {
    return [...ul.children]
      .filter((li) => li.tagName === "LI")
      .map((li) => {
        const label = li.querySelector(".label, .rename-input");
        if (!label) return null;
        const name = label.value ?? label.textContent;
        const checkbox = li.querySelector("input[type=checkbox]");
        const completed = checkbox?.checked ?? false;
        const hash = li.dataset.hash || randomHash();
        const description = JSON.parse(li.dataset.description || '""');
        const footer = JSON.parse(li.dataset.footer || '""');
        const rawSR = li.dataset.slideRefs;
        const slideRefs =
          rawSR && rawSR !== "null" && rawSR !== "undefined"
            ? JSON.parse(rawSR)
            : undefined;
        const subUl = li.querySelector(":scope > ul");
        const children = subUl ? this._extractProjects(subUl) : [];
        const result = { name, completed, hash, description, footer, children };
        if (slideRefs !== undefined) result.slideRefs = slideRefs;
        return result;
      })
      .filter(Boolean);
  }

  // ── Persist ────────────────────────────────────────────────────────────────

  async _persist(expandedHashes = null) {
    const projects = this._extractProjects(this.treeEl);
    sortProjects(projects);
    this.projects = projects;
    this._setStatus("Saving…");
    try {
      await this.onSave(projects);
      this._setStatus(`${this._countAll(projects)} project(s) · saved ✓`);
    } catch (e) {
      this._setStatus("Save error: " + e.message);
    }
    if (expandedHashes) this._restoreExpanded(expandedHashes);
  }

  // ── Expanded state helpers ─────────────────────────────────────────────────

  _getExpanded() {
    const set = new Set();
    this.treeEl.querySelectorAll("li").forEach((li) => {
      const ul = li.querySelector(":scope > ul");
      if (ul && ul.style.display !== "none") set.add(li.dataset.hash);
    });
    return set;
  }

  _restoreExpanded(set) {
    this.treeEl.querySelectorAll("li").forEach((li) => {
      if (!set.has(li.dataset.hash)) return;
      const ul = li.querySelector(":scope > ul"),
        toggle = li.querySelector(":scope > .item .toggle");
      if (ul) ul.style.display = "block";
      if (toggle) {
        toggle.textContent = "▼";
        toggle.classList.remove("hidden");
      }
    });
  }

  // ── Unique naming ──────────────────────────────────────────────────────────

  _uniqueName(ulEl, base, excludeInput = null) {
    const names = [
      ...ulEl.querySelectorAll(":scope > li .label, :scope > li .rename-input"),
    ]
      .filter((el) => el !== excludeInput)
      .map((el) => el.value ?? el.textContent);
    if (!names.includes(base)) return base;
    let i = 2;
    while (names.includes(`${base} (${i})`)) i++;
    return `${base} (${i})`;
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  _setStatus(msg) {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  DRAG AND DROP
  // ─────────────────────────────────────────────────────────────────────────

  _setupDnd(parentUl) {
    parentUl.addEventListener("dragstart", (e) => {
      const li = e.target.closest("li");
      if (!li || li.parentElement !== parentUl) return;
      this.draggedEl = li;
      this.draggedIndex = [...parentUl.children].indexOf(li);
      const clone = li.cloneNode(true);
      Object.assign(clone.style, {
        position: "absolute",
        top: "-9999px",
        opacity: "0.85",
        width: li.offsetWidth + "px",
      });
      document.body.appendChild(clone);
      e.dataTransfer.setDragImage(clone, e.offsetX, e.offsetY);
      setTimeout(() => clone.remove(), 0);
      li.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => {
        li.style.visibility = "hidden";
      });
    });
    parentUl.addEventListener("dragend", (e) => {
      const li = e.target.closest("li");
      if (!li) return;
      li.classList.remove("dragging");
      li.style.visibility = "";
      this._clearAutoScroll();
      [...parentUl.children].forEach((el) => {
        el.style.transition = "";
        el.style.transform = "";
      });
      this.draggedEl = null;
      this.draggedIndex = null;
      this.currentDropIndex = null;
    });
    parentUl.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (this.draggedIndex === null) return;
      this._handleAutoScroll(e.clientY, parentUl);
      const idx = this._getDropIndex(e.clientY, parentUl);
      if (idx !== null && idx !== this.currentDropIndex) {
        this.currentDropIndex = idx;
        this._animateNodes(idx, parentUl);
      }
    });
    parentUl.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.draggedIndex === null) return;
      const idx = this._getDropIndex(e.clientY, parentUl);
      if (idx !== null && idx !== this.draggedIndex) {
        const insertIdx = idx > this.draggedIndex ? idx - 1 : idx;
        const items = [...parentUl.children];
        const target =
          items[insertIdx + (insertIdx >= this.draggedIndex ? 1 : 0)] ?? null;
        this.draggedEl.style.visibility = "";
        parentUl.insertBefore(this.draggedEl, target);
      } else {
        this.draggedEl.style.visibility = "";
      }
      this.draggedEl = null;
      this.draggedIndex = null;
      this.currentDropIndex = null;
      this._clearAutoScroll();
      this._updateProgress();
      this._persist();
    });
  }

  _getDropIndex(clientY, parentUl) {
    const items = [...parentUl.children];
    for (let i = 0; i < items.length; i++) {
      if (items[i] === this.draggedEl) continue;
      const box = items[i].getBoundingClientRect();
      if (clientY < box.top + box.height / 2) return i;
    }
    return items.length;
  }

  _animateNodes(dropIndex, parentUl) {
    const items = [...parentUl.children],
      dragged = items[this.draggedIndex];
    if (!dragged) return;
    const gap = parseFloat(getComputedStyle(parentUl).gap) || 3;
    const shift = dragged.getBoundingClientRect().height + gap;
    items.forEach((item, i) => {
      if (i === this.draggedIndex) return;
      let dir = 0;
      if (
        dropIndex <= this.draggedIndex &&
        i >= dropIndex &&
        i < this.draggedIndex
      )
        dir = 1;
      if (
        dropIndex > this.draggedIndex &&
        i < dropIndex &&
        i > this.draggedIndex
      )
        dir = -1;
      item.style.transition = "transform 0.18s ease-out";
      item.style.transform = dir ? `translateY(${dir * shift}px)` : "";
    });
  }

  _handleAutoScroll(clientY, container) {
    const thr = 80,
      maxSpd = 8;
    const { top, bottom } = container.getBoundingClientRect();
    this._clearAutoScroll();
    const dt = clientY - top,
      db = bottom - clientY;
    if (dt > 0 && dt < thr) {
      const s = maxSpd * (1 - dt / thr);
      this.autoScrollInterval = setInterval(() => {
        if (container.scrollTop > 0) container.scrollTop -= s;
      }, 16);
    } else if (db > 0 && db < thr) {
      const s = maxSpd * (1 - db / thr);
      this.autoScrollInterval = setInterval(() => {
        container.scrollTop += s;
      }, 16);
    }
  }

  _clearAutoScroll() {
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval);
      this.autoScrollInterval = null;
    }
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export default async function AppBody() {
  await waitFor("DomHandler");

  const winResult = await Registry.responsibility_call("DomHandler", APP_ID, {
    type: "division_create",
    options: { title: "Projects", icon: "📁", width: 400, height: 540 },
  });
  if (winResult.type !== "success") {
    console.error("[ProjectManager] Window failed:", winResult.status);
    return;
  }

  const { DomElement, ShadowRoot } = winResult.data;

  if (!ShadowRoot.querySelector("style[data-pm]")) {
    const s = document.createElement("style");
    s.dataset.pm = "1";
    s.textContent = STYLES;
    ShadowRoot.insertBefore(s, ShadowRoot.firstChild);
  }

  const tree = new ProjectTree(DomElement, saveProjects);
  tree.mount();

  await waitFor("dbuserfractioning");
  await tree.reload();

  Registry.responsibility_monitor_create(
    "dbuserfractioning",
    APP_ID,
    async (AppName, CallBody, authorityPromise) => {
      if (CallBody.type !== "frac_set") return;
      if (CallBody.ref !== FRAC_REF) return;
      const body = CallBody.body ?? {};
      const projects = Object.entries(body).map(([hash, proj]) => ({
        ...proj,
        hash,
        children: proj.children || [],
      }));
      ensureHashes(projects);
      sortProjects(projects);
      tree.projects = projects;
      tree._renderTree();
    },
  );

  const observer = new MutationObserver(() => {
    if (!document.contains(ShadowRoot.host)) {
      console.log("doesnt contain");
      observer.disconnect();
      
      Registry.app_terminate(APP_ID);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  console.log("[ProjectManager] Ready.");
}
