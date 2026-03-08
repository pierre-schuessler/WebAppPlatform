// Firebase.js — Realtime Database, straight path API
//
// No collections. Every call works directly against a DB path.
//
// ── Supported call types ──────────────────────────────────────────────────────
//
//   db_get          { path }                          → { data: value | null }
//   db_set          { path, value }                   → {}
//   db_delete       { path }                          → {}
//   db_list         { path }                          → { data: [...keys] }
//   db_get_all      { path }                          → { data: subtree | null }
//   db_query        { path, filter }                  → { data: [...values] }
//   db_subscribe    { subscriberId, path, callback }  → {}  (live listener on path)
//   db_unsubscribe  { subscriberId }                  → {}
//   db_flush                                          → {}  (no-op — writes are real-time)
//   db_stats                                          → diagnostics
//
// Paths use "/" notation, e.g. "users/alice" or just "settings".
//
import { Registry } from "../../WebAppPlatform-main.js";

// ─── Firebase Config ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDeN-lHqe1B8atZ2w13iy18-Cz0GF_bU7Y",
  authDomain: "dash-plus-26354.firebaseapp.com",
  databaseURL:
    "https://dash-plus-26354-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "dash-plus-26354",
  storageBucket: "dash-plus-26354.firebasestorage.app",
  messagingSenderId: "612106286677",
  appId: "1:612106286677:web:58c99096705306e55406dc",
  measurementId: "G-63C800QMLQ",
};

// ─── Firebase SDK ─────────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set,
  remove,
  onValue,
  off,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  onAuthStateChanged,
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const auth = getAuth(firebaseApp);

// open login screen using google provider
const provider = new GoogleAuthProvider();
const authComing = true;
signInWithPopup(auth, provider)
  .then((result) => {
    const user = result.user;
    console.log("[DEBUG] User signed in:", user);

    // ── Write email → UID index so other users can look up this account ──────
    // Email is encoded: dots → commas, so Firebase key rules are satisfied.
    if (user.email) {
      const encodedEmail = user.email.replace(/\./g, ",");
      set(ref(db, `WebAppPlatform/user_index/${encodedEmail}`), user.uid)
        .then(() => console.log("[Firebase] Email index written for", user.email))
        .catch(e => console.warn("[Firebase] Email index write failed:", e));
    }

    openAuthViewerWindow();
  })
  .catch((error) => {
    console.error("[ERROR] Error during sign-in:", error);
  });



// Create this ONCE at module level
const authReady = new Promise((resolve, reject) => {
  const unsub = onAuthStateChanged(auth, (user) => {
    unsub(); // unsubscribe after first emission
    if (user) resolve(user);
    else reject(new Error("No user signed in"));
  });
});

// ─── Subscribers ──────────────────────────────────────────────────────────────
// Map<subscriberId, { path, firebaseUnsub: fn }>
const subscribers = new Map();

function attachListener(path, callback) {
  const r = ref(db, path || "/");
  const handler = (snapshot) => {
    try {
      callback(path, snapshot.val());
    } catch (e) {
      console.error("[Firebase] Subscriber callback crashed:", e);
    }
  };
  onValue(r, handler);
  return () => off(r, "value", handler);
}

