// DomHandler.js — Windows-like DOM handler with Shadow DOM app isolation
import { Registry } from "../../WebAppPlatform-main.js"

// ─── Inject platform-level styles once (window chrome only, never app content) ─
const STYLE_ID = "__domhandler_styles__";
if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        :root {
            --win-titlebar-h:     32px;
            --win-border:         1px solid rgba(255,255,255,0.12);
            --win-radius:         8px;
            --win-shadow:         0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3);
            --win-active-shadow:  0 16px 48px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.4);
            --win-bg:             rgba(30,30,30,0.92);
            --win-titlebar-active:   linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            --win-titlebar-inactive: linear-gradient(135deg, #2a2a2a 0%, #222222 100%);
            --win-accent:  #3d9bff;
            --win-close:   #ff5f57;
            --win-min:     #febc2e;
            --win-max:     #28c840;
            --taskbar-h:   44px;
            --taskbar-bg:  rgba(15,15,15,0.96);
        }

        #__dh_desktop__ {
            position: fixed; inset: 0; bottom: var(--taskbar-h);
            overflow: hidden; pointer-events: none; z-index: 1000;
        }

        #__dh_taskbar__ {
            position: fixed; bottom: 0; left: 0; right: 0;
            height: var(--taskbar-h);
            background: var(--taskbar-bg);
            border-top: 1px solid rgba(255,255,255,0.08);
            display: flex; align-items: center;
            padding: 0 8px; gap: 4px;
            z-index: 9999;
            backdrop-filter: blur(20px);
            pointer-events: all;
            font-family: system-ui, sans-serif;
        }

        .dh-taskbar-btn {
            display: flex; align-items: center; gap: 6px;
            padding: 4px 10px; border-radius: 6px;
            border: 1px solid transparent;
            background: transparent; color: rgba(255,255,255,0.75);
            font-family: inherit; font-size: 12px; cursor: pointer;
            transition: background 0.15s, border-color 0.15s, color 0.15s;
            max-width: 160px; overflow: hidden;
            text-overflow: ellipsis; white-space: nowrap;
        }
        .dh-taskbar-btn:hover  { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.1); color: #fff; }
        .dh-taskbar-btn.active { background: rgba(61,155,255,0.15); border-color: rgba(61,155,255,0.4); color: var(--win-accent); }
        .dh-taskbar-btn .tb-icon { font-size: 14px; flex-shrink: 0; }

        .dh-taskbar-clock {
            margin-left: auto; color: rgba(255,255,255,0.7);
            font-size: 12px; padding: 0 10px;
            text-align: right; line-height: 1.4; pointer-events: none;
        }

        .dh-window {
            position: absolute; min-width: 180px; min-height: 120px;
            border-radius: var(--win-radius); border: var(--win-border);
            background: var(--win-bg); box-shadow: var(--win-shadow);
            display: flex; flex-direction: column;
            pointer-events: all; backdrop-filter: blur(16px);
            transition: box-shadow 0.2s; overflow: hidden;
        }
        .dh-window.focused   { box-shadow: var(--win-active-shadow); border-color: rgba(61,155,255,0.3); }
        .dh-window.minimized { display: none !important; }
        .dh-window.maximized {
            border-radius: 0 !important; border: none !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important; height: 100% !important;
        }
        .dh-window.snapping {
            transition: left 0.18s cubic-bezier(.4,0,.2,1), top 0.18s cubic-bezier(.4,0,.2,1),
                        width 0.18s cubic-bezier(.4,0,.2,1), height 0.18s cubic-bezier(.4,0,.2,1);
        }

        .dh-titlebar {
            height: var(--win-titlebar-h); background: var(--win-titlebar-inactive);
            display: flex; align-items: center; padding: 0 8px 0 12px; gap: 8px;
            cursor: default; user-select: none; flex-shrink: 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .dh-window.focused .dh-titlebar { background: var(--win-titlebar-active); }
        .dh-titlebar-icon  { font-size: 15px; flex-shrink: 0; }
        .dh-titlebar-title {
            flex: 1; font-size: 12.5px; font-weight: 600;
            color: rgba(255,255,255,0.85); overflow: hidden;
            text-overflow: ellipsis; white-space: nowrap; letter-spacing: 0.01em;
        }
        .dh-window.focused .dh-titlebar-title { color: #fff; }
        .dh-win-controls { display: flex; gap: 6px; flex-shrink: 0; }
        .dh-win-btn {
            width: 13px; height: 13px; border-radius: 50%;
            border: none; cursor: pointer;
            transition: filter 0.15s, transform 0.1s;
        }
        .dh-win-btn:hover  { filter: brightness(1.25); transform: scale(1.1); }
        .dh-win-btn:active { transform: scale(0.95); }
        .dh-win-btn.close    { background: var(--win-close); }
        .dh-win-btn.minimize { background: var(--win-min); }
        .dh-win-btn.maximize { background: var(--win-max); }

        /* Shadow host — fills remaining space after titlebar */
        .dh-window-shadow-host {
            flex: 1; overflow: hidden; position: relative; display: block;
        }

        /* Resize handles — 8 directions */
        .dh-resize-handle { position: absolute; z-index: 10; }
        .dh-resize-n  { top: 0;    left: 4px;  right: 4px;  height: 4px; cursor: n-resize;  }
        .dh-resize-s  { bottom: 0; left: 4px;  right: 4px;  height: 4px; cursor: s-resize;  }
        .dh-resize-e  { right: 0;  top: 4px;   bottom: 4px; width: 4px;  cursor: e-resize;  }
        .dh-resize-w  { left: 0;   top: 4px;   bottom: 4px; width: 4px;  cursor: w-resize;  }
        .dh-resize-nw { top: 0;    left: 0;    width: 10px; height: 10px; cursor: nw-resize; }
        .dh-resize-ne { top: 0;    right: 0;   width: 10px; height: 10px; cursor: ne-resize; }
        .dh-resize-sw { bottom: 0; left: 0;    width: 10px; height: 10px; cursor: sw-resize; }
        .dh-resize-se { bottom: 0; right: 0;   width: 10px; height: 10px; cursor: se-resize; }

        #__dh_snap_ghost__ {
            position: fixed; pointer-events: none;
            border-radius: 6px;
            background: rgba(61,155,255,0.12);
            border: 2px solid rgba(61,155,255,0.5);
            z-index: 9990; display: none;
            transition: all 0.12s cubic-bezier(.4,0,.2,1);
        }
    `;
    document.head.appendChild(style);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ensureDesktop() {
    let el = document.getElementById("__dh_desktop__");
    if (!el) { el = document.createElement("div"); el.id = "__dh_desktop__"; document.body.appendChild(el); }
    return el;
}

function ensureTaskbar() {
    let el = document.getElementById("__dh_taskbar__");
    if (!el) {
        el = document.createElement("div"); el.id = "__dh_taskbar__"; document.body.appendChild(el);
        
        // Add permanent AppStarter button on the left
        const appStarterBtn = document.createElement("button");
        appStarterBtn.className = "dh-taskbar-btn";
        appStarterBtn.innerHTML = `<span class="tb-icon">⊞</span>`;
        appStarterBtn.title = "Start App Starter";
        appStarterBtn.onclick = () => {
            if (!Registry.app_check_exists("AppStarter")) {
                // Import and start AppStarter if not already running
                import("../../apps/AppStarter/script.js")
                    .then((AppModule) => {
                        const AppBody = AppModule.default;
                        Registry.app_start("AppStarter", AppBody);
                    })
                    .catch((e) => {
                        console.error(`Failed to start AppStarter: ${e}`);
                    });
            } else {
                // If already running, focus its window (assuming it has one)
                // For now, just log that it's already running
                console.log("AppStarter is already running");
            }
        };
        el.appendChild(appStarterBtn);
        
        const clock = document.createElement("div"); clock.className = "dh-taskbar-clock"; el.appendChild(clock);
        const tick = () => {
            const n = new Date();
            clock.innerHTML = n.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                + "<br>" + n.toLocaleDateString([], { month: "short", day: "numeric" });
        };
        setInterval(tick, 1000); tick();
    }
    return el;
}

function ensureSnapGhost() {
    let el = document.getElementById("__dh_snap_ghost__");
    if (!el) { el = document.createElement("div"); el.id = "__dh_snap_ghost__"; document.body.appendChild(el); }
    return el;
}

let _zTop = 1100;
function bringToFront(winEl) { winEl.style.zIndex = ++_zTop; }

// ─── Window Manager ───────────────────────────────────────────────────────────
const WindowManager = (() => {
    const windows = new Map();
    let nextId = 1;

    function focusWindow(id) {
        windows.forEach((w, wid) => {
            w.el.classList.toggle("focused", wid === id);
            w.taskbarBtn?.classList.toggle("active", wid === id);
        });
        const win = windows.get(id);
        if (win) bringToFront(win.el);
    }

    function toggleMaximize(id) {
        const w = windows.get(id); if (!w) return;
        const el = w.el;
        if (el.classList.contains("maximized")) {
            el.classList.add("snapping"); el.classList.remove("maximized");
            if (w.preMaxRect) {
                el.style.left   = w.preMaxRect.left   + "px"; el.style.top    = w.preMaxRect.top    + "px";
                el.style.width  = w.preMaxRect.width  + "px"; el.style.height = w.preMaxRect.height + "px";
            }
            setTimeout(() => el.classList.remove("snapping"), 220);
        } else {
            w.preMaxRect = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
            el.classList.add("snapping", "maximized");
            setTimeout(() => el.classList.remove("snapping"), 220);
        }
    }

    function makeWindow({ appName, title, icon, width, height, x, y }) {
        const desktop = ensureDesktop();
        const id = nextId++;
        const dw = desktop.clientWidth  || window.innerWidth;
        const dh = desktop.clientHeight || (window.innerHeight - 44);
        const cx = x ?? Math.max(20, Math.min((id * 28) % (dw - width - 40),  dw - width - 20));
        const cy = y ?? Math.max(20, Math.min((id * 28) % (dh - height - 40), dh - height - 20));

        // Window shell (platform chrome — not visible to apps)
        const win = document.createElement("div");
        win.className = "dh-window";
        win.style.cssText = `left:${cx}px;top:${cy}px;width:${width}px;height:${height}px;`;

        const titlebar = document.createElement("div");
        titlebar.className = "dh-titlebar";
        titlebar.innerHTML = `
            <span class="dh-titlebar-icon">${icon}</span>
            <span class="dh-titlebar-title">${title}</span>
            <div class="dh-win-controls">
                <button class="dh-win-btn minimize" title="Minimize"></button>
                <button class="dh-win-btn maximize" title="Maximize"></button>
                <button class="dh-win-btn close"    title="Close"></button>
            </div>`;

        // ── Shadow DOM — every app gets its own isolated subtree ──────────────
        const shadowHost = document.createElement("div");
        shadowHost.className = "dh-window-shadow-host";
        const shadowRoot = shadowHost.attachShadow({ mode: "open" });

        // Minimal reset injected into every shadow so apps start clean
        const baseStyle = document.createElement("style");
        baseStyle.textContent = `
            :host {
                display: block;
                width: 100%;
                height: 100%;
                overflow: hidden;
                box-sizing: border-box;
            }
            #__app_root__ {
                width: 100%;
                height: 100%;
                overflow: auto;
                box-sizing: border-box;
            }
        `;
        shadowRoot.appendChild(baseStyle);

        // This is the node apps render their content into
        const appRoot = document.createElement("div");
        appRoot.id = "__app_root__";
        shadowRoot.appendChild(appRoot);

        // Resize handles
        ["n","s","e","w","nw","ne","sw","se"].forEach(d => {
            const h = document.createElement("div");
            h.className = `dh-resize-handle dh-resize-${d}`; h.dataset.dir = d;
            win.appendChild(h);
        });

        win.appendChild(titlebar);
        win.appendChild(shadowHost);
        desktop.appendChild(win);

        // Taskbar button
        const taskbar = ensureTaskbar();
        const btn = document.createElement("button");
        btn.className = "dh-taskbar-btn";
        btn.innerHTML = `<span class="tb-icon">${icon}</span><span>${title}</span>`;
        btn.onclick = () => {
            if (win.classList.contains("minimized"))      { win.classList.remove("minimized"); focusWindow(id); }
            else if (win.classList.contains("focused"))   { win.classList.add("minimized"); win.classList.remove("focused"); btn.classList.remove("active"); }
            else                                          { focusWindow(id); }
        };
        taskbar.insertBefore(btn, taskbar.querySelector(".dh-taskbar-clock"));

        const record = { id, el: win, shadowRoot, appRoot, appName, title, icon, taskbarBtn: btn, preMaxRect: null };
        windows.set(id, record);

        // Controls
        titlebar.querySelector(".dh-win-btn.close").onclick    = () => { win.remove(); btn.remove(); windows.delete(id); };
        titlebar.querySelector(".dh-win-btn.minimize").onclick = () => { win.classList.add("minimized"); win.classList.remove("focused"); btn.classList.remove("active"); };
        titlebar.querySelector(".dh-win-btn.maximize").onclick = () => toggleMaximize(id);
        titlebar.addEventListener("dblclick", e => { if (!e.target.classList.contains("dh-win-btn")) toggleMaximize(id); });
        win.addEventListener("mousedown", e => { if (!e.target.classList.contains("dh-win-btn")) focusWindow(id); });

        attachDrag(titlebar, win, id, record);
        win.querySelectorAll(".dh-resize-handle").forEach(h => attachResize(h, win, id));

        focusWindow(id);
        return record;
    }

    function attachDrag(handle, win, id, record) {
        let ox, oy, dragging = false;
        const ghost = ensureSnapGhost();
        const desktop = ensureDesktop();

        handle.addEventListener("mousedown", e => {
            if (e.button !== 0 || e.target.classList.contains("dh-win-btn")) return;
            if (win.classList.contains("maximized")) {
                const pw = record.preMaxRect?.width ?? 700, ph = record.preMaxRect?.height ?? 450;
                win.classList.remove("maximized");
                win.style.width = pw + "px"; win.style.height = ph + "px";
                win.style.left  = Math.max(0, e.clientX - pw / 2) + "px";
                win.style.top   = Math.max(0, e.clientY - 16) + "px";
            }
            dragging = true;
            ox = e.clientX - win.offsetLeft;
            oy = e.clientY - win.offsetTop;
            e.preventDefault();
        });

        document.addEventListener("mousemove", e => {
            if (!dragging) return;
            const dw = desktop.clientWidth || window.innerWidth;
            const dh = desktop.clientHeight || (window.innerHeight - 44);
            const SNAP = 16; let snapRect = null;
            if      (e.clientX <= SNAP)       snapRect = { left: 0,    top: 0, width: dw / 2, height: dh };
            else if (e.clientX >= dw - SNAP)  snapRect = { left: dw/2, top: 0, width: dw / 2, height: dh };
            else if (e.clientY <= SNAP)       snapRect = { left: 0,    top: 0, width: dw,     height: dh };

            if (snapRect) {
                ghost.style.display = "block";
                ghost.style.left = snapRect.left + "px"; ghost.style.top    = snapRect.top    + "px";
                ghost.style.width = snapRect.width + "px"; ghost.style.height = snapRect.height + "px";
                win._pendingSnap = snapRect;
            } else { ghost.style.display = "none"; win._pendingSnap = null; }

            win.style.left = Math.max(-(win.offsetWidth - 80), Math.min(e.clientX - ox, dw - 80)) + "px";
            win.style.top  = Math.max(0, Math.min(e.clientY - oy, dh - 30)) + "px";
        });

        document.addEventListener("mouseup", () => {
            if (!dragging) return;
            dragging = false; ghost.style.display = "none";
            if (win._pendingSnap) {
                const s = win._pendingSnap;
                record.preMaxRect = { left: win.offsetLeft, top: win.offsetTop, width: win.offsetWidth, height: win.offsetHeight };
                win.classList.add("snapping");
                win.style.left = s.left + "px"; win.style.top    = s.top    + "px";
                win.style.width = s.width + "px"; win.style.height = s.height + "px";
                const dw = desktop.clientWidth || window.innerWidth;
                const dh = desktop.clientHeight || (window.innerHeight - 44);
                if (s.width === dw && s.height === dh) win.classList.add("maximized");
                setTimeout(() => win.classList.remove("snapping"), 220);
                win._pendingSnap = null;
            }
        });
    }

    function attachResize(handle, win, id) {
        handle.addEventListener("mousedown", e => {
            if (e.button !== 0 || win.classList.contains("maximized")) return;
            e.stopPropagation(); e.preventDefault();
            const dir = handle.dataset.dir, sx = e.clientX, sy = e.clientY;
            const rect = { l: win.offsetLeft, t: win.offsetTop, w: win.offsetWidth, h: win.offsetHeight };
            focusWindow(id);
            const onMove = e => {
                const dx = e.clientX - sx, dy = e.clientY - sy;
                let nl = rect.l, nt = rect.t, nw = rect.w, nh = rect.h;
                if (dir.includes("e"))  nw = Math.max(180, rect.w + dx);
                if (dir.includes("s"))  nh = Math.max(120, rect.h + dy);
                if (dir.includes("w")) { nw = Math.max(180, rect.w - dx); nl = rect.l + (rect.w - nw); }
                if (dir.includes("n")) { nh = Math.max(120, rect.h - dy); nt = rect.t + (rect.h - nh); }
                win.style.left = nl + "px"; win.style.top    = nt + "px";
                win.style.width = nw + "px"; win.style.height = nh + "px";
            };
            const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup",   onUp);
        });
    }

    return {
        create({ appName, title, icon = "🖥", width = 500, height = 360, x, y } = {}) {
            return makeWindow({ appName, title: title ?? appName, icon, width, height, x, y });
        },
        close(id)    { const w = windows.get(id); if (!w) return; w.el.remove(); w.taskbarBtn?.remove(); windows.delete(id); },
        minimize(id) { const w = windows.get(id); if (!w) return; w.el.classList.add("minimized"); w.taskbarBtn?.classList.remove("active"); },
        maximize(id) { toggleMaximize(id); },
        focus(id)    { focusWindow(id); },
        setTitle(id, title) {
            const w = windows.get(id); if (!w) return;
            w.el.querySelector(".dh-titlebar-title").textContent = title;
            if (w.taskbarBtn) w.taskbarBtn.querySelector("span:last-child").textContent = title;
            w.title = title;
        },
        all() { return [...windows.entries()].map(([id, w]) => ({ id, appName: w.appName, title: w.title })); },
    };

    function focusWindow(id) {
        windows.forEach((w, wid) => {
            w.el.classList.toggle("focused", wid === id);
            w.taskbarBtn?.classList.toggle("active", wid === id);
        });
        const win = windows.get(id);
        if (win) bringToFront(win.el);
    }
})();


// ─── Division Registry ────────────────────────────────────────────────────────
const DivisionRegistry = (() => {
    const divisions = [];

    return {
        division_create(AppName, options = {}) {
            if (!Registry.app_check_exists(AppName)) {
                return { type: "error", status: "App does not exist." };
            }

            const record = WindowManager.create({
                appName: AppName,
                title:   options.title  ?? AppName,
                icon:    options.icon   ?? "🖥",
                width:   options.width  ?? 500,
                height:  options.height ?? 360,
                x:       options.x,
                y:       options.y,
            });

            divisions.push({ AppName, WindowId: record.id });

            return {
                type: "success", status: "",
                data: {
                    // DomElement  — append your content here (scoped div inside shadow)
                    DomElement: record.appRoot,
                    // ShadowRoot  — inject <style> tags here for fully isolated CSS
                    ShadowRoot: record.shadowRoot,
                    WindowId:   record.id,
                }
            };
        },

        division_close(WindowId)        { WindowManager.close(WindowId);         const i = divisions.findIndex(d => d.WindowId === WindowId); if (i !== -1) divisions.splice(i, 1); return { type: "success", status: "" }; },
        division_minimize(WindowId)     { WindowManager.minimize(WindowId);      return { type: "success", status: "" }; },
        division_maximize(WindowId)     { WindowManager.maximize(WindowId);      return { type: "success", status: "" }; },
        division_set_title(WindowId, t) { WindowManager.setTitle(WindowId, t);   return { type: "success", status: "" }; },
        division_focus(WindowId)        { WindowManager.focus(WindowId);         return { type: "success", status: "" }; },
    };
})();


// ─── Request Handler ──────────────────────────────────────────────────────────
function RequestHandler(AppName, CallBody) {
    switch (CallBody.type) {
        case "division_create":    return DivisionRegistry.division_create(AppName, CallBody.options ?? {});
        case "division_close":     return DivisionRegistry.division_close(CallBody.WindowId);
        case "division_minimize":  return DivisionRegistry.division_minimize(CallBody.WindowId);
        case "division_maximize":  return DivisionRegistry.division_maximize(CallBody.WindowId);
        case "division_set_title": return DivisionRegistry.division_set_title(CallBody.WindowId, CallBody.title);
        case "division_focus":     return DivisionRegistry.division_focus(CallBody.WindowId);
        default: return { type: "error", status: `Unknown call type: ${CallBody.type}` };
    }
}


// ─── App Entry Point ──────────────────────────────────────────────────────────
export default async function AppBody() {
    const AppName = "DomHandler";
    Registry.responsibility_create("DomHandler", AppName, RequestHandler);
}

export { WindowManager, DivisionRegistry };