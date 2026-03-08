// SlideShowHandler.js
//
// Presentation editor — new Registry/responsibility architecture.
//
// DB layout (via dbuserfractioning):
//
//   frac_ref "projects"
//     └─ {projectHash} → { name, footer, description,
//                          references: { slides: ["sh_abc", "sh_def"] },
//                          children:[] }
//        (references.slides[] contains ONLY slide-ref hashes)
//        (children[] nodes also carry slides objects, recursively)
//
//   frac_ref "slides"
//     └─ {slideHash}  → { type, title, footer, data, depth }
//
// No project data is changed by this app — it only reads the project
// structure for navigation context and reads/writes the slides partition.
//
import { Registry } from "../../WebAppPlatform-main.js";

const APP_ID = "Slides";

// ─────────────────────────────────────────────────────────────────────────────
//  SlideTypeRegistry
// ─────────────────────────────────────────────────────────────────────────────

export const SlideTypeRegistry = new Map();

function attachBlurSave(el, getValue, setValue, slideObject, onChange) {
  if (!el) return;
  let oldValue = "";
  el.addEventListener("focus", () => {
    oldValue = getValue();
  });
  el.addEventListener("blur", () => {
    const current = getValue();
    if (current !== oldValue) {
      setValue(current);
      onChange(slideObject, { rerender: false });
    }
  });
}

// ── general ──────────────────────────────────────────────────────────────────
SlideTypeRegistry.set("general", {
  defaultData: () => "",
  deserialize(raw) {
    return { data: raw.data || "" };
  },
  serialize(s) {
    return { data: s.data };
  },

  mount(el, slide, onChange, utils) {
    const { restoreContentWithBreaks, extractContentWithBreaks } = utils;
    const headerEl = el.querySelector(".slide-header");
    const footerEl = el.querySelector(".slide-footer");
    headerEl.contentEditable = "true";
    footerEl.contentEditable = "true";
    headerEl.innerHTML = restoreContentWithBreaks(slide.title || "");
    footerEl.innerHTML = restoreContentWithBreaks(slide.footer || "");
    attachBlurSave(
      headerEl,
      () => extractContentWithBreaks(headerEl),
      (v) => (slide.title = v),
      slide,
      onChange,
    );
    attachBlurSave(
      footerEl,
      () => extractContentWithBreaks(footerEl),
      (v) => (slide.footer = v),
      slide,
      onChange,
    );
  },
});

// ── title ─────────────────────────────────────────────────────────────────────
SlideTypeRegistry.set("title", {
  defaultData: () => "",
  deserialize(raw) {
    return { data: raw.description || "" };
  },
  serialize(s) {
    return { description: s.data };
  },

  mount(el, slide, onChange, utils, activeProjectHash) {
    const {
      restoreContentWithBreaks,
      extractContentWithBreaks,
      colorFromIndex,
      fadeHslTowardWhite,
    } = utils;
    SlideTypeRegistry.get("general").mount(el, slide, onChange, utils);

    function depthFromPath(path) {
      if (!path) return 0;
      return path.split("children").length - 1;
    }

    el.style.backgroundColor = fadeHslTowardWhite(
      colorFromIndex((slide.depth || 0) + depthFromPath(activeProjectHash)),
    );

    const bodyEl = el.querySelector(".slide-body");
    bodyEl.contentEditable = "true";
    bodyEl.innerHTML = restoreContentWithBreaks(slide.data || "");
    attachBlurSave(
      bodyEl,
      () => extractContentWithBreaks(bodyEl),
      (v) => (slide.data = v),
      slide,
      onChange,
    );
  },
});

// ── text ──────────────────────────────────────────────────────────────────────
SlideTypeRegistry.set("text", {
  defaultData: () => "",
  deserialize(raw) {
    return { data: raw.data || "" };
  },
  serialize(s) {
    return { data: s.data };
  },

  mount(el, slide, onChange, utils) {
    const { restoreContentWithBreaks, extractContentWithBreaks } = utils;
    SlideTypeRegistry.get("general").mount(el, slide, onChange, utils);
    const bodyEl = el.querySelector(".slide-body");
    bodyEl.contentEditable = "true";
    bodyEl.innerHTML = restoreContentWithBreaks(slide.data || "");
    attachBlurSave(
      bodyEl,
      () => extractContentWithBreaks(bodyEl),
      (v) => (slide.data = v),
      slide,
      onChange,
    );
  },
});

// ── columns ───────────────────────────────────────────────────────────────────
SlideTypeRegistry.set("columns", {
  defaultData: () => ({ left: "", right: "" }),
  deserialize(raw) {
    return {
      data: { left: raw.data?.left || "", right: raw.data?.right || "" },
    };
  },
  serialize(s) {
    return { data: s.data };
  },

  mount(el, slide, onChange, utils) {
    const { restoreContentWithBreaks, extractContentWithBreaks } = utils;
    SlideTypeRegistry.get("general").mount(el, slide, onChange, utils);
    const bodyEl = el.querySelector(".slide-body");
    bodyEl.style.cssText = "display:flex;flex-direction:row;width:100%";
    bodyEl.innerHTML = `
      <div class="col-left"  contenteditable="true" style="width:50%;height:100%;box-sizing:border-box;">${restoreContentWithBreaks(slide.data.left || "")}</div>
      <div class="col-right" contenteditable="true" style="width:50%;height:100%;box-sizing:border-box;">${restoreContentWithBreaks(slide.data.right || "")}</div>
    `;
    attachBlurSave(
      bodyEl.querySelector(".col-left"),
      () => extractContentWithBreaks(bodyEl.querySelector(".col-left")),
      (v) => (slide.data.left = v),
      slide,
      onChange,
    );
    attachBlurSave(
      bodyEl.querySelector(".col-right"),
      () => extractContentWithBreaks(bodyEl.querySelector(".col-right")),
      (v) => (slide.data.right = v),
      slide,
      onChange,
    );
  },
});

