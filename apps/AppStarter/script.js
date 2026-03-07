// AppStarter.js — launcher app
// Reads its app catalog from the "Database" responsibility
// The catalog is stored in the database; this module no longer maintains a
// hard‑coded default list. whatever lives in the DB is what gets shown.
//
// Entries should provide a `src` field pointing at the app module.  The path
// may be relative (e.g. "./apps/TaskManager/script.js") or absolute; in either
// case it is resolved against the *current page* (the platform root) so that
// apps can be referenced consistently regardless of where the launcher code
// itself lives.
//
// Its only job is to call Registry.app_start(). What the app does after that
// (open a window, multiple windows, nothing) is entirely the app's business.
import { Registry } from "../../WebAppPlatform-main.js"

// ─── DB helpers ───────────────────────────────────────────────────────────────
const DB_PATH = "app_catalog";

async function dbSet(key, value) {
    return Registry.responsibility_call("Database", "AppStarter", {
        type: "db_set", path: `${DB_PATH}/${key}`, value,
    });
}

async function dbGetAll() {
    return Registry.responsibility_call("Database", "AppStarter", {
        type: "db_get_all", path: DB_PATH,
    });
}



// ─── Load catalog from DB ─────────────────────────────────────────────────────
async function loadCatalog() {
    const result = await dbGetAll();
    console.log(result)
    if (result.type !== "success") return [];
    return Object.values(result.data);
}