// ─── Request Handler ──────────────────────────────────────────────────────────
async function DbRequestHandler(callerApp, CallBody) {
  let { type, path } = CallBody;

  const noPathNeeded = ["db_flush", "db_stats", "db_unsubscribe"];
  if (!path && !noPathNeeded.includes(type)) {
    return { type: "error", status: "Missing 'path' field." };
  }

  path = "WebAppPlatform/" + path;

  switch (type) {
    case "db_get": {
      const snap = await get(ref(db, path));
      return {
        type: "success",
        status: "",
        data: snap.exists() ? snap.val() : null,
      };
    }

    case "db_set": {
      const { value } = CallBody;
      if (value === undefined)
        return { type: "error", status: "Missing 'value'." };
      await set(ref(db, path), value);
      return { type: "success", status: "" };
    }

    case "db_delete": {
      await remove(ref(db, path));
      return { type: "success", status: "" };
    }

    case "db_list": {
      const snap = await get(ref(db, path));
      if (!snap.exists()) return { type: "success", status: "", data: [] };
      const val = snap.val();
      return {
        type: "success",
        status: "",
        data: val && typeof val === "object" ? Object.keys(val) : [],
      };
    }

    case "db_get_all": {
      const snap = await get(ref(db, path));
      return {
        type: "success",
        status: "",
        data: snap.exists() ? snap.val() : null,
      };
    }

    case "db_query": {
      const { filter } = CallBody;
      const snap = await get(ref(db, path));
      if (!snap.exists()) return { type: "success", status: "", data: [] };
      const val = snap.val();
      const items = val && typeof val === "object" ? Object.values(val) : [val];
      const results = items.filter((item) => {
        if (!filter || typeof filter !== "object") return true;
        return Object.entries(filter).every(
          ([field, expected]) => item?.[field] === expected,
        );
      });
      return { type: "success", status: "", data: results };
    }

    case "db_subscribe": {
      const { subscriberId, callback } = CallBody;
      if (!subscriberId)
        return { type: "error", status: "Missing 'subscriberId'." };
      if (typeof callback !== "function")
        return { type: "error", status: "Missing 'callback' function." };
      // Replace any existing listener for this subscriber
      if (subscribers.has(subscriberId))
        subscribers.get(subscriberId).firebaseUnsub();
      const unsub = attachListener(path || "/", callback);
      subscribers.set(subscriberId, {
        path: path || "/",
        firebaseUnsub: unsub,
      });
      console.log(`[Firebase] Subscribed '${subscriberId}' → ${path || "/"}`);
      return { type: "success", status: "" };
    }

    case "db_unsubscribe": {
      const { subscriberId } = CallBody;
      if (!subscriberId)
        return { type: "error", status: "Missing 'subscriberId'." };
      if (subscribers.has(subscriberId)) {
        subscribers.get(subscriberId).firebaseUnsub();
        subscribers.delete(subscriberId);
        console.log(`[Firebase] Unsubscribed '${subscriberId}'`);
      }
      return { type: "success", status: "" };
    }

    case "db_flush":
      return {
        type: "success",
        status: "Firebase writes are real-time — nothing to flush.",
      };

    case "db_stats": {
      const snap = await get(ref(db, "/"));
      const root = snap.exists() ? snap.val() : {};
      const topLevelKeys =
        root && typeof root === "object" ? Object.keys(root) : [];
      return {
        type: "success",
        status: "",
        data: {
          topLevelKeys,
          backend: `firebase:${firebaseConfig.databaseURL}`,
          subscriberCount: subscribers.size,
          subscribers: [...subscribers.entries()].map(([id, s]) => ({
            id,
            path: s.path,
          })),
        },
      };
    }

    default:
      return { type: "error", status: `Unknown call type: '${type}'` };
  }
}