// ── math ──────────────────────────────────────────────────────────────────────
SlideTypeRegistry.set("math", {
  defaultData: () => "",
  deserialize(raw) {
    return { data: raw.data || "" };
  },
  serialize(s) {
    return { data: s.data };
  },

  mount(el, slide, onChange, utils) {
    SlideTypeRegistry.get("general").mount(el, slide, onChange, utils);
    const init = () => {
      const MQ = MathQuill.getInterface(2);
      const bodyEl = el.querySelector(".slide-body");
      bodyEl.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:1rem;"><span class="mq-field"></span></div>`;
      const mq = MQ.MathField(bodyEl.querySelector(".mq-field"), {
        spaceBehavesLikeTab: true,
        handlers: {
          edit(f) {
            slide.data = f.latex();
            onChange(slide, { rerender: false });
          },
        },
      });
      if (slide.data) mq.latex(slide.data);
    };
    const loadMQ = () => {
      const s = document.createElement("script");
      s.src =
        "https://cdnjs.cloudflare.com/ajax/libs/mathquill/0.10.1/mathquill.min.js";
      s.onload = () => {
        window.__mathquillReady = true;
        init();
      };
      document.head.appendChild(s);
    };
    if (window.__mathquillReady) {
      init();
      return;
    }
    if (window.jQuery) {
      loadMQ();
    } else {
      const jq = document.createElement("script");
      jq.src =
        "https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js";
      jq.onload = loadMQ;
      document.head.appendChild(jq);
    }
  },
});

// ── iframe ────────────────────────────────────────────────────────────────────
SlideTypeRegistry.set("iframe", {
  defaultData: () => ({ src: "" }),
  deserialize(raw) {
    return { data: { src: raw.data?.src ?? "" } };
  },
  serialize(s) {
    return { data: s.data };
  },

  mount(el, slide, onChange, utils) {
    SlideTypeRegistry.get("general").mount(el, slide, onChange, utils);
    const bodyEl = el.querySelector(".slide-body");
    bodyEl.style.cssText = "padding:0;overflow:hidden;";
    const src = slide.data?.src || "";
    bodyEl.innerHTML = src
      ? `<iframe src="${src}" style="width:100%;height:100%;border:none;display:block;" scrolling="yes" allowfullscreen></iframe>`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;opacity:0.4;font-size:1.2rem;">No URL set — click ✎ to configure</div>`;
  },

  editModal(bodyEl, slide, onChange, utils) {
    const src = slide.data?.src ?? "";
    bodyEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem;">
        <div style="display:flex;flex-direction:column;gap:0.4rem;">
          <label class="edit-modal-label">URL</label>
          <input class="edit-modal-input" id="iframe-src-input" type="url" value="${src}" placeholder="https://example.com" spellcheck="false">
        </div>
        <div style="background:#f0f0f0;border-radius:6px;padding:0.75rem;font-size:0.8rem;opacity:0.7;line-height:1.5;">ℹ️ Some sites block embedding via X-Frame-Options.</div>
        <div style="display:flex;flex-direction:column;gap:0.4rem;">
          <label class="edit-modal-label">Preview</label>
          <div id="iframe-preview" style="width:100%;height:200px;border:1px solid #ccc;border-radius:6px;overflow:hidden;background:#fff;">
            ${
              src
                ? `<iframe src="${src}" style="width:100%;height:100%;border:none;" scrolling="yes" allowfullscreen></iframe>`
                : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;opacity:0.4;">Enter a URL above</div>`
            }
          </div>
        </div>
      </div>
    `;
    const srcInput = bodyEl.querySelector("#iframe-src-input");
    const preview = bodyEl.querySelector("#iframe-preview");
    let debounce;
    srcInput.oninput = () => {
      slide.data.src = srcInput.value.trim();
      onChange(slide, { rerender: true });
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const s = srcInput.value.trim();
        preview.innerHTML = s
          ? `<iframe src="${s}" style="width:100%;height:100%;border:none;" scrolling="yes" allowfullscreen></iframe>`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;opacity:0.4;">Enter a URL above</div>`;
      }, 600);
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
//  DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function slideHash() {
  return "sh_" + Math.random().toString(36).substr(2, 9);
}

async function fracGet(ref) {
  console.log("Getting: ", ref);
  const res = await Registry.responsibility_call("dbuserfractioning", APP_ID, {
    type: "frac_get",
    id: APP_ID,
    ref,
  });
  if (res.type !== "success") throw new Error(res.status);
  return res.body ?? {};
}

async function fracSet(ref, body) {
  console.log("Setting: ", ref);
  let meta = {};
  if (ref == "slides"){
    // send extra info to not save the dataRefs here
    meta = { skipDataRefs: true };
  }
  const res = await Registry.responsibility_call("dbuserfractioning", APP_ID, {
    type: "frac_set",
    ref,
    body,
    meta,
  });
  if (res.type !== "success") throw new Error(res.status);
}

// ─────────────────────────────────────────────────────────────────────────────
//  fracGetByKeys — fetch specific slide hashes directly from "slides" partition
//  without going through the dataRefs gate. The keys are trusted because they
//  come from the project tree the user already has read access to.
// ─────────────────────────────────────────────────────────────────────────────

