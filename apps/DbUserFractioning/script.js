// DbUserFractioning.js
//
// Registers the "dbuserfractioning" responsibility.
// Sits between callers and the raw "Database" responsibility,
// enforcing per-user data slicing identical to the old FirebaseHandler pattern.
//
// ── Supported call types ─────────────────────────────────────────────────────
//
//   frac_set   { ref, body }          → {}
//     Writes body keys under data/{ref}/ and records refs in users/{uid}/dataRefs/
//
//   frac_get   { id, ref }            → { id, body }
//     Reads users/{uid}/dataRefs/{ref} first, then fetches only allowed children
//
//   frac_get_by_keys  { ref, keys }   → { body }
//     Fetches specific child keys directly from data/{ref}/ without consulting
//     dataRefs. Used by SlideShowHandler to load slides referenced in a project
//     the caller already has legitimate read access to.
//
// ─────────────────────────────────────────────────────────────────────────────
import { Registry } from "../../WebAppPlatform-main.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeRef(raw) {
  return raw
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/");
}
function getUID() {
  return new Promise((resolve, reject) => {
    Registry.responsibility_on_available("Authentication", async () => {
      const res = await Registry.responsibility_call(
        "Authentication",
        "DbUserFractioning",
        { type: "get_current_user" }
      );
      if (res.type !== "success" || !res.data?.uid) {
        reject(new Error("[DbUserFractioning] Could not resolve UID from Authentication."));
      } else {
        resolve(res.data.uid);
      }
    });
  });
}

async function dbGet(path) {
  const res = await Registry.responsibility_call("Database", "DbUserFractioning", {
    type: "db_get",
    path,
  });
  console.log(res)
  if (res.type !== "success") throw new Error(res.status);
  return res.data;
}

async function dbGetAll(path) {
  const res = await Registry.responsibility_call("Database", "DbUserFractioning", {
    type: "db_get_all",
    path,
  });
  console.log(res)
  if (res.type !== "success") throw new Error(res.status);
  return res.data;
}

async function dbSet(path, value) {
  const res = await Registry.responsibility_call("Database", "DbUserFractioning", {
    type: "db_set",
    path,
    value,
  });
  console.log(res)
  if (res.type !== "success") throw new Error(res.status);
}

// ── Log ring-buffer (for viewer) ──────────────────────────────────────────────

const MAX_LOG = 40;
const logEntries = [];
let onLogUpdate = null;

function pushLog(entry) {
  logEntries.unshift({ ...entry, ts: new Date().toLocaleTimeString() });
  if (logEntries.length > MAX_LOG) logEntries.length = MAX_LOG;
  if (typeof onLogUpdate === "function") onLogUpdate();
}

// ── Core handler ──────────────────────────────────────────────────────────────