// ─── Viewer UI ────────────────────────────────────────────────────────────────
const VIEWER_STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
    :host {
        --bg: #0b0d10; --surface: #12141a; --border: rgba(255,255,255,0.07);
        --text: rgba(255,255,255,0.85); --muted: rgba(255,255,255,0.35);
        --accent: #fb923c; --green: #34d399; --font: 'DM Mono', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    #__app_root__ {
        width: 100%; height: 100%; background: var(--bg);
        display: flex; flex-direction: column;
        font-family: var(--font); color: var(--text); font-size: 12px; overflow: hidden;
    }
    .toolbar {
        display: flex; align-items: center; gap: 8px; padding: 10px 14px;
        border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
    .toolbar-title { font-size: 13px; color: var(--accent); font-weight: 500; flex: 1; }
    .badge {
        font-size: 9px; padding: 2px 6px; border-radius: 10px;
        background: rgba(251,146,60,0.15); color: var(--accent);
        border: 1px solid rgba(251,146,60,0.3); letter-spacing: 0.06em; text-transform: uppercase;
    }
    .btn {
        padding: 4px 10px; border-radius: 5px; border: 1px solid var(--border);
        background: rgba(255,255,255,0.04); color: var(--text); font-family: inherit;
        font-size: 11px; cursor: pointer; transition: background 0.12s;
    }
    .btn:hover { background: rgba(251,146,60,0.12); border-color: rgba(251,146,60,0.35); color: #fff; }
    .path-bar {
        display: flex; align-items: center; gap: 6px; padding: 7px 12px;
        border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
    .path-bar input {
        flex: 1; background: rgba(255,255,255,0.04); border: 1px solid var(--border);
        border-radius: 4px; padding: 4px 8px; color: var(--text); font-family: var(--font);
        font-size: 11px; outline: none;
    }
    .path-bar input:focus { border-color: rgba(251,146,60,0.5); }
    .body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
    .tree-wrap { flex: 1; overflow: auto; padding: 6px 0; }
    .node { display: flex; flex-direction: column; }
    .node-row {
        display: flex; align-items: baseline; gap: 5px;
        padding: 3px 0; cursor: default; user-select: none;
    }
    .node-row:hover { background: rgba(255,255,255,0.03); }
    .node-row.clickable { cursor: pointer; }
    .toggle { color: var(--muted); font-size: 9px; width: 10px; flex-shrink: 0; text-align: center; }
    .nkey { color: var(--accent); }
    .nval { color: var(--green); }
    .nval.null { color: var(--muted); font-style: italic; }
    .nval.type { color: var(--muted); }
    .children { border-left: 1px solid rgba(255,255,255,0.06); }
    .empty { display: flex; align-items: center; justify-content: center; flex: 1; color: var(--muted); font-size: 12px; }
    .status {
        padding: 4px 14px; border-top: 1px solid var(--border);
        font-size: 10px; color: var(--muted); flex-shrink: 0;
    }
    .live { color: var(--accent); }
`;

let viewerCounter = 0;

function buildTree(container, data, indent = 12) {
  container.innerHTML = "";
  if (data === null || data === undefined) {
    container.innerHTML = `<div class="empty">null / empty</div>`;
    return;
  }
  if (typeof data !== "object") {
    const row = document.createElement("div");
    row.className = "node-row";
    row.style.paddingLeft = indent + "px";
    row.innerHTML = `<span class="nval">${JSON.stringify(data)}</span>`;
    container.appendChild(row);
    return;
  }
  for (const [key, val] of Object.entries(data)) {
    const isObj = val !== null && typeof val === "object";
    const node = document.createElement("div");
    node.className = "node";

    const row = document.createElement("div");
    row.className = "node-row" + (isObj ? " clickable" : "");
    row.style.paddingLeft = indent + "px";

    const toggle = document.createElement("span");
    toggle.className = "toggle";
    toggle.textContent = isObj ? "▶" : "";

    const keyEl = document.createElement("span");
    keyEl.className = "nkey";
    keyEl.textContent = key + ":";

    const valEl = document.createElement("span");
    if (isObj) {
      valEl.className = "nval type";
      valEl.textContent = Array.isArray(val)
        ? `[${val.length}]`
        : `{${Object.keys(val).length}}`;
    } else {
      valEl.className = "nval" + (val === null ? " null" : "");
      valEl.textContent = val === null ? "null" : JSON.stringify(val);
    }

    row.appendChild(toggle);
    row.appendChild(keyEl);
    row.appendChild(valEl);
    node.appendChild(row);

    if (isObj) {
      const children = document.createElement("div");
      children.className = "children";
      children.style.display = "none";
      children.style.marginLeft = indent + 8 + "px";
      buildTree(children, val, 4);
      node.appendChild(children);

      row.addEventListener("click", () => {
        const open = children.style.display !== "none";
        children.style.display = open ? "none" : "block";
        toggle.textContent = open ? "▶" : "▼";
      });
    }
    container.appendChild(node);
  }
}

async function openDbViewerWindow() {
  const winResult = await Registry.responsibility_call(
    "DomHandler",
    "Firebase",
    {
      type: "division_create",
      options: { title: "Firebase DB", icon: "🔥", width: 460, height: 420 },
    },
  );
  if (winResult.type !== "success") {
    console.error("[Firebase] Viewer failed:", winResult.status);
    return;
  }
  const { DomElement, ShadowRoot } = winResult.data;

  if (!ShadowRoot.querySelector("style[data-fb]")) {
    const s = document.createElement("style");
    s.dataset.fb = "1";
    s.textContent = VIEWER_STYLES;
    ShadowRoot.insertBefore(s, ShadowRoot.firstChild);
  }

  const viewerId = `firebase-viewer-${++viewerCounter}`;
  let currentPath = "/";

  async function render() {
    const dataRes = await Registry.responsibility_call("Database", "Firebase", {
      type: "db_get_all",
      path: currentPath,
    });
    const statsRes = await Registry.responsibility_call(
      "Database",
      "Firebase",
      { type: "db_stats" },
    );
    const data = dataRes.type === "success" ? dataRes.data : null;
    const stats = statsRes.type === "success" ? statsRes.data : {};

    DomElement.innerHTML = `
            <div class="toolbar">
                <span class="toolbar-title">🔥 Firebase DB</span>
                <span class="badge">live</span>
                <button class="btn" id="up-btn">↑ Up</button>
                <button class="btn" id="refresh-btn">↻</button>
            </div>
            <div class="path-bar">
                <input id="path-input" value="${currentPath}" placeholder="e.g. users/alice" />
                <button class="btn" id="go-btn">Go</button>
            </div>
            <div class="body">
                <div class="tree-wrap" id="tree"></div>
                <div class="status">
                    <span class="live">${stats.backend ?? "firebase"}</span>
                    &nbsp;·&nbsp; ${stats.subscriberCount ?? 0} sub(s)
                    &nbsp;·&nbsp; <span style="color:var(--text)">${currentPath}</span>
                </div>
            </div>
        `;

    buildTree(DomElement.querySelector("#tree"), data);

    const input = DomElement.querySelector("#path-input");

    const navigate = (p) => {
      currentPath = p || "/";
      render();
    };

    DomElement.querySelector("#go-btn").addEventListener("click", () =>
      navigate(input.value.trim()),
    );
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") navigate(input.value.trim());
    });
    DomElement.querySelector("#refresh-btn").addEventListener("click", () =>
      render(),
    );
    DomElement.querySelector("#up-btn").addEventListener("click", () => {
      const parts = currentPath.replace(/\/$/, "").split("/").filter(Boolean);
      parts.pop();
      navigate(parts.length ? parts.join("/") : "/");
    });
  }

  // Live subscription on root so viewer refreshes on any write
  await Registry.responsibility_call("Database", "Firebase", {
    type: "db_subscribe",
    subscriberId: viewerId,
    path: "/",
    callback: () => render(),
  });

  const observer = new MutationObserver(() => {
    if (!document.contains(ShadowRoot.host)) {
      Registry.responsibility_call("Database", "Firebase", {
        type: "db_unsubscribe",
        subscriberId: viewerId,
      });
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  await render();
}

async function openAuthViewerWindow() {
  const user = auth.currentUser;
  if (!user) {
    console.error("[Firebase] No user signed in for profile viewer");
    return;
  }

  const winResult = await Registry.responsibility_call(
    "DomHandler",
    "Firebase",
    {
      type: "division_create",
      options: { title: "User Profile", icon: "👤", width: 380, height: 410 },
    },
  );
  if (winResult.type !== "success") {
    console.error("[Firebase] Profile viewer failed:", winResult.status);
    return;
  }
  const { DomElement, ShadowRoot } = winResult.data;

  const profileStyles = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Sora:wght@400;600&display=swap');
    :host {
      --bg: #0b0d10; --surface: #13151c; --border: rgba(255,255,255,0.07);
      --text: rgba(255,255,255,0.88); --muted: rgba(255,255,255,0.38);
      --accent: #fb923c; --green: #34d399;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    #__app_root__ {
      width: 100%; height: 100%; background: var(--bg);
      font-family: 'Sora', sans-serif; color: var(--text);
      display: flex; flex-direction: column; overflow: hidden;
    }
    .toolbar {
      display: flex; align-items: center; gap: 8px; padding: 10px 14px;
      border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
    .toolbar-title { font-size: 13px; color: var(--accent); font-weight: 600; flex: 1; }
    .badge {
      font-size: 9px; padding: 2px 6px; border-radius: 10px;
      background: rgba(52,211,153,0.12); color: var(--green);
      border: 1px solid rgba(52,211,153,0.25); letter-spacing: 0.06em; text-transform: uppercase;
      font-family: 'DM Mono', monospace;
    }
    .profile-card {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 24px 28px; gap: 16px;
    }
    .avatar-wrap {
      position: relative; width: 80px; height: 80px;
    }
    .avatar {
      width: 80px; height: 80px; border-radius: 50%;
      border: 2px solid rgba(251,146,60,0.4);
      box-shadow: 0 0 0 4px rgba(251,146,60,0.08), 0 8px 24px rgba(0,0,0,0.5);
      object-fit: cover;
    }
    .avatar-ring {
      position: absolute; inset: -5px; border-radius: 50%;
      border: 2.5px solid rgba(251,146,60,0.2);
      animation: spin 8s linear infinite;
      border-top-color: rgba(251,146,60,0.6);
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .info { text-align: center; display: flex; flex-direction: column; gap: 5px; }
    .name { font-size: 17px; font-weight: 600; color: var(--text); letter-spacing: -0.01em; }
    .email { font-size: 11.5px; color: var(--muted); font-family: 'DM Mono', monospace; }
    .divider { width: 100%; height: 1px; background: var(--border); margin: 4px 0; }
    .meta-grid {
      width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
    }
    .meta-item {
      background: rgba(255,255,255,0.03); border: 1px solid var(--border);
      border-radius: 8px; padding: 8px 10px;
    }
    .meta-label { font-size: 9px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; font-family: 'DM Mono', monospace; margin-bottom: 3px; }
    .meta-value { font-size: 11px; color: var(--text); font-family: 'DM Mono', monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta-value.green { color: var(--green); }
    .meta-value.accent { color: var(--accent); }
  `;

  if (!ShadowRoot.querySelector("style[data-profile]")) {
    const s = document.createElement("style");
    s.dataset.profile = "1";
    s.textContent = profileStyles;
    ShadowRoot.insertBefore(s, ShadowRoot.firstChild);
  }

  const photoURL = user.providerData?.[0]?.photoURL || user.photoURL || '';
  const createdDate = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
  const lastLogin = user.metadata?.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

  DomElement.innerHTML = `
    <div class="toolbar">
      <span class="toolbar-title">👤 Signed In</span>
      <span class="badge">● verified</span>
    </div>
    <div class="profile-card">
      <div class="avatar-wrap">
        <img class="avatar" src="${photoURL}" alt="${user.displayName}" onerror="this.src='https://upload.wikimedia.org/wikipedia/commons/a/ac/Default_pfp.jpg'" />
        <div class="avatar-ring"></div>
      </div>
      <div class="info">
        <div class="name">${user.displayName || "Anonymous"}</div>
        <div class="email">${user.email || "—"}</div>
      </div>
      <div class="divider"></div>
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">UID</div>
          <div class="meta-value accent" title="${user.uid}">${user.uid.slice(0, 12)}…</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Provider</div>
          <div class="meta-value green">${user.providerData[0]?.providerId || "unknown"}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Created</div>
          <div class="meta-value">${createdDate}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Last Login</div>
          <div class="meta-value">${lastLogin}</div>
        </div>
      </div>
    </div>
  `;
}

async function AuthRequestHandler(callerApp, CallBody) {
  let { type, data } = CallBody;

  if (!type) {
    return { type: "error", status: "No type given." };
  }

  switch (type) {
    case "get_current_user": {
      try {
        const user = await authReady;
        return { type: "success", status: "", data: { uid: user.uid } };
      } catch (e) {
        return { type: "error", status: e.message };
      }
    }
    default:
      return { type: "error", status: `Unknown call type: '${type}'` };
  }
}

// ─── App Entry Point ──────────────────────────────────────────────────────────
export default async function AppBody() {
  Registry.responsibility_create("Database", "Firebase", DbRequestHandler);
  console.log(`[Firebase] Ready → ${firebaseConfig.databaseURL}`);
  // no launcher needed here; avoid calling undefined helper
  openDbViewerWindow();

  Registry.responsibility_create(
    "Authentication",
    "Firebase",
    AuthRequestHandler,
  );
}