async function fracGetSlidesByKeys(keys) {
  if (!keys || keys.length === 0) return {};
  const res = await Registry.responsibility_call("dbuserfractioning", APP_ID, {
    type: "frac_get_by_keys",
    ref: "slides",
    keys,
  });
  if (res.type !== "success") throw new Error(res.status);
  return res.body ?? {};
}

// ─────────────────────────────────────────────────────────────────────────────
//  Load: project node → flat slide array
//
//  Project node shape (written by ProjectManager):
//    { name, footer, description,
//      slides: { slides: ["sh_aaa", "sh_bbb"] },   ← refs wrapped in object
//      children: [ ...same shape... ] }
//
//  We collect all unique slide hashes from the tree, fetch them directly
//  from the "slides" partition by key, then flatten into display order.
// ─────────────────────────────────────────────────────────────────────────────

async function loadSlidesForProject(projectHash, allProjectsOptional = null) {
  // 1. Fetch the full project tree from "projects" (or use provided data)
  const allProjects = allProjectsOptional ?? (await fracGet("projects"));

  // Navigate to the node at projectHash
  const projectNode = resolveProjectNode(allProjects, projectHash);
  if (!projectNode) throw new Error(`Project node not found: ${projectHash}`);

  // 2. Collect all unique slide hashes referenced in this subtree
  const allRefs = collectSlideRefs(projectNode);

  // 3. Fetch slides directly by their keys (bypasses dataRefs gate)
  const slidesPartition = await fracGetSlidesByKeys(allRefs);

  // 4. Flatten the project tree into a display slide array
  return flattenProject(projectNode, slidesPartition, 0, "");
}

function resolveProjectNode(allProjects, projectHash) {
  if (!projectHash) return null;
  const parts = projectHash.split("/").filter(Boolean);
  let node = allProjects[parts[0]];
  if (!node) return null;
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    if (seg === "children") continue;
    const idx = parseInt(seg, 10);
    if (!isNaN(idx)) {
      node = node?.children?.[idx];
    } else {
      node = node?.[seg];
    }
    if (!node) return null;
  }
  return node;
}

// Reads slide refs from the new { slides: { slides: [...] } } shape,
// with fallback to the legacy bare array for backwards compatibility.
function getSlideRefsFromNode(node) {
  if (node.references && Array.isArray(node.references.slides)) {
    return node.references.slides;
  }
  // Legacy fallback: bare slideRefs array
  if (Array.isArray(node.slideRefs) || (node.slides && Array.isArray(node.slides.slides))) {
    return node.slideRefs || node.slides?.slides || [];
  }
  return [];
}

function collectSlideRefs(node) {
  const refs = new Set();
  getSlideRefsFromNode(node).forEach((h) => refs.add(h));
  (node.children || []).forEach((child) =>
    collectSlideRefs(child).forEach((h) => refs.add(h)),
  );
  return [...refs];
}