async function FracRequestHandler(callerApp, callBody) {
  const { type } = callBody;

  // ── frac_set ────────────────────────────────────────────────────────────────
  if (type === "frac_set") {
    const { ref: rawRef, body } = callBody;

    if (!rawRef || typeof rawRef !== "string") {
      return { type: "error", status: "Missing or invalid 'ref'." };
    }
    if (!body || typeof body !== "object") {
      return { type: "error", status: "Missing or invalid 'body'." };
    }

    let uid;
    try { uid = await getUID(); }
    catch (e) { console.log("really"); return {  type: "error", status: e.message }; }

    const ref = normalizeRef(rawRef);
    const pathParts = ref.split("/").filter(Boolean);

    try {
      // 1. Write each body key under data/{ref}/{childKey}
      for (const [childKey, childVal] of Object.entries(body)) {
        await dbSet(`data/${ref}/${childKey}`, childVal);
      }

      // 2. Update dataRefs index for this user
      if (!callBody.meta?.skipDataRefs) {
        if (pathParts.length === 1) {
          // Level-1 ref: replace the dataRefs node with exactly the new keys
          const newRefs = Object.fromEntries(
            Object.keys(body).map((k) => [k, true])
          );
          await dbSet(`users/${uid}/dataRefs/${pathParts[0]}`, newRefs);
        } else {
          // Level-2+ ref: just mark the level-2 path as accessible
          const level2Path = `${pathParts[0]}/${pathParts[1]}`;
          await dbSet(`users/${uid}/dataRefs/${level2Path}`, true);
        }
      }

      pushLog({
        op: "SET",
        ref,
        uid,
        keys: Object.keys(body),
        ok: true,
      });

      return { type: "success", status: "" };
    } catch (e) {
      pushLog({ op: "SET", ref, uid, ok: false, error: e.message });
      return { type: "error", status: e.message };
    }
  }

  // ── frac_get ────────────────────────────────────────────────────────────────
  if (type === "frac_get") {
    const { id, ref: rawRef } = callBody;

    if (!rawRef || typeof rawRef !== "string") {
      return { type: "error", status: "Missing or invalid 'ref'." };
    }

    let uid;
    try { uid = await getUID(); }
    catch (e) { return { type: "error", status: e.message }; }

    const ref = normalizeRef(rawRef);
    const pathParts = ref.split("/").filter(Boolean);

    try {
      let result = {};

      if (pathParts.length === 1) {
        // 1. Look up which children this user is allowed to see
        const dataRefs = await dbGet(`users/${uid}/dataRefs/${pathParts[0]}`);

        if (!dataRefs || typeof dataRefs !== "object") {
          pushLog({ op: "GET", ref, uid, ok: true, keys: [] });
          return { type: "success", status: "", id, body: {} };
        }

        const allowedKeys = Object.keys(dataRefs);

        // 2. Fetch only allowed children
        const fetched = await Promise.all(
          allowedKeys.map(async (k) => {
            const val = await dbGetAll(`data/${ref}/${k}`);
            return [k, val];
          })
        );

        for (const [k, v] of fetched) {
          if (v !== null && v !== undefined) result[k] = v;
        }

        pushLog({ op: "GET", ref, uid, ok: true, keys: allowedKeys });
      } else {
        // Level-2+: check access first
        const level2Path = `${pathParts[0]}/${pathParts[1]}`;
        const hasAccess = await dbGet(`users/${uid}/dataRefs/${level2Path}`);

        if (!hasAccess) {
          pushLog({ op: "GET", ref, uid, ok: false, error: "No access" });
          return { type: "success", status: "", id, body: {} };
        }

        const val = await dbGetAll(`data/${ref}`);
        result = val ?? {};
        pushLog({ op: "GET", ref, uid, ok: true, keys: Object.keys(result) });
      }

      return { type: "success", status: "", id, body: result };
    } catch (e) {
      pushLog({ op: "GET", ref, uid: uid ?? "?", ok: false, error: e.message });
      return { type: "error", status: e.message };
    }
  }

  // ── frac_get_by_keys ────────────────────────────────────────────────────────
  // Fetches a specific set of child keys directly from data/{ref}/ without
  // consulting dataRefs. The caller is trusted to only request keys it has
  // already encountered through a legitimately authorized project read.
  if (type === "frac_get_by_keys") {
    const { ref: rawRef, keys } = callBody;

    if (!rawRef || typeof rawRef !== "string") {
      return { type: "error", status: "Missing or invalid 'ref'." };
    }
    if (!Array.isArray(keys)) {
      return { type: "error", status: "'keys' must be an array." };
    }
    if (keys.length === 0) {
      return { type: "success", status: "", body: {} };
    }

    const ref = normalizeRef(rawRef);

    try {
      const fetched = await Promise.all(
        keys.map(async (k) => {
          const val = await dbGetAll(`data/${ref}/${k}`);
          return [k, val];
        })
      );

      const result = {};
      for (const [k, v] of fetched) {
        if (v !== null && v !== undefined) result[k] = v;
      }

      pushLog({ op: "GET_KEYS", ref, keys, ok: true });
      return { type: "success", status: "", body: result };
    } catch (e) {
      pushLog({ op: "GET_KEYS", ref, keys, ok: false, error: e.message });
      return { type: "error", status: e.message };
    }
  }

  return { type: "error", status: `Unknown call type: '${type}'` };
}

// ── Viewer UI ─────────────────────────────────────────────────────────────────

