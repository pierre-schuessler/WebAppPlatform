// TaskManager.js
// Shows all running apps and lets you terminate them.
// Terminates itself when its window is closed.
import { Registry } from "../../WebAppPlatform-main.js"

// ─── Styles ───────────────────────────────────────────────────────────────────
const STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');

    :host {
        --bg:      #0c0e12;
        --surface: #13151b;
        --border:  rgba(255,255,255,0.07);
        --text:    rgba(255,255,255,0.85);
        --muted:   rgba(255,255,255,0.35);
        --accent:  #38bdf8;
        --danger:  #f87171;
        --green:   #4ade80;
        --font:    'DM Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    #__app_root__ {
        width: 100%; height: 100%;
        background: var(--bg);
        display: flex; flex-direction: column;
        font-family: var(--font); font-size: 12px;
        color: var(--text); overflow: hidden;
    }

    .tm-toolbar {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
    }
    .tm-title { color: var(--accent); font-size: 13px; font-weight: 500; flex: 1; }
    .tm-count { color: var(--muted); font-size: 11px; }

    .tm-list {
        flex: 1; overflow-y: auto; padding: 6px 0;
    }
    .tm-list::-webkit-scrollbar { width: 4px; }
    .tm-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

    .tm-row {
        display: flex; align-items: center; gap: 10px;
        padding: 7px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.03);
        transition: background 0.1s;
    }
    .tm-row:hover { background: rgba(255,255,255,0.03); }

    .tm-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: var(--green); flex-shrink: 0;
        box-shadow: 0 0 5px var(--green);
    }
    .tm-dot.system { background: var(--accent); box-shadow: 0 0 5px var(--accent); }

    .tm-name { flex: 1; color: var(--text); }
    .tm-name.system { color: var(--muted); font-style: italic; }

    .tm-badge {
        font-size: 9.5px; padding: 1px 6px; border-radius: 3px;
        border: 1px solid var(--border); color: var(--muted);
        letter-spacing: 0.04em; text-transform: uppercase;
        flex-shrink: 0;
    }
    .tm-badge.has-responsibility {
        border-color: rgba(56,189,248,0.3); color: var(--accent);
    }

    .tm-kill {
        padding: 3px 9px; border-radius: 4px;
        border: 1px solid rgba(248,113,113,0.25);
        background: transparent; color: var(--danger);
        font-family: inherit; font-size: 11px;
        cursor: pointer; flex-shrink: 0;
        transition: background 0.12s, border-color 0.12s;
    }
    .tm-kill:hover { background: rgba(248,113,113,0.12); border-color: rgba(248,113,113,0.5); }
    .tm-kill:disabled {
        opacity: 0.3; cursor: not-allowed;
        border-color: var(--border); color: var(--muted);
    }

    .tm-empty {
        flex: 1; display: flex; align-items: center; justify-content: center;
        color: var(--muted); font-size: 12px;
    }

    .tm-status {
        padding: 5px 14px;
        border-top: 1px solid var(--border);
        color: var(--muted); font-size: 10px;
        display: flex; justify-content: space-between;
        flex-shrink: 0;
    }
    .tm-status .flash { color: var(--accent); }

    /* Animate new rows in */
    @keyframes tm-row-in {
        from { opacity: 0; transform: translateX(-6px); }
        to   { opacity: 1; transform: translateX(0); }
    }
    .tm-row { animation: tm-row-in 0.15s ease both; }
`;

// Apps that cannot be terminated (they own critical responsibilities or are the platform itself)
const PROTECTED = new Set(["DomHandler", "Firebase"]);

export default async function AppBody() {
    const AppName = "TaskManager";

    // Helper to wait for a responsibility to be available
    async function waitForResponsibility(name) {
        return new Promise(resolve => {
            Registry.responsibility_on_available(name, resolve);
        });
    }

    // Wait for DomHandler to be available before proceeding
    await waitForResponsibility("DomHandler");

    // ── Open window ───────────────────────────────────────────────────────────
    const winResult = await Registry.responsibility_call("DomHandler", AppName, {
        type: "division_create",
        options: { title: "Task Manager", icon: "⚙", width: 420, height: 360 },
    });

    if (winResult.type !== "success") {
        console.error("[TaskManager] Could not open window:", winResult.status);
        Registry.app_terminate(AppName);
        return;
    }

    const { DomElement, ShadowRoot, WindowId } = winResult.data;

    // ── Inject styles ─────────────────────────────────────────────────────────
    const styleEl = document.createElement("style");
    styleEl.textContent = STYLES;
    ShadowRoot.insertBefore(styleEl, ShadowRoot.firstChild);

    // ── Render ────────────────────────────────────────────────────────────────
    let lastEvent = null;

    function render() {
        const apps = Registry.app_list();

        DomElement.innerHTML = `
            <div class="tm-toolbar">
                <span class="tm-title">⚙ Task Manager</span>
                <span class="tm-count">${apps.length} running</span>
            </div>
            <div class="tm-list" id="tm-list"></div>
            <div class="tm-status">
                <span>click Kill to terminate an app</span>
                <span class="flash" id="tm-event">${lastEvent ?? ""}</span>
            </div>
        `;

        const list = DomElement.querySelector("#tm-list");

        if (!apps.length) {
            list.innerHTML = `<div class="tm-empty">No apps running</div>`;
            return;
        }

        apps.forEach((name, i) => {
            const isProtected = PROTECTED.has(name);
            const isSelf      = name === AppName;

            const row = document.createElement("div");
            row.className = "tm-row";
            row.style.animationDelay = `${i * 0.03}s`;

            const isSystem = isProtected || isSelf;
            row.innerHTML = `
                <div class="tm-dot${isSystem ? " system" : ""}"></div>
                <span class="tm-name${isSystem ? " system" : ""}">${name}</span>
                ${isProtected ? `<span class="tm-badge has-responsibility">system</span>` : ""}
                ${isSelf      ? `<span class="tm-badge">self</span>` : ""}
                <button class="tm-kill"
                    ${isProtected ? "disabled title=\"System app — cannot be terminated\"" : ""}
                    data-app="${name}">
                    ${isSelf ? "Close" : "Kill"}
                </button>
            `;
            list.appendChild(row);
        });

        // Kill buttons
        list.querySelectorAll(".tm-kill:not([disabled])").forEach(btn => {
            btn.addEventListener("click", async () => {
                const target = btn.dataset.app;

                if (target === AppName) {
                    // Closing self — the MutationObserver below will fire app_terminate
                    await waitForResponsibility("DomHandler");
                    Registry.responsibility_call("DomHandler", AppName, {
                        type: "division_close",
                        WindowId,
                    });
                    return;
                }

                const result = Registry.app_terminate(target);
                if (result.type === "success") {
                    lastEvent = `Terminated: ${target}`;
                } else {
                    lastEvent = `Error: ${result.status}`;
                }
                render();
            });
        });
    }

    // ── Live updates via lifecycle hooks ──────────────────────────────────────
    const cancelLifecycle = Registry.app_on_lifecycle({
        onStart:     (name) => { lastEvent = `Started: ${name}`;     render(); },
        onTerminate: (name) => { lastEvent = `Terminated: ${name}`;  render(); },
    });

    // ── Self-terminate when the window is closed ──────────────────────────────
    // Watch for the shadow host being removed from the DOM.
    const observer = new MutationObserver(() => {
        if (!document.contains(ShadowRoot.host)) {
            observer.disconnect();
            cancelLifecycle();
            Registry.app_terminate(AppName);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    render();
}