function flattenProject(node, slidesPartition, depth, prefix) {
  const result = [];

  // Title slide for this node
  result.push({
    hash: node.hash || null,
    type: "title",
    title: (prefix + " " + (node.name ?? "")).trim(),
    footer: node.footer || "",
    depth,
    ...SlideTypeRegistry.get("title").deserialize(node),
  });

  // Content slides for this node
  getSlideRefsFromNode(node).forEach((slideHash) => {
    const raw = slidesPartition[slideHash];
    if (!raw) return;
    const type = raw.type || "text";
    result.push({
      slideHash,
      type,
      title: raw.title || "",
      footer: raw.footer || "",
      depth: depth + 1,
      ...(SlideTypeRegistry.get(type)?.deserialize(raw) ?? { data: raw.data }),
    });
  });

  // Recurse into children
  (node.children || []).forEach((child, idx) => {
    const nextPrefix = prefix ? `${prefix}${idx + 1}.` : `${idx + 1}.`;
    result.push(
      ...flattenProject(child, slidesPartition, depth + 1, nextPrefix),
    );
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Save: flat slide array → upsert changed slides + update project slides refs
//
//  We ONLY touch the "slides" partition — we never rewrite the project tree.
//  For project nodes we update references.slides (the new shape) at each level.
// ─────────────────────────────────────────────────────────────────────────────

async function saveSlides(flatSlides, projectHash) {
  // 1. Separate title slides from content slides
  const contentSlides = flatSlides.filter((s) => s.type !== "title");

  // 2. Ensure every content slide has a stable hash
  contentSlides.forEach((s) => {
    if (!s.slideHash) s.slideHash = slideHash();
  });

  // 3. Write all changed slides to "slides" partition
  const slidesBody = {};
  contentSlides.forEach((s) => {
    const handler =
      SlideTypeRegistry.get(s.type) ?? SlideTypeRegistry.get("text");
    slidesBody[s.slideHash] = {
      type: s.type,
      title: s.title || "",
      footer: s.footer || "",
      depth: s.depth || 0,
      ...handler.serialize(s),
    };
  });
  console.log("[saveSlides] contentSlides:", contentSlides);
  console.log("[saveSlides] slidesBody:", slidesBody);
  if (Object.keys(slidesBody).length > 0) {
    await fracSet("slides", slidesBody);
  }

  // 4. Rebuild references.slides on the project node(s)
  await patchProjectSlideRefs(flatSlides, projectHash);
}

async function patchProjectSlideRefs(flatSlides, projectHash) {
  const allProjects = await fracGet("projects");
  const rootNode = resolveProjectNode(allProjects, projectHash);
  if (!rootNode) return;

  const stack = [{ node: rootNode, depth: -1 }];

  // Reset all slide ref arrays in this subtree
  clearSlideRefs(rootNode);

  flatSlides.forEach((slide) => {
    if (slide.type === "title") {
      while (stack.length > 1 && stack[stack.length - 1].depth >= slide.depth) {
        stack.pop();
      }
      const cleanName = slide.title.replace(/^[\d.]+\s+/, "").trim();
      const parent = stack[stack.length - 1].node;
      let matchNode = null;

      if (stack.length === 1 && slide.depth === 0) {
        matchNode = rootNode;
      } else {
        matchNode =
          (parent.children || []).find((c) => c.name === cleanName) || null;
      }

      if (matchNode) {
        // Ensure the new shape exists
        if (!matchNode.references || typeof matchNode.references !== "object") {
          matchNode.references = { slides: [] };
        }
        matchNode.references.slides = [];
        // Persist title slide edits back to the node
        matchNode.description = slide.data || "";
        matchNode.footer = slide.footer || "";
        stack.push({ node: matchNode, depth: slide.depth });
      }
    } else {
      // Content slide — attach ref to current top of stack
      const top = stack[stack.length - 1].node;
      if (!top.references || typeof top.references !== "object") {
        top.references = { slides: [] };
      }
      top.references.slides.push(slide.slideHash);
    }
  });

  // Write back only the root hash key in the projects partition
  const rootHash = projectHash.split("/")[0];
  const projectBody = { [rootHash]: allProjects[rootHash] };
  await fracSet("projects", projectBody);
}

function clearSlideRefs(node) {
  // Always write the new shape; drop legacy slideRefs if present
  node.references = { slides: [] };
  delete node.slideRefs;
  delete node.slides;
  (node.children || []).forEach(clearSlideRefs);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Styles
// ─────────────────────────────────────────────────────────────────────────────

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Sora:wght@400;500;600&display=swap');
  @import url('https://cdnjs.cloudflare.com/ajax/libs/mathquill/0.10.1/mathquill.min.css');

  :host {
    --bg: #0c0e13;
    --surface: #13151d;
    --surface2: #1a1d28;
    --border: rgba(255,255,255,0.07);
    --text: rgba(255,255,255,0.85);
    --muted: rgba(255,255,255,0.32);
    --accent: #a78bfa;
    --accent2: #34d399;
    --danger: #f87171;
    --font: 'Sora', sans-serif;
    --mono: 'DM Mono', monospace;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  #__app_root__ {
    width: 100%; height: 100%;
    background: var(--bg);
    font-family: var(--font);
    color: var(--text);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-size: 13px;
  }

  /* ── Header ── */
  .header {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .header-title { font-size: 12.5px; font-weight: 600; color: var(--accent); flex: 1; letter-spacing: -0.01em; }
  .project-badge {
    font-size: 10px; font-family: var(--mono);
    padding: 2px 8px; border-radius: 10px;
    background: rgba(167,139,250,0.1); color: var(--accent);
    border: 1px solid rgba(167,139,250,0.22);
    max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .icon-btn {
    width: 26px; height: 26px; border-radius: 6px;
    border: 1px solid var(--border);
    background: rgba(255,255,255,0.04);
    color: var(--text); font-size: 13px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.12s, border-color 0.12s;
    font-family: inherit;
  }
  .icon-btn:hover { background: rgba(167,139,250,0.14); border-color: rgba(167,139,250,0.4); }
  .icon-btn.danger:hover { background: rgba(248,113,113,0.12); border-color: rgba(248,113,113,0.35); }
  .icon-btn[hidden] { display: none !important; }

  /* ── Main layout ── */
  .presentation {
    flex: 1; display: flex; overflow: hidden;
  }

  /* ── Thumbnail panel ── */
  .left-panel {
    width: 148px; flex-shrink: 0;
    display: flex; flex-direction: column;
    border-right: 1px solid var(--border);
    background: var(--surface);
  }
  .thumbnails {
    flex: 1; overflow-y: auto;
    padding: 8px 6px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .thumbnails::-webkit-scrollbar { width: 3px; }
  .thumbnails::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

  .thumbnail {
    border-radius: 6px;
    border: 1.5px solid transparent;
    overflow: hidden;
    cursor: pointer;
    flex-shrink: 0;
    transition: border-color 0.15s, box-shadow 0.15s;
    aspect-ratio: 16/9;
    position: relative;
    background: #1e2030;
  }
  .thumbnail:hover  { border-color: rgba(167,139,250,0.4); }
  .thumbnail.active { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(167,139,250,0.18); }
  .thumbnail.dragging { opacity: 0.3; }

  .thumb-stage {
    position: absolute; inset: 0;
    transform-origin: top left;
    pointer-events: none;
  }

  /* ── Toolbar below thumbnails ── */
  .toolbar {
    display: flex; justify-content: center; gap: 5px;
    padding: 7px 6px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  /* ── Screen ── */
  .screen-wrapper {
    flex: 1; display: flex;
    align-items: center; justify-content: center;
    overflow: hidden; padding: 16px;
    background: #080a0f;
  }
  .screen {
    transform-origin: center center;
    width: 1600px; height: 900px;
    position: relative;
  }

  /* ── Slide element ── */
  .slide {
    width: 1600px; height: 900px;
    background: #fff;
    display: flex; flex-direction: column;
    font-family: var(--font);
    color: #1a1a2e;
    position: relative;
  }
  .slide-header {
    padding: 40px 80px 10px;
    font-size: 2.8rem; font-weight: 600;
    line-height: 1.2; min-height: 120px;
    outline: none;
  }
  .slide-body {
    flex: 1; padding: 20px 80px;
    font-size: 1.8rem; line-height: 1.6;
    overflow: hidden; outline: none;
  }
  .slide-footer {
    padding: 10px 80px 28px;
    font-size: 1rem; opacity: 0.45;
    outline: none; min-height: 50px;
  }
  [contenteditable]:focus { outline: 2px solid rgba(167,139,250,0.4); outline-offset: 2px; border-radius: 3px; }

  /* ── Empty state ── */
  .empty-state {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: var(--muted); font-size: 13px; flex-direction: column; gap: 8px;
  }

  /* ── Status bar ── */
  .status-bar {
    padding: 4px 12px;
    border-top: 1px solid var(--border);
    font-size: 10px; color: var(--muted);
    font-family: var(--mono); flex-shrink: 0;
  }

  /* ── Type dialog ── */
  .type-dialog {
    position: fixed; z-index: 9999;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6);
    min-width: 160px;
  }
  .type-dialog h1 { font-size: 11px; color: var(--muted); margin-bottom: 8px; letter-spacing: 0.06em; text-transform: uppercase; font-family: var(--mono); }
  .type-dialog label {
    display: flex; align-items: center; gap: 7px;
    padding: 5px 6px; border-radius: 5px; cursor: pointer;
    font-size: 12px; transition: background 0.1s;
  }
  .type-dialog label:hover { background: rgba(167,139,250,0.12); }

  /* ── Edit modal ── */
  .edit-modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(4px);
    z-index: 9999;
    display: flex; align-items: center; justify-content: center;
  }
  .edit-modal {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 16px 56px rgba(0,0,0,0.7);
    width: min(680px, 90vw);
    max-height: 80vh;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .edit-modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-weight: 600; font-size: 13px; flex-shrink: 0;
  }
  .edit-modal-body { padding: 16px; overflow-y: auto; flex: 1; }
  .edit-modal-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--mono); }
  .edit-modal-input {
    width: 100%; padding: 7px 10px;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--border);
    border-radius: 6px; color: var(--text);
    font-family: var(--mono); font-size: 12px; outline: none;
  }
  .edit-modal-input:focus { border-color: rgba(167,139,250,0.5); }
`;

// ─────────────────────────────────────────────────────────────────────────────
//  SlideShowHandler class
// ─────────────────────────────────────────────────────────────────────────────

class SlideShowHandler {
  constructor(domElement, shadowRoot) {
    this.el = domElement;
    this.shadow = shadowRoot;
    this.slides = [];
    this.activeIndex = 0;
    this.activeProjectHash = null;
    this.activeProjectName = "";
    this.draggedIndex = null;
    this.currentDropIndex = null;
    this.autoScrollInterval = null;
    this.resizeObserver = null;
  }

  // ── Mount DOM ──────────────────────────────────────────────────────────────

  mount() {
    this.el.innerHTML = `
      <div class="header">
        <span class="header-title">🎞 SlideShow</span>
        <span class="project-badge" id="project-badge">No project loaded</span>
        <button class="icon-btn" id="btn-fullscreen" title="Fullscreen">⛶</button>
      </div>
      <div class="presentation">
        <div class="left-panel">
          <div class="thumbnails" id="thumbnails"></div>
          <div class="toolbar">
            <button class="icon-btn" id="btn-add"    title="Add slide">＋</button>
            <button class="icon-btn danger" id="btn-del" title="Delete slide">🗑</button>
            <button class="icon-btn" id="btn-type"   title="Change type">🔄</button>
            <button class="icon-btn" id="btn-edit"   title="Edit data">✎</button>
          </div>
        </div>
        <div class="screen-wrapper" id="screen-wrapper">
          <div class="screen" id="screen"></div>
        </div>
      </div>
      <div class="status-bar" id="status">Ready — open a project from the Project Manager</div>
    `;

    this.thumbnailsEl = this.el.querySelector("#thumbnails");
    this.screenEl = this.el.querySelector("#screen");
    this.screenWrapper = this.el.querySelector("#screen-wrapper");
    this.statusEl = this.el.querySelector("#status");
    this.badgeEl = this.el.querySelector("#project-badge");

    this._bindButtons();
    this._setupResize();
    this._setupDnd();
  }

  // ── Load project ───────────────────────────────────────────────────────────

  async loadProject(projectHash, projectName) {
    this.activeProjectHash = projectHash;
    this.activeProjectName = projectName || projectHash;
    this.badgeEl.textContent = this.activeProjectName;
    this._setStatus("Loading slides…");

    try {
      this.slides = await loadSlidesForProject(projectHash);
      this.activeIndex = 0;
      this._renderSlides();
      this._setStatus(
        `${this.slides.filter((s) => s.type !== "title").length} slide(s) loaded`,
      );
    } catch (e) {
      this._setStatus("Load error: " + e.message);
      console.error("[SlideShowHandler] Load error:", e);
    }
  }

  // ── Persist ────────────────────────────────────────────────────────────────

  async _persist() {
    if (!this.activeProjectHash) return;
    this._setStatus("Saving…");
    try {
      await saveSlides(this.slides, this.activeProjectHash);
      this._setStatus(
        `Saved ✓ — ${this.slides.filter((s) => s.type !== "title").length} slide(s)`,
      );
    } catch (e) {
      this._setStatus("Save error: " + e.message);
      console.error("[SlideShowHandler] Save error:", e);
    }
  }

  // ── onChange factory ───────────────────────────────────────────────────────

  _makeOnChange() {
    return (slideObject, { rerender = false } = {}) => {
      if (rerender) this._renderSlides();
      this._persist();
    };
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  _renderSlides() {
    this.thumbnailsEl.innerHTML = "";

    if (this.slides.length === 0) {
      this.screenEl.innerHTML = `<div class="empty-state"><span>No slides</span><span style="font-size:11px;opacity:0.5;">Click ＋ to add one</span></div>`;
      return;
    }

    this.slides.forEach((slide, i) => {
      const thumb = document.createElement("div");
      thumb.className = "thumbnail" + (i === this.activeIndex ? " active" : "");
      thumb.draggable = true;

      const stage = document.createElement("div");
      stage.className = "thumb-stage";
      stage.appendChild(this._createSlideEl(slide));
      thumb.appendChild(stage);

      thumb.onclick = () => {
        this.activeIndex = i;
        this.thumbnailsEl.querySelector(".active")?.classList.remove("active");
        thumb.classList.add("active");
        this._renderActive();
      };

      this.thumbnailsEl.appendChild(thumb);
    });

    this._renderActive();
    setTimeout(() => this._updateScaling(), 0);
  }

  _renderActive() {
    const slide = this.slides[this.activeIndex];
    if (!slide) return;

    const stage = document.createElement("div");
    stage.className = "stage";
    stage.appendChild(this._createSlideEl(slide));

    this.screenEl.innerHTML = "";
    this.screenEl.appendChild(stage);
    setTimeout(() => this._updateScaling(), 0);

    const isTitle = slide.type === "title";
    this.el.querySelector("#btn-del").hidden = isTitle;
    this.el.querySelector("#btn-type").hidden = isTitle;

    const handler = SlideTypeRegistry.get(slide.type);
    this.el.querySelector("#btn-edit").hidden = !handler?.editModal;
  }

  _createSlideEl(slide) {
    const el = document.createElement("div");
    el.className = "slide";
    ["slide-header", "slide-body", "slide-footer"].forEach((cls) => {
      const d = document.createElement("div");
      d.className = cls;
      el.appendChild(d);
    });
    const handler =
      SlideTypeRegistry.get(slide.type) ?? SlideTypeRegistry.get("text");
    handler.mount(
      el,
      slide,
      this._makeOnChange(),
      this._getUtils(),
      this.activeProjectHash,
    );
    return el;
  }

  // ── Buttons ────────────────────────────────────────────────────────────────

  _bindButtons() {
    // Fullscreen
    this.el.querySelector("#btn-fullscreen").onclick = () => {
      const root = this.shadow;
      const modalId = APP_ID + "-fullscreen";
      if (root.id === modalId) {
        root.id = root.dataset.origId || "";
        root.style.cssText = root.dataset.origStyle || "";
        delete root.dataset.origId;
        delete root.dataset.origStyle;
      } else {
        root.dataset.origId = root.id;
        root.dataset.origStyle = root.style.cssText;
        root.id = modalId;
        Object.assign(root.style, {
          position: "fixed",
          inset: "1vw",
          zIndex: "9999",
          boxShadow: "0 8px 48px rgba(0,0,0,0.9)",
          background: "var(--color-bg, #0c0e13)",
        });
      }
    };

    // Add slide
    this.el.querySelector("#btn-add").onclick = () => {
      if (!this.activeProjectHash) return;
      this.slides.splice(this.activeIndex + 1, 0, {
        slideHash: null,
        type: "text",
        title: "New Slide",
        footer: "",
        depth: this.slides[this.activeIndex]?.depth || 0,
        data: SlideTypeRegistry.get("text").defaultData(),
      });
      this.activeIndex++;
      this._renderSlides();
      this._persist();
    };

    // Delete
    this.el.querySelector("#btn-del").onclick = () => {
      if (!this.activeProjectHash) return;
      if (!confirm("Delete this slide? This cannot be undone.")) return;
      this.slides.splice(this.activeIndex, 1);
      if (this.activeIndex >= this.slides.length)
        this.activeIndex = this.slides.length - 1;
      this._renderSlides();
      this._persist();
    };

    // Change type
    this.el.querySelector("#btn-type").onclick = (e) => {
      this._showTypeDialog(e.currentTarget);
    };

    // Edit data
    this.el.querySelector("#btn-edit").onclick = () => {
      const slide = this.slides[this.activeIndex];
      const handler = SlideTypeRegistry.get(slide.type);
      if (!handler?.editModal) return;
      this._showEditModal(slide, handler);
    };
  }

  _showTypeDialog(target) {
    document.querySelector(".type-dialog")?.remove();
    const slide = this.slides[this.activeIndex];

    const dialog = document.createElement("div");
    dialog.className = "type-dialog";
    dialog.innerHTML =
      `<h1>Slide type</h1>` +
      [...SlideTypeRegistry.keys()]
        .filter((k) => k !== "general" && k !== "title")
        .map(
          (k) =>
            `<label><input type="radio" name="t" value="${k}"${k === slide.type ? " checked" : ""}> ${k}</label>`,
        )
        .join("");
    document.body.appendChild(dialog);

    const position = () => {
      const t = target.getBoundingClientRect();
      const d = dialog.getBoundingClientRect();
      const margin = 8;
      let top = t.bottom + margin;
      let left = t.left;
      if (left + d.width > window.innerWidth) left = t.right - d.width;
      if (top + d.height > window.innerHeight) top = t.top - d.height - margin;
      dialog.style.cssText += `top:${top}px;left:${left}px;`;
    };
    position();

    let destroyed = false;
    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      document.removeEventListener("pointerdown", onDown, true);
      dialog.remove();
    };
    const onDown = (e) => {
      if (!e.composedPath().includes(dialog)) destroy();
    };
    document.addEventListener("pointerdown", onDown, true);

    dialog.addEventListener("change", (e) => {
      if (e.target.name !== "t") return;
      const newType = e.target.value;
      if (newType === slide.type) return;
      slide.type = newType;
      slide.depth = slide.depth || 0;
      slide.data = SlideTypeRegistry.get(newType).defaultData();
      this._renderSlides();
      this._persist();
      destroy();
    });
  }

  _showEditModal(slide, handler) {
    document.getElementById("_ssh-edit-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "_ssh-edit-overlay";
    overlay.className = "edit-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "edit-modal";
    modal.innerHTML = `
      <div class="edit-modal-header">
        <span>Edit — <span style="opacity:0.5;font-weight:400;">${slide.type}</span></span>
        <button style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--text);opacity:0.55;" id="_ssh-edit-close">✕</button>
      </div>
      <div class="edit-modal-body" id="_ssh-edit-body"></div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    handler.editModal(
      modal.querySelector("#_ssh-edit-body"),
      slide,
      this._makeOnChange(),
      this._getUtils(),
    );

    const close = () => overlay.remove();
    modal.querySelector("#_ssh-edit-close").onclick = close;
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", onKey);
      }
    });
  }

  // ── Scaling ────────────────────────────────────────────────────────────────

  _setupResize() {
    this.resizeObserver = new ResizeObserver(() => this._updateScaling());
    this.resizeObserver.observe(this.screenWrapper);
    this.resizeObserver.observe(this.thumbnailsEl);
  }

  _updateScaling() {
    if (this.screenWrapper && this.screenEl) {
      const { width, height } = this.screenWrapper.getBoundingClientRect();
      const scale = Math.min(width / 1600, height / 900);
      Object.assign(this.screenEl.style, {
        width: "1600px",
        height: "900px",
        transform: `scale(${scale})`,
        transformOrigin: "center center",
      });
    }
    this.thumbnailsEl?.querySelectorAll(".thumbnail").forEach((thumb) => {
      const scale = thumb.getBoundingClientRect().width / 1600;
      const stage = thumb.querySelector(".thumb-stage");
      if (stage) {
        stage.style.transform = `scale(${scale})`;
        stage.style.transformOrigin = "top left";
      }
    });
  }

  // ── Drag and Drop (thumbnails) ────────────────────────────────────────────

  _setupDnd() {
    const el = this.thumbnailsEl;

    el.addEventListener("dragstart", (e) => {
      const thumb = e.target.closest(".thumbnail");
      if (!thumb) return;
      this.draggedIndex = [...el.children].indexOf(thumb);
      if (this.draggedIndex === 0) {
        e.preventDefault();
        return;
      }

      const clone = thumb.cloneNode(true);
      Object.assign(clone.style, {
        position: "absolute",
        top: "-9999px",
        opacity: "0.8",
        width: thumb.offsetWidth + "px",
      });
      document.body.appendChild(clone);
      e.dataTransfer.setDragImage(clone, e.offsetX, e.offsetY);
      setTimeout(() => clone.remove(), 0);

      thumb.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    el.addEventListener("dragend", (e) => {
      const thumb = e.target.closest(".thumbnail");
      if (!thumb) return;
      thumb.classList.remove("dragging");
      this._clearAutoScroll();
      [...el.children].forEach((c) => {
        c.style.transition = "";
        c.style.transform = "";
      });
      this.currentDropIndex = null;
    });

    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (this.draggedIndex === null || this.draggedIndex === 0) return;
      this._handleAutoScroll(e.clientY);
      const idx = this._getDropIndex(e.clientY);
      if (idx !== null && idx !== this.currentDropIndex) {
        this.currentDropIndex = idx;
        this._animateThumbs(idx);
      }
    });

    el.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.draggedIndex === null || this.draggedIndex === 0) return;

      const idx = this._getDropIndex(e.clientY);
      if (idx === 0) {
        this.draggedIndex = null;
        this._clearAutoScroll();
        return;
      }

      if (idx !== null && idx !== this.draggedIndex) {
        const insert = idx > this.draggedIndex ? idx - 1 : idx;
        const [moved] = this.slides.splice(this.draggedIndex, 1);
        this.slides.splice(insert, 0, moved);

        if (this.activeIndex === this.draggedIndex) this.activeIndex = insert;
        else if (
          this.draggedIndex < this.activeIndex &&
          insert >= this.activeIndex
        )
          this.activeIndex--;
        else if (
          this.draggedIndex > this.activeIndex &&
          insert <= this.activeIndex
        )
          this.activeIndex++;

        this._renderSlides();
        this._persist();
      }

      this.draggedIndex = null;
      this._clearAutoScroll();
    });
  }

  _getDropIndex(clientY) {
    const thumbs = [...this.thumbnailsEl.children];
    const rect = this.thumbnailsEl.getBoundingClientRect();
    if (clientY < rect.top) return 1;
    for (let i = 0; i < thumbs.length; i++) {
      if (i === this.draggedIndex) continue;
      const box = thumbs[i].getBoundingClientRect();
      if (clientY < box.top + box.height / 2) return i === 0 ? 1 : i;
    }
    return thumbs.length;
  }

  _animateThumbs(dropIndex) {
    const thumbs = [...this.thumbnailsEl.children];
    const dragged = thumbs[this.draggedIndex];
    if (!dragged) return;
    const gap = parseFloat(getComputedStyle(this.thumbnailsEl).gap) || 6;
    const shift = dragged.getBoundingClientRect().height + gap;
    thumbs.forEach((t, i) => {
      if (i === this.draggedIndex || i === 0) return;
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
      t.style.transition = "transform 0.2s ease-out";
      t.style.transform = dir ? `translateY(${dir * shift}px)` : "";
    });
  }

  _handleAutoScroll(clientY) {
    const thr = 80,
      spd = 8;
    const { top, bottom } = this.thumbnailsEl.getBoundingClientRect();
    this._clearAutoScroll();
    const dt = clientY - top,
      db = bottom - clientY;
    if (dt > 0 && dt < thr) {
      const s = spd * (1 - dt / thr);
      this.autoScrollInterval = setInterval(() => {
        if (this.thumbnailsEl.scrollTop > 0) this.thumbnailsEl.scrollTop -= s;
      }, 16);
    } else if (db > 0 && db < thr) {
      const s = spd * (1 - db / thr);
      this.autoScrollInterval = setInterval(() => {
        this.thumbnailsEl.scrollTop += s;
      }, 16);
    }
  }

  _clearAutoScroll() {
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval);
      this.autoScrollInterval = null;
    }
  }

  // ── Status ─────────────────────────────────────────────────────────────────
  _setStatus(msg) {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  // ── Utils passed to slide type handlers ───────────────────────────────────
  _getUtils() {
    return {
      restoreContentWithBreaks: this._restoreContent.bind(this),
      extractContentWithBreaks: this._extractContent.bind(this),
      colorFromIndex: this._colorFromIndex.bind(this),
      fadeHslTowardWhite: this._fadeHsl.bind(this),
    };
  }

  _restoreContent(text) {
    return (text || "")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => `<div>${l}</div>`)
      .join("");
  }

  _extractContent(el) {
    function flatten(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType === Node.ELEMENT_NODE) {
        const t = node.tagName;
        if (t === "IMG") return node.outerHTML;
        if (t === "BR") return "<br>";
        if (["B", "I", "U", "STRONG", "EM"].includes(t))
          return `<${t.toLowerCase()}>${[...node.childNodes].map(flatten).join("")}</${t.toLowerCase()}>`;
        if (t === "DIV") return [...node.childNodes].map(flatten).join("");
        return node.innerHTML;
      }
      return "";
    }
    return [...el.cloneNode(true).childNodes]
      .map(flatten)
      .filter(Boolean)
      .join("\n");
  }

  _colorFromIndex(i) {
    return `hsl(${((i * 137.508) % 360).toFixed(1)}, 65%, 55%)`;
  }

  _fadeHsl(hsl, satFactor = 0.6, lightBoost = 20) {
    return hsl.replace(
      /hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/,
      (_, h, s, l) =>
        `hsl(${h}, ${Math.max(0, Math.min(100, s * satFactor))}%, ${Math.max(0, Math.min(100, +l + lightBoost))}%)`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Responsibility handler
// ─────────────────────────────────────────────────────────────────────────────

let _instance = null;

async function SlideShowRequestHandler(callerApp, callBody) {
  const { type } = callBody;

  if (type === "load_project") {
    const { hash, name } = callBody;
    if (!hash) return { type: "error", status: "Missing 'hash'." };
    if (!_instance)
      return { type: "error", status: "SlideShowHandler not mounted yet." };
    await _instance.loadProject(hash, name);
    return { type: "success", status: "" };
  }

  return { type: "error", status: `Unknown type: '${type}'` };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Entry Point
// ─────────────────────────────────────────────────────────────────────────────

export default async function AppBody() {
  const winResult = await Registry.responsibility_call("DomHandler", APP_ID, {
    type: "division_create",
    options: { title: "SlideShow", icon: "🎞", width: 900, height: 580 },
  });

  if (winResult.type !== "success") {
    console.error("[SlideShowHandler] Window failed:", winResult.status);
    return;
  }

  const { DomElement, ShadowRoot } = winResult.data;

  if (!ShadowRoot.querySelector("style[data-ssh]")) {
    const s = document.createElement("style");
    s.dataset.ssh = "1";
    s.textContent = STYLES;
    ShadowRoot.insertBefore(s, ShadowRoot.firstChild);
  }

  _instance = new SlideShowHandler(DomElement, ShadowRoot);
  _instance.mount();

  Registry.responsibility_create(
    "SlideShowHandler",
    APP_ID,
    SlideShowRequestHandler,
  );

  Registry.responsibility_monitor_create(
    "dbuserfractioning",
    APP_ID,
    async (AppName, CallBody, authorityPromise) => {
      if (AppName === APP_ID) return;
      if (CallBody.type !== "frac_set") return;
      if (CallBody.ref !== "projects") return;
      if (!_instance) return;
      if (!_instance.activeProjectHash) return;
      const allProjects = CallBody.body ?? {};
      try {
        _instance.slides = await loadSlidesForProject(
          _instance.activeProjectHash,
          allProjects,
        );
        _instance._renderSlides();
      } catch (e) {
        console.error("[SlideShowHandler] Monitor reload error:", e);
      }
    },
  );

  const observer = new MutationObserver(() => {
    if (!document.contains(ShadowRoot.host)) {
      console.log("doesnt contain");
      observer.disconnect();
      Registry.responsibility_delete("SlideShowHandler", APP_ID);
      Registry.app_terminate(APP_ID);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  console.log("[SlideShowHandler] Ready.");
}