const VIEWER_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
  :host {
    --bg: #0b0d10; --surface: #12141a; --border: rgba(255,255,255,0.07);
    --text: rgba(255,255,255,0.82); --muted: rgba(255,255,255,0.32);
    --accent: #818cf8; --green: #34d399; --red: #f87171;
    --font: 'DM Mono', monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  #__app_root__ {
    width: 100%; height: 100%; background: var(--bg);
    display: flex; flex-direction: column;
    font-family: var(--font); color: var(--text); font-size: 11.5px; overflow: hidden;
  }
  .toolbar {
    display: flex; align-items: center; gap: 8px; padding: 10px 14px;
    border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .toolbar-title { font-size: 13px; color: var(--accent); font-weight: 500; flex: 1; }
  .badge {
    font-size: 9px; padding: 2px 6px; border-radius: 10px;
    background: rgba(129,140,248,0.12); color: var(--accent);
    border: 1px solid rgba(129,140,248,0.25);
    letter-spacing: 0.06em; text-transform: uppercase;
  }
  .btn {
    padding: 3px 9px; border-radius: 5px; border: 1px solid var(--border);
    background: rgba(255,255,255,0.04); color: var(--text); font-family: inherit;
    font-size: 11px; cursor: pointer; transition: background 0.12s;
  }
  .btn:hover { background: rgba(129,140,248,0.12); border-color: rgba(129,140,248,0.35); }
  .log-wrap { flex: 1; overflow-y: auto; padding: 6px 0; }
  .empty-state {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: var(--muted); font-size: 12px;
  }
  .log-row {
    display: grid;
    grid-template-columns: 56px 64px 1fr auto;
    gap: 8px; align-items: baseline;
    padding: 5px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    transition: background 0.08s;
  }
  .log-row:hover { background: rgba(255,255,255,0.025); }
  .log-row.err { background: rgba(248,113,113,0.04); }
  .ts { color: var(--muted); font-size: 10px; }
  .op { font-weight: 500; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; }
  .op.SET { color: var(--accent); }
  .op.GET { color: var(--green); }
  .op.GET_KEYS { color: #fb923c; }
  .ref { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { font-size: 10px; color: var(--muted); white-space: nowrap; }
  .detail.ok { color: var(--green); }
  .detail.fail { color: var(--red); }
  .status-bar {
    padding: 4px 14px; border-top: 1px solid var(--border);
    font-size: 10px; color: var(--muted); flex-shrink: 0;
  }
`;

async function openViewerWindow() {
  const winResult = await Registry.responsibility_call(
    "DomHandler",
    "DbUserFractioning",
    {
      type: "division_create",
      options: {
        title: "DB Fractioning",
        icon: "🔀",
        width: 520,
        height: 380,
      },
    }
  );
  if (winResult.type !== "success") {
    console.error("[DbUserFractioning] Viewer failed:", winResult.status);
    return;
  }

  const { DomElement, ShadowRoot } = winResult.data;

  if (!ShadowRoot.querySelector("style[data-frac]")) {
    const s = document.createElement("style");
    s.dataset.frac = "1";
    s.textContent = VIEWER_STYLES;
    ShadowRoot.insertBefore(s, ShadowRoot.firstChild);
  }

  function render() {
    DomElement.innerHTML = `
      <div class="toolbar">
        <span class="toolbar-title">🔀 DB User Fractioning</span>
        <span class="badge">live</span>
        <button class="btn" id="clear-btn">Clear</button>
      </div>
      <div class="log-wrap" id="log-wrap">
        ${
          logEntries.length === 0
            ? `<div class="empty-state">No operations yet — waiting for frac_get / frac_set calls…</div>`
            : logEntries
                .map(
                  (e) => `
          <div class="log-row${e.ok ? "" : " err"}">
            <span class="ts">${e.ts}</span>
            <span class="op ${e.op}">${e.op}</span>
            <span class="ref" title="${e.ref}">${e.ref}</span>
            <span class="detail ${e.ok ? "ok" : "fail"}">
              ${
                e.ok
                  ? e.keys && e.keys.length
                    ? `[${e.keys.join(", ")}]`
                    : "∅"
                  : `✕ ${e.error ?? "error"}`
              }
            </span>
          </div>`
                )
                .join("")
        }
      </div>
      <div class="status-bar">
        ${logEntries.length} operation(s) logged &nbsp;·&nbsp;
        responsibility: <span style="color:var(--accent)">dbuserfractioning</span>
      </div>
    `;

    DomElement.querySelector("#clear-btn").addEventListener("click", () => {
      logEntries.length = 0;
      render();
    });
  }

  onLogUpdate = render;
  render();
}

// ── Entry Point ───────────────────────────────────────────────────────────────

export default async function AppBody() {
  Registry.responsibility_create(
    "dbuserfractioning",
    "DbUserFractioning",
    FracRequestHandler
  );
  console.log("[DbUserFractioning] Responsibility registered.");
  Registry.responsibility_on_available("DomHandler", async () => {
    await openViewerWindow();
  });
}