// ─── Launch an app ────────────────────────────────────────────────────────────
// If already running, do nothing — the app itself decides whether a second
// click should bring a window to focus, open a new one, or be ignored.
async function launchApp(entry) {
    if (Registry.app_check_exists(entry.id)) {
        console.log(`[AppStarter] ${entry.id} is already running.`);
        return;
    }

    // resolve the source path relative to the current page (root of the platform)
    // so that catalog entries can use paths like "./apps/TaskManager/script.js"
    // without being interpreted relative to this module file.
    let srcPath = entry.src || "";
    try {
        const absoluteUrl = new URL(srcPath, location.href).href;
        const module = await import(absoluteUrl);
        const result = Registry.app_start(entry.id, module.default);
        if (result.type === "error") {
            console.error(`[AppStarter] Failed to start ${entry.id}:`, result.status);
        }
    } catch (e) {
        console.error(`[AppStarter] Failed to import ${srcPath}:`, e);
    }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const APP_STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap');

    :host {
        --as-bg:        #0e0f13;
        --as-surface:   #141519;
        --as-border:    rgba(255,255,255,0.07);
        --as-text:      rgba(255,255,255,0.85);
        --as-muted:     rgba(255,255,255,0.38);
        --as-accent:    #4dabff;
        --as-font-ui:   'Syne', system-ui, sans-serif;
        --as-font-mono: 'DM Mono', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    #__app_root__ {
        width: 100%; height: 100%;
        background: var(--as-bg);
        display: flex; flex-direction: column;
        overflow: hidden;
        font-family: var(--as-font-ui);
        color: var(--as-text);
    }

    .as-header {
        padding: 18px 20px 12px;
        border-bottom: 1px solid var(--as-border);
        display: flex; align-items: center; gap: 10px; flex-shrink: 0;
    }
    .as-header-icon {
        width: 32px; height: 32px; border-radius: 8px;
        background: rgba(77,171,255,0.12); border: 1px solid rgba(77,171,255,0.25);
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; flex-shrink: 0;
    }
    .as-header-text h1 { font-size: 14px; font-weight: 700; letter-spacing: 0.02em; color: #fff; line-height: 1.2; }
    .as-header-text p  { font-size: 11px; color: var(--as-muted); font-family: var(--as-font-mono); margin-top: 1px; }

    .as-search { padding: 10px 16px; border-bottom: 1px solid var(--as-border); flex-shrink: 0; }
    .as-search input {
        width: 100%; background: rgba(255,255,255,0.04);
        border: 1px solid var(--as-border); border-radius: 6px; padding: 7px 12px;
        color: var(--as-text); font-family: var(--as-font-mono); font-size: 12px; outline: none;
        transition: border-color 0.15s, background 0.15s;
    }
    .as-search input::placeholder { color: var(--as-muted); }
    .as-search input:focus { border-color: rgba(77,171,255,0.4); background: rgba(77,171,255,0.04); }

    .as-grid-section { flex: 1; overflow-y: auto; padding: 12px 16px 16px; }
    .as-grid-section::-webkit-scrollbar { width: 4px; }
    .as-grid-section::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

    .as-section-label {
        font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
        text-transform: uppercase; color: var(--as-muted);
        font-family: var(--as-font-mono); margin-bottom: 8px; padding: 0 2px;
    }

    .as-app-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 8px; }

    .as-app-tile {
        background: var(--as-surface); border: 1px solid var(--as-border);
        border-radius: 10px; padding: 14px 14px 12px; cursor: pointer;
        transition: background 0.15s, border-color 0.15s, transform 0.12s;
        position: relative; overflow: hidden;
        display: flex; flex-direction: column; gap: 8px; user-select: none;
        animation: as-tile-in 0.22s cubic-bezier(.4,0,.2,1) both;
    }
    .as-app-tile::before {
        content: ""; position: absolute; inset: 0; border-radius: inherit;
        background: var(--tile-bg, transparent); opacity: 0; transition: opacity 0.2s; pointer-events: none;
    }
    .as-app-tile:hover { transform: translateY(-1px); border-color: var(--tile-border, rgba(255,255,255,0.15)); }
    .as-app-tile:hover::before { opacity: 1; }
    .as-app-tile:active { transform: scale(0.97); }

    .as-tile-icon {
        width: 36px; height: 36px; border-radius: 8px;
        display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;
        border: 1px solid var(--tile-border, rgba(255,255,255,0.08));
        background: var(--tile-bg, rgba(255,255,255,0.04));
    }
    .as-tile-info { flex: 1; min-width: 0; }
    .as-tile-name  { font-size: 12.5px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .as-tile-desc  { font-size: 10.5px; color: var(--as-muted); font-family: var(--as-font-mono); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .as-tile-launch { align-self: flex-end; font-size: 9.5px; font-family: var(--as-font-mono); color: var(--tile-accent, var(--as-muted)); letter-spacing: 0.06em; text-transform: uppercase; opacity: 0; transition: opacity 0.15s; }
    .as-app-tile:hover .as-tile-launch { opacity: 1; }

    .as-tile-pulse { animation: as-pulse-launch 0.35s cubic-bezier(.4,0,.2,1); }
    @keyframes as-pulse-launch { 0% { transform: scale(1); } 40% { transform: scale(0.93); } 100% { transform: scale(1); } }

    .as-footer {
        padding: 8px 16px; border-top: 1px solid var(--as-border);
        display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
    }
    .as-footer-count { font-size: 10.5px; color: var(--as-muted); font-family: var(--as-font-mono); }
    .as-footer-count span { color: var(--as-accent); }
    .as-add-app-btn {
        background: var(--as-accent); color: #fff; border: none; border-radius: 6px;
        padding: 6px 12px; font-size: 10.5px; font-family: var(--as-font-mono);
        cursor: pointer; transition: background 0.15s;
    }
    .as-add-app-btn:hover { background: #3a9eff; }

    .as-add-form {
        display: flex; flex-direction: column; gap: 12px; padding: 16px;
        background: var(--as-surface); border: 1px solid var(--as-border); border-radius: 10px;
    }
    .as-add-form input {
        background: rgba(255,255,255,0.04); border: 1px solid var(--as-border); border-radius: 6px;
        padding: 8px 12px; color: var(--as-text); font-family: var(--as-font-mono); font-size: 12px;
        outline: none; transition: border-color 0.15s, background 0.15s;
    }
    .as-add-form input::placeholder { color: var(--as-muted); }
    .as-add-form input:focus { border-color: rgba(77,171,255,0.4); background: rgba(77,171,255,0.04); }
    .as-form-buttons { display: flex; gap: 8px; justify-content: flex-end; }
    .as-form-buttons button {
        background: var(--as-accent); color: #fff; border: none; border-radius: 6px;
        padding: 8px 16px; font-size: 11px; font-family: var(--as-font-mono); cursor: pointer;
        transition: background 0.15s;
    }
    .as-form-buttons button:hover { background: #3a9eff; }
    .as-cancel-btn { background: var(--as-muted); }
    .as-cancel-btn:hover { background: rgba(255,255,255,0.5); }

    .as-loading {
        flex: 1; display: flex; align-items: center; justify-content: center;
        font-size: 12px; color: var(--as-muted); font-family: var(--as-font-mono);
        gap: 8px;
    }
    .as-spinner {
        width: 14px; height: 14px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.1); border-top-color: var(--as-accent);
        animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes as-tile-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
`;


// ─── Render waiting state (shown immediately while Database boots) ─────────────
function renderWaiting(DomElement, shadowRoot) {
    if (!shadowRoot.querySelector("style[data-appstarter]")) {
        const s = document.createElement("style");
        s.dataset.appstarter = "1";
        s.textContent = APP_STYLES;
        shadowRoot.insertBefore(s, shadowRoot.firstChild);
    }
    DomElement.innerHTML = `
        <div class="as-header">
            <div class="as-header-icon">⬡</div>
            <div class="as-header-text">
                <h1>App Starter</h1>
                <p>WebAppPlatform — launcher</p>
            </div>
        </div>
        <div class="as-search"><input type="text" placeholder="Search apps…" disabled></div>
        <div class="as-loading"><div class="as-spinner"></div>Waiting for Database…</div>
        <div class="as-footer"><span class="as-footer-count"><span class="as-count">—</span> apps</span></div>
    `;
}

// ─── Render launcher (called once Database is confirmed available) ────────────
async function renderLauncher(DomElement, shadowRoot, windowId) {
    if (!shadowRoot.querySelector("style[data-appstarter]")) {
        const s = document.createElement("style");
        s.dataset.appstarter = "1";
        s.textContent = APP_STYLES;
        shadowRoot.insertBefore(s, shadowRoot.firstChild);
    }

    // Load catalog from DB
    const catalog = await loadCatalog();

    // Build full UI
    DomElement.innerHTML = `
        <div class="as-header">
            <div class="as-header-icon">⬡</div>
            <div class="as-header-text">
                <h1>App Starter</h1>
                <p>WebAppPlatform — launcher</p>
            </div>
        </div>
        <div class="as-search"><input type="text" placeholder="Search apps…"></div>
        <div class="as-grid-section">
            <div class="as-section-label">All Apps</div>
            <div class="as-app-grid"></div>
        </div>
        <div class="as-footer">
            <span class="as-footer-count"><span class="as-count">${catalog.length}</span> app${catalog.length !== 1 ? "s" : ""} installed</span>
            <button class="as-add-app-btn">Add App</button>
        </div>
    `;

    const grid     = DomElement.querySelector(".as-app-grid");
    const searchEl = DomElement.querySelector(".as-search input");
    const countEl  = DomElement.querySelector(".as-count");
    const addBtn   = DomElement.querySelector(".as-add-app-btn");
    const gridSection = DomElement.querySelector(".as-grid-section");

    function renderGrid(filter = "") {
        grid.innerHTML = "";
        const filtered = filter
            ? catalog.filter(a => a.name.toLowerCase().includes(filter) || a.description.toLowerCase().includes(filter))
            : catalog;
        countEl.textContent = filtered.length;

        filtered.forEach((app, i) => {
            const tile = document.createElement("div");
            tile.className = "as-app-tile";
            tile.style.setProperty("--tile-bg",     app.bgColor);
            tile.style.setProperty("--tile-border", app.borderColor);
            tile.style.setProperty("--tile-accent", app.color);
            tile.style.animationDelay = `${i * 0.04}s`;
            tile.innerHTML = `
                <div class="as-tile-icon" style="color:${app.color}">${app.icon}</div>
                <div class="as-tile-info">
                    <div class="as-tile-name">${app.name}</div>
                    <div class="as-tile-desc">${app.description}</div>
                </div>
                <div class="as-tile-launch">Open ↗</div>
            `;
            tile.addEventListener("click", () => {
                tile.classList.remove("as-tile-pulse");
                void tile.offsetWidth;
                tile.classList.add("as-tile-pulse");
                launchApp(app);
            });
            grid.appendChild(tile);
        });
    }

    function showAddForm() {
        gridSection.innerHTML = `
            <div class="as-section-label">Add New App</div>
            <form class="as-add-form">
                <input type="text" name="name" placeholder="App Name" required>
                <input type="text" name="src" placeholder="Script Link (e.g., ./apps/MyApp/script.js)" required>
                <input type="text" name="description" placeholder="Description (optional)">
                <div class="as-form-buttons">
                    <button type="submit">Add App</button>
                    <button type="button" class="as-cancel-btn">Cancel</button>
                </div>
            </form>
        `;
        const form = gridSection.querySelector(".as-add-form");
        const cancelBtn = gridSection.querySelector(".as-cancel-btn");

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const name = formData.get("name").trim();
            const src = formData.get("src").trim();
            const description = formData.get("description").trim() || "No description";

            if (!name || !src) return;

            // Generate a simple id from name
            const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

            const newApp = {
                id,
                name,
                description,
                src,
                icon: "⬡", // default icon
                bgColor: "rgba(77,171,255,0.08)",
                borderColor: "rgba(77,171,255,0.2)",
                color: "#4dabff"
            };

            const result = await dbSet(id, newApp);
            if (result.type === "success") {
                catalog.push(newApp);
                renderLauncher(DomElement, shadowRoot, windowId); // re-render
            } else {
                alert("Failed to add app: " + result.status);
            }
        });

        cancelBtn.addEventListener("click", () => {
            renderLauncher(DomElement, shadowRoot, windowId); // back to main view
        });
    }

    addBtn.addEventListener("click", showAddForm);
    searchEl.addEventListener("input", e => renderGrid(e.target.value.toLowerCase().trim()));
    renderGrid();
}



// ─── Request handler ──────────────────────────────────────────────────────────
function RequestHandler(AppName, CallBody) {
    if (CallBody.type === "appstarter_open") {
        // Another app asked AppStarter to open its launcher window
        openLauncherWindow();
        return { type: "success", status: "" };
    }
    return { type: "error", status: `Unknown call type: ${CallBody.type}` };
}

// ─── Open a launcher window ───────────────────────────────────────────────────
async function openLauncherWindow() {
    const AppName = "AppStarter";
    const winResult = await Registry.responsibility_call("DomHandler", AppName, {
        type: "division_create",
        options: { title: "App Starter", icon: "⬡", width: 540, height: 400 }
    });

    if (winResult.type !== "success") {
        console.error("[AppStarter] Could not open window —", winResult.status);
        return;
    }

    const { DomElement, ShadowRoot, WindowId } = winResult.data;

    // Show something immediately while waiting for Database
    renderWaiting(DomElement, ShadowRoot);

    // once the database is up, render the launcher using whatever is stored there
    Registry.responsibility_on_available("Database", async () => {
        renderLauncher(DomElement, ShadowRoot, WindowId);
    });

    // ── Self-terminate when the window is closed ──────────────────────────────
    // Watch for the shadow host being removed from the DOM.
    const observer = new MutationObserver(() => {
        
        if (!document.contains(ShadowRoot.host)) {
            console.log("doesnt contain")
            observer.disconnect();
            
            Registry.app_terminate(AppName);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// ─── App entry point ──────────────────────────────────────────────────────────
export default async function AppBody() {
    const AppName = "AppStarter";
    console.log(`[${AppName}] Starting up…`);
    Registry.responsibility_create(AppName, AppName, RequestHandler);
    // Wait for DomHandler to be available before opening the launcher window
    Registry.responsibility_on_available("DomHandler", () => {
        openLauncherWindow();
    });
}