const app = document.querySelector("#app");
const favoritePackStorageKey = "journal.favoritePackIds";

const state = {
  tab: "create",
  editor: "empty",
  selectedLayer: false,
  drawer: null,
  textEditing: null,
  textToolMode: "font",
  toast: "",
  ratio: "3:4",
  assetDetail: null,
  selectedDetailAssetIds: [],
  selectedInspoImage: null,
  activeAssetCategory: "推荐",
  favoritePackIds: readFavoritePackIds(),
  exportSuccess: false,
  exportBusy: false,
  cutStyle: "straight",
  cutMode: null,
  fragments: [],
  history: {
    undo: [],
    redo: [],
  },
  layers: [
    { id: "layer-paper", type: "paper", x: 28, y: 73, width: 255, height: 259, rotation: 1, variant: "base" },
    { id: "layer-tape-left", type: "tape", x: 32, y: 63, width: 82, height: 26, rotation: -26, variant: "yellow" },
    { id: "layer-tape-right", type: "tape", x: 205, y: 78, width: 82, height: 26, rotation: 14, variant: "sage" },
    { id: "layer-receipt", type: "receipt", x: 44, y: 339, width: 95, height: 58, rotation: 1, variant: "receipt" },
    { id: "layer-text", type: "text", x: 205, y: 350, width: 96, height: 34, rotation: -6, content: "weekend", fontKey: "hand", fontSize: 22, color: "#111111", bg: "none" },
    { id: "layer-stamp", type: "stamp", x: 237, y: 359, width: 38, height: 38, rotation: 0, variant: "date" },
  ],
  layerSeed: 1,
};

const assetCategories = ["最近", "纸张", "票据", "贴纸", "标记", "纹理"];
const assetPageCategories = ["推荐", "收藏", "纸张", "胶带", "票据", "贴纸", "标记", "纹理"];
const tabs = [
  { id: "create", label: "创作", icon: "tab-create" },
  { id: "assets", label: "素材", icon: "tab-assets" },
  { id: "inspo", label: "灵感", icon: "tab-inspo" },
  { id: "mine", label: "我的", icon: "tab-mine" },
];

const tools = [
  { id: "image", label: "图片", icon: "tool-image" },
  { id: "asset", label: "素材", icon: "tool-asset" },
  { id: "tape", label: "胶带", icon: "tool-tape" },
  { id: "text", label: "文字", icon: "tool-text" },
  { id: "cut", label: "剪刀", icon: "tool-cut" },
  { id: "shape", label: "压花", icon: "tool-shape" },
];

const packs = [
  { id: "morning", name: "晨间纸张", tone: "#f3f1ec" },
  { id: "travel", name: "旅途票据", tone: "#eef1f0" },
  { id: "tape", name: "彩色胶带", tone: "#f5f3ee" },
  { id: "mark", name: "手写标记", tone: "#f5f4f1" },
];

const inspoImages = [
  { src: "./imgs/0504fcbe-85ff-410d-bd83-62aef6df720c.png", alt: "手账拼贴灵感图 1", ratio: "1 / 1.16" },
  { src: "./imgs/0a329fb5-f54f-46f3-a758-6bbc3d434153.png", alt: "手账拼贴灵感图 2", ratio: "1 / .9" },
  { src: "./imgs/8777edb9-5cbb-4f2d-9820-a3b9d296933b.png", alt: "手账拼贴灵感图 3", ratio: "1 / 1.28" },
  { src: "./imgs/c8dcf23a-46c3-409e-b13b-b807a174b011.png", alt: "手账拼贴灵感图 4", ratio: "1 / 1.05" },
  { src: "./imgs/abdf1ad4-13cf-4808-bc5f-880f9169c500.png", alt: "手账拼贴灵感图 5", ratio: "1 / .86" },
  { src: "./imgs/a580c073-0e92-4145-ae68-2ab6f113dfa5.png", alt: "手账拼贴灵感图 6", ratio: "1 / 1.22" },
  { src: "./imgs/9f6c82fd-2646-4ca3-80ad-21c6f9df4f83.png", alt: "手账拼贴灵感图 7", ratio: "1 / 1" },
];

const detailAssets = [
  {
    id: "paper-small",
    label: "纸片",
    markup: "",
    className: "asset-piece",
    style: "left:72px;top:224px;width:76px;height:94px;--rot:-7deg",
    previewClass: "asset-piece",
    previewStyle: "--rot:-7deg",
    layer: { type: "asset", variant: "paper-fill", width: 76, height: 94, rotation: -7 },
  },
  {
    id: "paper-tall",
    label: "长纸片",
    markup: "",
    className: "asset-piece",
    style: "right:64px;top:200px;width:78px;height:105px;--rot:5deg",
    previewClass: "asset-piece",
    previewStyle: "--rot:5deg",
    layer: { type: "asset", variant: "paper-fill", width: 78, height: 105, rotation: 5 },
  },
  {
    id: "dot-mark",
    label: "圆点标记",
    markup: "·",
    className: "circle-mark",
    style: "right:48px;top:126px;width:45px;height:45px;background:#f5ecda",
    previewClass: "circle-mark",
    previewStyle: "background:#f5ecda",
    previewMarkup: "·",
    layer: { type: "asset", variant: "dot", width: 54, height: 54, rotation: 0 },
  },
  {
    id: "frame-card",
    label: "边框卡",
    markup: "",
    className: "",
    style: "right:70px;top:360px;width:92px;height:112px;background:#fff;border:1px solid var(--ink);border-radius:8px;transform:rotate(-2deg)",
    previewClass: "detail-frame-preview",
    previewStyle: "transform:rotate(-2deg)",
    layer: { type: "asset", variant: "frame", width: 92, height: 112, rotation: -2 },
  },
  {
    id: "receipt",
    label: "票据",
    markup: "07<br />···",
    className: "receipt",
    style: "left:72px;bottom:150px;transform:rotate(3deg)",
    previewClass: "receipt",
    previewMarkup: "07<br />···",
    layer: { type: "receipt", variant: "receipt", width: 95, height: 58, rotation: 3, content: "07<br />···" },
  },
  {
    id: "mono-line",
    label: "手绘线",
    markup: "",
    className: "mono-line",
    style: "right:94px;bottom:112px;box-shadow:none",
    previewClass: "mono-line",
    layer: { type: "asset", variant: "line", width: 78, height: 42, rotation: -10 },
  },
];

const layerActions = [
  ["cut", "tool-cut", "剪切"],
  ["copy", "line-copy", "复制"],
  ["delete", "line-delete", "删除"],
  ["tray", "share-save", "收纳"],
  ["up", "line-up", "上移"],
  ["down", "line-down", "下移"],
  ["shadow", "line-shadow", "阴影"],
  ["opacity", "line-opacity", "透明度"],
  ["corner", "line-corner", "圆角"],
  ["tear", "line-tear", "撕边"],
];

const shareActions = [
  ["share-story", "快拍"],
  ["share-feed", "动态"],
  ["share-link", "复制链接"],
];

const textFonts = [
  { id: "system", label: "系统", family: "system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" },
  { id: "hand", label: "手写", family: "'Bradley Hand', 'Segoe Print', cursive" },
  { id: "mono", label: "打字机", family: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  { id: "serif", label: "衬线", family: "Georgia, 'Times New Roman', serif" },
  { id: "round", label: "圆体", family: "'Trebuchet MS', 'Microsoft YaHei', sans-serif" },
];

const textColors = [
  ["#111111", "墨黑"],
  ["#4a4a4a", "深灰"],
  ["#9a9a9a", "浅灰"],
  ["#ffffff", "白色"],
  ["#d94a38", "印章红"],
  ["#e9d28a", "胶带黄"],
  ["#8c9a8d", "鼠尾草"],
];

const textBackgrounds = [
  ["none", "无"],
  ["paper", "纸底"],
  ["white", "白底"],
  ["black", "黑底"],
  ["tape", "胶带"],
];

const textStyleTools = [
  ["font", "Tt", "字体"],
  ["color", "◒", "颜色"],
  ["size", "A", "大小"],
  ["background", "▣", "底色"],
  ["opacity", "▦", "透明"],
];

let suppressCanvasClick = false;
let lastTextTap = { id: null, time: 0 };
let lastFocusedTextEditKey = 0;
const maxHistoryItems = 60;

function svg(content, className = "svg-icon", viewBox = "0 0 32 32") {
  return `<svg class="${className}" viewBox="${viewBox}" aria-hidden="true" focusable="false">${content}</svg>`;
}

function renderIcon(name) {
  const line = (content, viewBox = "0 0 24 24") => svg(content, "svg-icon line-icon", viewBox);
  const soft = (content) => svg(content, "svg-icon soft-icon");
  const icons = {
    "tool-image": soft(`
      <rect x="6" y="8" width="20" height="17" rx="4" fill="#fff" stroke="#171717" stroke-width="1.4"/>
      <rect x="9" y="11" width="14" height="11" rx="2.5" fill="#f2f1ed"/>
      <circle cx="13" cy="14" r="1.8" fill="#8d9b8e"/>
      <path d="M10.5 20.5l4.2-4 2.7 2.6 2-1.8 2.6 3.2" fill="none" stroke="#171717" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
    `),
    "tool-asset": soft(`
      <rect x="9" y="6" width="14" height="18" rx="2.8" fill="#fff" stroke="#171717" stroke-width="1.3" transform="rotate(5 16 15)"/>
      <rect x="6.5" y="10" width="13" height="15" rx="2.4" fill="#efe7d8" stroke="#171717" stroke-width="1.2" transform="rotate(-7 13 17.5)"/>
      <path d="M10 15h6M10 18h5" stroke="#6f6f6f" stroke-width="1.1" stroke-linecap="round"/>
    `),
    "tool-tape": soft(`
      <circle cx="16" cy="16" r="9" fill="#f3df99" stroke="#171717" stroke-width="1.3"/>
      <circle cx="16" cy="16" r="4" fill="#fff" stroke="#171717" stroke-width="1.2"/>
      <path d="M22 15.5h5v6h-7.2" fill="#ead48a" stroke="#171717" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M25.2 15.5v6" stroke="#fff6cd" stroke-width="1.1"/>
    `),
    "tool-text": soft(`
      <rect x="7" y="8" width="18" height="17" rx="4" fill="#fff" stroke="#171717" stroke-width="1.3"/>
      <path d="M11 14v-2h10v2M16 12v9M13.5 21h5" stroke="#171717" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    `),
    "tool-cut": soft(`
      <circle cx="10" cy="22" r="3.2" fill="#fff" stroke="#171717" stroke-width="1.4"/>
      <circle cx="19.5" cy="22" r="3.2" fill="#fff" stroke="#171717" stroke-width="1.4"/>
      <path d="M12.6 20.1L24 8M17 19.8L8 8" stroke="#171717" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M18 15l5.5 6" stroke="#8d9b8e" stroke-width="1.5" stroke-linecap="round"/>
    `),
    "tool-shape": soft(`
      <rect x="7" y="14" width="10" height="10" rx="2.4" fill="#fff" stroke="#171717" stroke-width="1.3"/>
      <circle cx="20.5" cy="11.5" r="5" fill="#f2f1ed" stroke="#171717" stroke-width="1.3"/>
      <path d="M19 22l4-6 4 6z" fill="#efe7d8" stroke="#171717" stroke-width="1.2" stroke-linejoin="round"/>
    `),
    "tab-create": line(`<path d="M5 18.5l3.8-.8L18.5 8a2.1 2.1 0 0 0-3-3L5.8 14.7 5 18.5z"/><path d="M13.8 6.2l4 4"/>`),
    "tab-assets": line(`<rect x="5" y="6" width="6" height="6" rx="1.5"/><rect x="13" y="6" width="6" height="6" rx="1.5"/><rect x="5" y="14" width="6" height="6" rx="1.5"/><rect x="13" y="14" width="6" height="6" rx="1.5"/>`),
    "tab-inspo": line(`<path d="M12 4l1.7 5.1L19 11l-5.3 1.9L12 18l-1.7-5.1L5 11l5.3-1.9L12 4z"/>`),
    "tab-mine": line(`<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>`),
    "line-back": line(`<path d="M15 6l-6 6 6 6"/>`),
    "line-undo": line(`<path d="M9 8H5v-4"/><path d="M5.5 8.5a7 7 0 1 1 1.8 7"/>`),
    "line-redo": line(`<path d="M15 8h4v-4"/><path d="M18.5 8.5a7 7 0 1 0-1.8 7"/>`),
    "line-star": line(`<path d="M12 4l2.4 5 5.4.8-3.9 3.8.9 5.4-4.8-2.6L7.2 19l.9-5.4-3.9-3.8 5.4-.8L12 4z"/>`),
    "solid-star": line(`<path d="M12 4l2.4 5 5.4.8-3.9 3.8.9 5.4-4.8-2.6L7.2 19l.9-5.4-3.9-3.8 5.4-.8L12 4z" fill="currentColor" stroke="currentColor"/>`),
    "line-search": line(`<circle cx="11" cy="11" r="5.5"/><path d="M16 16l4 4"/>`),
    "line-copy": line(`<rect x="8" y="8" width="10" height="10" rx="2"/><path d="M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"/>`),
    "line-delete": line(`<path d="M5 7h14"/><path d="M9 7V5h6v2"/><path d="M8 10v8M12 10v8M16 10v8"/><path d="M7 7l1 14h8l1-14"/>`),
    "line-up": line(`<path d="M12 5v14"/><path d="M7 10l5-5 5 5"/>`),
    "line-down": line(`<path d="M12 5v14"/><path d="M7 14l5 5 5-5"/>`),
    "line-shadow": line(`<rect x="6" y="6" width="10" height="10" rx="2"/><path d="M10 18h8V10"/>`),
    "line-opacity": line(`<path d="M12 4s6 6.3 6 10a6 6 0 0 1-12 0c0-3.7 6-10 6-10z"/><path d="M12 20V7"/>`),
    "line-corner": line(`<path d="M7 17V9a2 2 0 0 1 2-2h8"/><path d="M17 7v10H7"/>`),
    "line-tear": line(`<path d="M5 8c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M5 15c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2"/>`),
    "share-story": line(`<path d="M12 5v14"/><path d="M7 10l5-5 5 5"/><path d="M6 19h12"/>`),
    "share-feed": line(`<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M8.5 13l2.5-2.5 2 2 2.5-3 3 3.5"/>`),
    "share-save": line(`<path d="M6 5h10l2 2v12H6z"/><path d="M9 5v5h6V5"/><path d="M9 17h6"/>`),
    "share-link": line(`<path d="M9.5 14.5l5-5"/><path d="M10 8.5l1-1a4 4 0 0 1 5.7 5.7l-1 1"/><path d="M14 15.5l-1 1a4 4 0 0 1-5.7-5.7l1-1"/>`),
    "status-signal": line(`<path d="M4 16h2M8 13h2M12 10h2M16 7h2"/>`),
    "status-wifi": line(`<path d="M5 10a10 10 0 0 1 14 0"/><path d="M8 13a6 6 0 0 1 8 0"/><path d="M11.2 16.2a1.2 1.2 0 0 1 1.6 0"/>`),
    "status-battery": line(`<rect x="4" y="8" width="14" height="8" rx="2"/><path d="M20 11v2"/><path d="M7 11h7"/>`),
  };
  return icons[name] || "";
}

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function readFavoritePackIds() {
  try {
    const value = window.localStorage.getItem(favoritePackStorageKey);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

function writeFavoritePackIds(favoritePackIds) {
  try {
    window.localStorage.setItem(favoritePackStorageKey, JSON.stringify(favoritePackIds));
  } catch {
    // The prototype can still work without persisted storage.
  }
}

function cloneCanvasValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function captureCanvasSnapshot() {
  return {
    layers: cloneCanvasValue(state.layers),
    fragments: cloneCanvasValue(state.fragments),
    layerSeed: state.layerSeed,
    ratio: state.ratio,
    selectedLayer: state.selectedLayer,
  };
}

function snapshotsMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function recordCanvasHistory(beforeSnapshot) {
  const afterSnapshot = captureCanvasSnapshot();
  if (snapshotsMatch(beforeSnapshot, afterSnapshot)) return false;
  state.history.undo.push(beforeSnapshot);
  if (state.history.undo.length > maxHistoryItems) state.history.undo.shift();
  state.history.redo = [];
  return true;
}

function restoreCanvasSnapshot(snapshot) {
  const selectedLayer = snapshot.selectedLayer === "photo" || snapshot.layers.some((layer) => layer.id === snapshot.selectedLayer)
    ? snapshot.selectedLayer
    : false;
  state.layers = cloneCanvasValue(snapshot.layers);
  state.fragments = cloneCanvasValue(snapshot.fragments);
  state.layerSeed = snapshot.layerSeed;
  state.ratio = snapshot.ratio;
  setState({
    tab: "create",
    editor: "edit",
    selectedLayer,
    drawer: null,
    textEditing: null,
    cutMode: null,
    assetDetail: null,
    exportSuccess: false,
  });
}

function undoCanvas() {
  if (!state.history.undo.length) return;
  const current = captureCanvasSnapshot();
  const previous = state.history.undo.pop();
  state.history.redo.push(current);
  restoreCanvasSnapshot(previous);
}

function redoCanvas() {
  if (!state.history.redo.length) return;
  const current = captureCanvasSnapshot();
  const next = state.history.redo.pop();
  state.history.undo.push(current);
  if (state.history.undo.length > maxHistoryItems) state.history.undo.shift();
  restoreCanvasSnapshot(next);
}

function showToast(message) {
  setState({ toast: message });
  window.setTimeout(() => {
    if (state.toast === message) setState({ toast: "" });
  }, 1600);
}

function render() {
  app.innerHTML = `
    ${renderScreen()}
    ${state.drawer && !state.textEditing && !["cut", "shape"].includes(state.drawer) ? renderDrawer(state.drawer) : ""}
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
    <div class="home-indicator"></div>
  `;
  bindEvents();
  focusTextInput();
}

function renderScreen() {
  if (state.tab === "assets") return renderAssetsScreen();
  if (state.tab === "inspo") return renderInspoScreen();
  if (state.tab === "mine") return renderMineScreen();
  if (state.tab === "export") return renderExportScreen();
  if (state.assetDetail) return renderAssetDetail();
  return renderCreateScreen();
}

function renderStatusBar() {
  return `
    <div class="status-bar">
      <div>9:41</div>
      <div class="status-icons">
        ${renderIcon("status-signal")}
        ${renderIcon("status-wifi")}
        ${renderIcon("status-battery")}
      </div>
    </div>
  `;
}

function renderCreateScreen() {
  return `
    <section class="screen ${state.editor === "empty" ? "empty-mode" : "editor-mode"}">
      ${renderStatusBar()}
      ${
        state.editor === "empty"
          ? renderEmptyCreate()
          : renderEditor()
      }
      ${
        state.editor === "empty"
          ? ""
          : state.textEditing
            ? renderTextEditorPanel()
            : state.selectedLayer && !state.cutMode
            ? renderLayerToolbar()
            : renderMainToolbar(getActiveTool())
      }
      ${["cut", "shape"].includes(state.drawer) && !state.selectedLayer && !state.textEditing && !state.cutMode ? renderToolPalette(state.drawer) : ""}
      ${state.editor === "empty" ? renderTabbar() : ""}
    </section>
  `;
}

function renderEmptyCreate() {
  return `
    <div class="content">
      <div class="top-row">
        <h1 class="page-title">新拼贴</h1>
        <div class="ratio-tabs">
          ${["3:4", "1:1", "9:16"].map((r) => `<button class="${state.ratio === r ? "active" : ""}" data-ratio="${r}">${r}</button>`).join("")}
        </div>
      </div>
      <div class="workspace">
        <div class="starter-panel">
          <button class="upload-zone" data-action="add-photo">
            <div class="upload-content">
              <div class="round-action">+</div>
              <div class="primary-label">添加照片</div>
              <div class="helper">从相册选择，开始你的拼贴</div>
            </div>
          </button>
        </div>
        <button class="material-start" data-tab="assets">
          <span class="quick-icon">${renderIcon("tab-inspo")}</span>
          <span><strong>从素材包开始</strong></span>
          <span class="material-arrow">›</span>
        </button>
        <div class="section-head"><span>最近草稿</span><button data-tab="mine">查看全部</button></div>
        <div class="draft-row">
          ${renderDraft("flowers", "-1deg")}
          ${renderDraft("forest", "1deg")}
          ${renderDraft("coffee", "-1deg")}
        </div>
      </div>
    </div>
  `;
}

function renderDraft(kind, rot) {
  return `<button class="draft-thumb" style="--rot:${rot}" data-action="open-draft"><span class="draft-art ${kind}" aria-hidden="true"></span></button>`;
}

function renderEditor() {
  return `
    <div class="editor-topbar">
      <button class="icon-button" data-action="back-empty" aria-label="返回">${renderIcon("line-back")}</button>
      <button class="ratio-pill" data-drawer="ratio">${state.ratio}</button>
      <div class="top-actions">
        <button class="icon-button ${!state.textEditing && state.history.undo.length ? "" : "disabled"}" data-action="undo" aria-label="撤销" ${!state.textEditing && state.history.undo.length ? "" : "disabled"}>${renderIcon("line-undo")}</button>
        <button class="icon-button ${!state.textEditing && state.history.redo.length ? "" : "disabled"}" data-action="redo" aria-label="重做" ${!state.textEditing && state.history.redo.length ? "" : "disabled"}>${renderIcon("line-redo")}</button>
        <button class="export-button" data-action="export">导出</button>
      </div>
    </div>
    <div class="canvas-stage" data-action="deselect-canvas">
      ${renderCanvas(state.selectedLayer)}
    </div>
    ${!state.cutMode ? renderFloatingFragmentTray() : ""}
  `;
}

function renderCanvas(selected = false, scaleClass = "") {
  const backgroundLayers = state.layers.filter((layer) => layer.type === "paper");
  const foregroundLayers = state.layers.filter((layer) => layer.type !== "paper");
  return `
    <div class="collage-canvas ${scaleClass}" data-action="deselect-canvas">
      ${backgroundLayers.map(renderCanvasLayer).join("")}
      <button class="photo-layer ${selected === "photo" ? "selected" : ""}" data-action="select-layer" aria-label="选择照片图层">
        <span class="camera-art photo-fill" aria-hidden="true"><span class="camera-body"></span><span class="camera-lens"></span></span>
        ${selected === "photo" ? `
          <span class="rotate-line"></span>
          <span class="control rotate"></span>
          <span class="control tl"></span><span class="control tr"></span>
          <span class="control bl"></span><span class="control br"></span>
        ` : ""}
      </button>
      ${foregroundLayers.map(renderCanvasLayer).join("")}
      ${renderCutOverlay()}
    </div>
  `;
}

function renderCanvasLayer(layer) {
  const selected = state.selectedLayer === layer.id;
  const nudge = layer.cutNudge ? ` translate(${layer.cutNudge.x}px, ${layer.cutNudge.y}px)` : "";
  const clipStyle = layer.clipPath ? `clip-path:${layer.clipPath};` : "";
  const style = `left:${layer.x}px;top:${layer.y}px;width:${layer.width}px;height:${layer.height}px;transform:rotate(${layer.rotation}deg)${nudge};opacity:${layer.opacity ?? 1};${layer.radius ? `border-radius:${layer.radius}px;` : ""}${clipStyle}${layer.type === "text" ? renderTextLayerStyle(layer) : ""}`;
  const cutClass = layer.cutPiece ? `cut-piece cut-${layer.cutStyle || "straight"} cut-${layer.cutEdge || "none"}` : "";
  const visualClass = getLayerVisualClass(layer);
  if (layer.type === "paper") {
    return `<div class="canvas-layer ${layer.type}-layer layer-${layer.variant || layer.type}" style="${style}" aria-hidden="true"></div>`;
  }
  return `
    <button class="canvas-layer ${visualClass} ${cutClass} ${layer.shadow ? "has-shadow" : ""} ${layer.tear ? "has-tear" : ""} ${layer.justCut ? "just-cut" : ""} ${selected ? "selected" : ""}"
      ${layer.fragmentId ? `data-fragment-id="${layer.fragmentId}"` : ""}
      style="${style}"
      data-layer-id="${layer.id}"
      aria-label="选择${getLayerName(layer)}图层">
      ${renderLayerContent(layer)}
      ${selected && !state.cutMode ? renderLayerControls(layer.id) : ""}
    </button>
  `;
}

function renderLayerContent(layer) {
  if (layer.cutPiece) {
    const baseStyle = `width:${layer.sourceWidth}px;height:${layer.sourceHeight}px;transform:translate(${-layer.sourceOffsetX}px, ${-layer.sourceOffsetY}px);`;
    return `<span class="cut-piece-source" style="${baseStyle}">${renderLayerInnerContent(layer)}</span>`;
  }
  return renderLayerInnerContent(layer);
}

function renderLayerInnerContent(layer) {
  if (layer.type === "paper") return "";
  if (layer.type === "tape") return "";
  if (layer.type === "receipt") return layer.content || "07 · 06<br />· · · · ·";
  if (layer.type === "text") return `<span class="text-layer-content ${layer.bg && layer.bg !== "none" ? `text-bg-${layer.bg}` : ""}">${escapeHtml(layer.content || "写点什么...")}</span>`;
  if (layer.type === "stamp") return "07<br />26";
  if (layer.type === "asset") return `<span class="asset-layer-mark ${layer.variant || "paper"}"></span>`;
  return "";
}

function getLayerVisualClass(layer) {
  return `${layer.type}-layer layer-${layer.variant || layer.type}`;
}

function renderTextLayerStyle(layer) {
  const font = textFonts.find((item) => item.id === layer.fontKey) || textFonts[0];
  return `font-family:${font.family};font-size:${layer.fontSize || 28}px;color:${layer.color || "#111111"};`;
}

function renderLayerControls(layerId) {
  return `
    <span class="layer-rotate-line"></span>
    <span class="layer-control rotate" data-transform="rotate" data-layer-id="${layerId}"></span>
    <span class="layer-control resize br" data-transform="resize" data-layer-id="${layerId}"></span>
  `;
}

function getLayerName(layer) {
  const names = { paper: "纸张", tape: "胶带", receipt: "票据", text: "文字", stamp: "印章", asset: "素材" };
  return names[layer.type] || "素材";
}

function renderMainToolbar(active) {
  if (state.editor !== "empty" && state.selectedLayer) return "";
  return `
    <nav class="main-toolbar" aria-label="主工具栏">
      ${tools.map((tool) => `
        <button class="tool ${active === tool.id ? "active" : ""}" data-tool="${tool.id}">
          <span class="tool-icon">${renderIcon(tool.icon)}</span>
          <span>${tool.label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function getActiveTool() {
  return ["image", "asset", "tape", "text", "cut", "shape"].includes(state.drawer)
    ? state.drawer
    : null;
}

function renderLayerToolbar() {
  const selected = getSelectedLayer();
  return `
    <div class="layer-toolbar">
      <div class="layer-head">
        <span>${selected ? getLayerName(selected) : "照片"}图层</span>
        ${selected?.type === "text" ? `<button data-action="edit-selected-text">编辑文字</button>` : ""}
      </div>
      <div class="layer-actions">
        ${layerActions.map(([id, icon, label]) => `<button data-effect="${id}"><span class="la-icon">${renderIcon(icon)}</span><span>${label}</span></button>`).join("")}
      </div>
    </div>
  `;
}

function renderCutOverlay() {
  if (!state.cutMode) return "";
  const layer = state.cutMode.layerId ? state.layers.find((item) => item.id === state.cutMode.layerId) : null;
  const guideStyle = layer
    ? `left:${layer.x}px;top:${layer.y}px;width:${layer.width}px;height:${layer.height}px;transform:rotate(${layer.rotation}deg);`
    : "";
  return `
    <div class="cut-target-guide" style="${guideStyle}" aria-hidden="true"></div>
    <svg class="cut-path-overlay" viewBox="0 0 324 432" aria-hidden="true">
      <path data-cut-path d="${pointsToPath(state.cutMode.points || [])}"></path>
    </svg>
  `;
}

function getCutStyleName(style) {
  const names = { straight: "直边", scallop: "花边", tear: "撕边" };
  return names[style] || names.straight;
}

function renderFragmentTray() {
  if (!state.fragments.length) return "";
  return `
    <div class="fragment-tray" aria-label="碎片托盘">
      <span>碎片托盘</span>
      <div class="fragment-list">
        ${state.fragments.map((fragment) => `
          <button data-action="restore-fragment" data-fragment-id="${fragment.fragmentId}" aria-label="放回${fragment.name}">
            <i class="fragment-chip ${fragment.type}"></i>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderFloatingFragmentTray() {
  if (!state.fragments.length) return "";
  return `<div class="floating-fragment-tray">${renderFragmentTray()}</div>`;
}

function renderTextEditorPanel() {
  const layer = getSelectedLayer();
  if (!layer || layer.type !== "text") return "";
  const activeMode = state.textToolMode || "font";
  return `
    <section class="text-editor-panel" aria-label="文字编辑面板">
      <div class="local-panel-head">
        <button data-action="cancel-text-edit">取消</button>
        <span>文字</span>
        <button data-action="commit-text-edit">完成</button>
      </div>
      <textarea class="keyboard-input-proxy" data-text-input rows="2" maxlength="60" aria-label="输入文字">${escapeTextarea(layer.content || "")}</textarea>
      ${renderTextOptionRow(layer, activeMode)}
      <div class="text-style-row" aria-label="文字样式工具">
        ${textStyleTools.map(([id, icon, label]) => `
          <button class="${activeMode === id ? "active" : ""}" data-text-mode="${id}" aria-label="${label}">
            <span>${icon}</span>
            <small>${label}</small>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderTextOptionRow(layer, mode) {
  if (mode === "font") {
    return `
      <div class="text-option-row font-strip" aria-label="字体">
        ${textFonts.map((font) => `
          <button class="${(layer.fontKey || "system") === font.id ? "active" : ""}" data-text-font="${font.id}" style="font-family:${font.family}">
            ${font.label}
          </button>
        `).join("")}
      </div>
    `;
  }
  if (mode === "color") {
    return `
      <div class="text-option-row swatch-row" aria-label="文字颜色">
        ${textColors.map(([color, label]) => `
          <button class="swatch ${normalizeColor(layer.color || "#111111") === normalizeColor(color) ? "active" : ""}" data-text-color="${color}" aria-label="${label}" style="--swatch:${color}"></button>
        `).join("")}
      </div>
    `;
  }
  if (mode === "size") {
    return `
      <div class="text-option-row text-control-row">
        <span>大小</span>
        <input type="range" min="14" max="44" value="${layer.fontSize || 28}" data-text-size aria-label="文字大小" />
        <strong>${layer.fontSize || 28}</strong>
      </div>
    `;
  }
  if (mode === "background") {
    return `
      <div class="text-option-row background-strip" aria-label="文字底色">
        ${textBackgrounds.map(([id, label]) => `
          <button class="${(layer.bg || "none") === id ? "active" : ""}" data-text-bg="${id}">${label}</button>
        `).join("")}
      </div>
    `;
  }
  if (mode === "opacity") {
    return `
      <div class="text-option-row text-control-row">
        <span>透明</span>
        <input type="range" min="30" max="100" value="${Math.round((layer.opacity ?? 1) * 100)}" data-text-opacity aria-label="文字透明度" />
        <strong>${Math.round((layer.opacity ?? 1) * 100)}%</strong>
      </div>
    `;
  }
  return "";
}

function getSelectedLayer() {
  return state.layers.find((layer) => layer.id === state.selectedLayer) || null;
}

function addCanvasLayer(source = "asset", detail = {}) {
  const beforeSnapshot = captureCanvasSnapshot();
  const next = state.layerSeed + 1;
  const isTape = source === "tape";
  const isShape = source === "shape";
  const isCut = source === "cut";
  const type = isTape ? "tape" : "asset";
  const variants = ["paper", "stripe", "circle", "line", "sage"];
  const layer = {
    id: `layer-user-${next}`,
    type,
    x: 78 + (next % 4) * 22,
    y: 126 + (next % 3) * 36,
    width: isTape ? 92 : isShape ? 58 : isCut ? 72 : 66,
    height: isTape ? 28 : isShape ? 58 : isCut ? 42 : 76,
    rotation: isTape ? (next % 2 ? -12 : 9) : (next % 2 ? -5 : 4),
    variant: detail.variant || detail.shape || detail.cut || (isTape ? (next % 2 ? "yellow" : "sage") : variants[next % variants.length]),
  };
  state.layers.push(layer);
  state.layerSeed = next;
  recordCanvasHistory(beforeSnapshot);
  setState({ tab: "create", editor: "edit", drawer: null, selectedLayer: false, assetDetail: null });
}

function addTextLayer() {
  const beforeSnapshot = captureCanvasSnapshot();
  const next = state.layerSeed + 1;
  const layer = {
    id: `layer-user-${next}`,
    type: "text",
    x: 90,
    y: 192,
    width: 150,
    height: 46,
    rotation: -2,
    content: "写点什么...",
    fontKey: "system",
    fontSize: 28,
    color: "#111111",
    bg: "none",
  };
  state.layers.push(layer);
  state.layerSeed = next;
  startTextEditing(layer.id, true, beforeSnapshot);
}

function renderToolPalette(type) {
  if (type === "shape") {
    return `
      <div class="tool-palette shape-palette" aria-label="压花选项">
        ${[
          ["circle", "圆形"],
          ["heart", "心形"],
          ["star", "星形"],
          ["tag", "标签"],
        ].map(([id, title], index) => `
          <button class="palette-tool ${index === 0 ? "active" : ""}" data-action="add-asset" data-shape="${id}" aria-label="${title}">
            <span class="emboss-3d ${id}"></span>
          </button>
        `).join("")}
      </div>
    `;
  }
  if (type !== "cut") return "";
  return `
    <div class="tool-palette cut-palette" aria-label="剪刀选项">
      ${[
        ["straight", "直边"],
        ["scallop", "花边"],
        ["tear", "撕边"],
      ].map(([id, title], index) => `
        <button class="palette-tool ${(state.cutStyle || "straight") === id ? "active" : ""}" data-action="select-cut-style" data-cut-style="${id}" aria-label="${title}">
          <span class="cut-3d ${id}"></span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderTabbar() {
  return `
    <nav class="tabbar" aria-label="一级导航">
      ${tabs.map((tab) => `
        <button class="tab ${state.tab === tab.id ? "active" : ""}" data-tab="${tab.id}">
          <span class="tab-icon">${renderIcon(tab.icon)}</span>
          <span>${tab.label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function renderDrawer(type) {
  return `
    <div class="drawer-backdrop" data-action="close-drawer"></div>
    <aside class="drawer" aria-label="${type} 面板">
      <div class="drawer-handle"></div>
      ${drawerContent(type)}
    </aside>
  `;
}

function drawerContent(type) {
  if (type === "image") return renderImageActionSheet();
  if (type === "asset") return renderAssetDrawer();
  if (type === "ratio") return renderRatioDrawer();
  if (type === "text") return renderTextDrawer();
  if (type === "tape") return renderTapeDrawer();
  if (type === "effect") return renderOptionDrawer("图层效果", ["无", "轻", "中", "重"], "完成");
  return "";
}

function renderImageActionSheet() {
  return `
    <div class="ios-action-sheet">
      <button data-action="choose-album">从相册选择图片</button>
      <button data-action="take-photo">拍照</button>
    </div>
    <button class="ios-cancel" data-action="close-drawer">取消</button>
  `;
}

function renderAssetDrawer() {
  return `
    <div class="drawer-title-row"><h2>素材</h2><button class="link-button" data-tab="assets">查看全部</button></div>
    <div class="chip-row">${assetCategories.map((c, i) => `<button class="chip ${i === 0 ? "active" : ""}">${c}</button>`).join("")}</div>
    <div class="asset-grid">
      ${renderAssetTiles()}
    </div>
  `;
}

function renderAssetTiles() {
  return [
    `<div class="asset-piece" style="--rot:-3deg"></div>`,
    `<div class="asset-piece stripe"></div>`,
    `<div class="receipt" style="position:static; transform:none; box-shadow:none;">01<br />···</div>`,
    `<div class="asset-piece circle-mark">·</div>`,
    `<div class="mono-line"></div>`,
    `<div class="asset-piece sage-stripe"></div>`,
    `<div class="asset-piece" style="--rot:2deg;background:#fff"></div>`,
    `<div class="tape" style="position:static; transform:rotate(4deg); background:rgba(141,155,142,.8)"></div>`,
  ].map((item) => `<button class="asset-tile" data-action="add-asset">${item}</button>`).join("");
}

function renderRatioDrawer() {
  return `
    <div class="drawer-title-row"><h2>选择比例</h2><button class="link-button" data-action="close-drawer">完成</button></div>
    <div class="chip-row">
      ${["3:4", "1:1", "9:16"].map((r) => `<button class="chip ${state.ratio === r ? "active" : ""}" data-ratio="${r}">${r}</button>`).join("")}
    </div>
    <p class="helper">切换比例后，画布内容会自动居中适配。</p>
  `;
}

function renderTextDrawer() {
  return `
    <div class="drawer-title-row"><h2>文字</h2><button class="link-button" data-action="add-text">添加</button></div>
    <div class="starter-panel" style="height:auto; padding:16px; box-shadow:none; border:1px solid var(--border)">
      <div class="primary-label">写点什么...</div>
      <div class="helper">添加后在画布中直接输入，底部调整字体、颜色和底色。</div>
    </div>
    <div class="chip-row" style="margin-top:14px">
      ${["系统", "手写", "衬线", "圆体"].map((x, i) => `<button class="chip ${i === 0 ? "active" : ""}">${x}</button>`).join("")}
    </div>
  `;
}

function renderTapeDrawer() {
  return `
    <div class="drawer-title-row"><h2>胶带</h2></div>
    <div class="asset-grid">
      ${["#ead48a", "#8d9b8e", "#c7b29a", "#1f1f1f", "#e8e1d6", "#f1d4c8", "#d7dbc9", "#c4c8ce"].map((color, i) => `
        <button class="asset-tile" data-action="add-asset"><div class="tape" style="position:static;background:${color};transform:rotate(${i % 2 ? 8 : -8}deg)"></div></button>
      `).join("")}
    </div>
  `;
}

function renderOptionDrawer(title, options, actionLabel) {
  return `
    <div class="drawer-title-row"><h2>${title}</h2><button class="link-button" data-action="close-drawer">${actionLabel}</button></div>
    <div class="chip-row">${options.map((o, i) => `<button class="chip ${i === 0 ? "active" : ""}">${o}</button>`).join("")}</div>
    <div class="empty-note">选择后将在画布中实时预览</div>
  `;
}

function renderAssetsScreen() {
  const visiblePacks = state.activeAssetCategory === "收藏"
    ? packs.filter((pack) => state.favoritePackIds.includes(pack.id))
    : packs;
  return `
    <section class="screen">
      ${renderStatusBar()}
      <div class="top-row"><h1 class="page-title" style="font-size:24px">素材包</h1></div>
      <div class="sheet-page">
        <div class="category-tabs">${assetPageCategories.map((category) => `<button class="${state.activeAssetCategory === category ? "active" : ""}" data-asset-category="${category}">${category}</button>`).join("")}</div>
        ${visiblePacks.length ? `
          <div class="pack-grid">
            ${visiblePacks.map((pack, i) => renderPackCard(pack, i)).join("")}
          </div>
        ` : `<div class="empty-note">还没有收藏的素材包</div>`}
      </div>
      ${renderTabbar()}
    </section>
  `;
}

function renderSmallAssets() {
  return [
    `<div class="asset-piece stripe" style="width:38px;height:38px"></div>`,
    `<div class="asset-piece" style="width:36px;height:36px"></div>`,
    `<div class="asset-piece circle-mark" style="width:36px;height:36px">·</div>`,
    `<div class="receipt" style="position:static;width:36px;height:42px;transform:none;box-shadow:none;font-size:9px;padding-top:6px">01<br/>···</div>`,
    `<div class="mono-line" style="width:34px"></div>`,
  ].map((x) => `<button class="small-asset">${x}</button>`).join("");
}

function renderPackCard(pack, index) {
  const isFavorite = state.favoritePackIds.includes(pack.id);
  return `
    <button class="pack-card" style="background:${pack.tone}" data-pack="${pack.id}">
      ${isFavorite ? `<span class="pack-favorite-mark">${renderIcon("solid-star")}</span>` : ""}
      <div class="pack-scatter">
        <div class="paper-mini a" style="--rot:${index % 2 ? 7 : -8}deg"></div>
        <div class="paper-mini b" style="--rot:${index % 2 ? -4 : 5}deg"></div>
        ${index === 1 ? `<div class="paper-mini c" style="--rot:2deg"></div><div class="mono-line" style="position:absolute;left:88px;top:92px"></div>` : ""}
        ${index === 2 ? `<div class="tape-mini"></div><div class="tape-mini" style="left:74px;top:62px;background:rgba(141,155,142,.8);transform:rotate(12deg)"></div>` : `<div class="tape-mini"></div>`}
        ${index === 3 ? `<div class="circle-mark" style="position:absolute;right:38px;top:82px;width:30px;height:30px">·</div>` : ""}
      </div>
    </button>
  `;
}

function renderAssetDetail() {
  const pack = packs.find((p) => p.id === state.assetDetail) || packs[0];
  const isFavorite = state.favoritePackIds.includes(pack.id);
  const selectedDetailAssets = detailAssets.filter((asset) => state.selectedDetailAssetIds.includes(asset.id));
  return `
    <section class="screen">
      ${renderStatusBar()}
      <div class="editor-topbar">
        <button class="icon-button" data-action="close-detail" aria-label="返回">${renderIcon("line-back")}</button>
        <div class="page-title" style="font-size:14px">${pack.name}</div>
        <button class="icon-button favorite-button" data-action="toggle-favorite-pack" aria-label="${isFavorite ? "取消收藏" : "收藏"}">${renderIcon(isFavorite ? "solid-star" : "line-star")}</button>
      </div>
      <div class="detail-paper">
        <div class="floating-piece" style="left:44px;top:88px;width:96px;height:34px;background:#eee9df;transform:rotate(-4deg);display:grid;place-items:center;">晨间</div>
        <div class="tape floating-piece" style="left:140px;top:70px;transform:rotate(-10deg)"></div>
        ${detailAssets.map(renderDetailAssetButton).join("")}
        <div class="tape floating-piece" style="right:42px;top:392px;background:rgba(141,155,142,.8);transform:rotate(8deg)"></div>
        ${selectedDetailAssets.length ? renderSelectedDetailAssets(selectedDetailAssets) : ""}
        <button class="add-to-canvas ${selectedDetailAssets.length ? "" : "disabled"}" data-action="add-selected-asset" ${selectedDetailAssets.length ? "" : "disabled"}>添加到画布</button>
      </div>
    </section>
  `;
}

function renderDetailAssetButton(asset) {
  const selected = state.selectedDetailAssetIds.includes(asset.id);
  return `
    <button class="${asset.className} floating-piece ${selected ? "selected" : ""}" style="${asset.style}" data-action="select-detail-asset" data-detail-asset="${asset.id}" aria-label="选择${asset.label}">
      ${asset.markup}
    </button>
  `;
}

function renderSelectedDetailAssets(selectedDetailAssets) {
  return `
    <div class="selected-asset-tray">
      ${selectedDetailAssets.map((asset) => `
        <span class="selected-asset-chip">
          ${renderSelectedDetailAssetPreview(asset)}
          <button data-action="remove-detail-asset" data-detail-asset="${asset.id}" aria-label="移除${asset.label}">×</button>
        </span>
      `).join("")}
    </div>
  `;
}

function renderSelectedDetailAssetPreview(asset) {
  return `
    <span class="selected-asset-preview" aria-hidden="true">
      <span class="${asset.previewClass || asset.className}" style="${asset.previewStyle || ""}">
        ${asset.previewMarkup ?? asset.markup}
      </span>
    </span>
  `;
}

function renderInspoScreen() {
  const selectedImage = inspoImages[state.selectedInspoImage];
  return `
    <section class="screen">
      ${renderStatusBar()}
      <div class="top-row inspo-top-row">
        <h1 class="page-title" style="font-size:24px">灵感</h1>
      </div>
      <div class="inspo-list" aria-label="灵感图瀑布流">
        ${inspoImages.map((item, index) => `
          <button class="inspo-card" data-action="open-inspo-image" data-inspo-index="${index}" style="--ratio:${item.ratio}" aria-label="查看${item.alt}">
            <img src="${item.src}" alt="${item.alt}" loading="lazy" />
          </button>
        `).join("")}
      </div>
      ${selectedImage ? renderInspoPreview(selectedImage) : ""}
      ${renderTabbar()}
    </section>
  `;
}

function renderInspoPreview(item) {
  return `
    <div class="inspo-preview" data-action="close-inspo-image" role="dialog" aria-modal="true" aria-label="灵感大图预览">
      <div class="inspo-preview-panel">
        <button class="inspo-preview-close" data-action="close-inspo-image" aria-label="关闭">×</button>
        <img src="${item.src}" alt="${item.alt}" />
      </div>
    </div>
  `;
}

function renderMineScreen() {
  return `
    <section class="screen">
      ${renderStatusBar()}
      <div class="top-row"><h1 class="page-title" style="font-size:24px">我的</h1></div>
      <div class="sheet-page">
        <div class="section-head" style="margin-top:8px"><span>最近草稿</span></div>
        <div class="draft-row">
          ${renderDraft("flowers", "-1deg")}
          ${renderDraft("coffee", "1deg")}
        </div>
        <div class="section-head"><span>设置</span></div>
        <div class="settings-card">
          <div class="settings-copy">
            <h3>清理缓存</h3>
            <p>释放临时素材和导出文件</p>
          </div>
          <button class="settings-action" data-action="clear-cache" aria-label="清理缓存">${renderIcon("line-delete")}</button>
        </div>
      </div>
      ${renderTabbar()}
    </section>
  `;
}

function renderExportScreen() {
  const exportButtonLabel = state.exportBusy
    ? "保存中..."
    : state.exportSuccess
      ? "已保存到相册"
      : "保存到相册";
  return `
    <section class="screen">
      ${renderStatusBar()}
      <div class="editor-topbar">
        <button class="icon-button" data-action="back-editor" aria-label="返回">${renderIcon("line-back")}</button>
        <div class="page-title" style="font-size:15px">导出预览</div>
        <span></span>
      </div>
      <div class="export-preview">
        <div class="preview-wrap">${renderCanvas(false)}</div>
        <button class="full-button" data-action="export-download" ${state.exportBusy ? "disabled" : ""}>${exportButtonLabel}</button>
        <div class="section-head" style="margin:0"><span>分享到</span></div>
        <div class="share-row">
          ${shareActions.map(([icon, label]) => `<button class="share-button"><span class="share-icon">${renderIcon(icon)}</span>${label}</button>`).join("")}
        </div>
      </div>
    </section>
  `;
}

function bindEvents() {
  app.querySelectorAll("[data-tab]").forEach((el) => {
    el.addEventListener("click", () => setState({ tab: el.dataset.tab, drawer: null, assetDetail: null, selectedLayer: false, selectedInspoImage: null }));
  });
  app.querySelectorAll("[data-ratio]").forEach((el) => {
    el.addEventListener("click", () => {
      if (state.editor === "empty") {
        setState({ ratio: el.dataset.ratio });
        return;
      }
      const beforeSnapshot = captureCanvasSnapshot();
      state.ratio = el.dataset.ratio;
      recordCanvasHistory(beforeSnapshot);
      setState({});
    });
  });
  app.querySelectorAll("[data-tool]").forEach((el) => {
    el.addEventListener("click", () => {
      const tool = el.dataset.tool;
      if (tool === "image") setState({ drawer: "image", selectedLayer: false });
      if (tool === "asset") setState({ drawer: "asset" });
      if (tool === "tape") setState({ drawer: "tape" });
      if (tool === "text") addTextLayer();
      if (tool === "cut") setState({ drawer: "cut", selectedLayer: false, cutMode: null });
      if (tool === "shape") setState({ drawer: "shape" });
    });
  });
  app.querySelectorAll("[data-drawer]").forEach((el) => {
    el.addEventListener("click", () => setState({ drawer: el.dataset.drawer }));
  });
  app.querySelectorAll("[data-effect]").forEach((el) => {
    el.addEventListener("click", () => applyLayerAction(el.dataset.effect));
  });
  app.querySelectorAll("[data-text-font]").forEach((el) => {
    el.addEventListener("click", () => updateTextLayer({ fontKey: el.dataset.textFont }));
  });
  app.querySelectorAll("[data-text-mode]").forEach((el) => {
    el.addEventListener("click", () => setState({ textToolMode: el.dataset.textMode }));
  });
  app.querySelectorAll("[data-text-color]").forEach((el) => {
    el.addEventListener("click", () => updateTextLayer({ color: el.dataset.textColor }));
  });
  app.querySelectorAll("[data-text-bg]").forEach((el) => {
    el.addEventListener("click", () => updateTextLayer({ bg: el.dataset.textBg }));
  });
  app.querySelectorAll("[data-text-size]").forEach((el) => {
    el.addEventListener("input", () => updateTextLayer({ fontSize: Number(el.value) }));
  });
  app.querySelectorAll("[data-text-opacity]").forEach((el) => {
    el.addEventListener("input", () => updateTextLayer({ opacity: Number(el.value) / 100 }));
  });
  app.querySelectorAll("[data-text-input]").forEach((el) => {
    el.addEventListener("input", () => updateTextLayer({ content: el.value }, false));
  });
  app.querySelectorAll("[data-pack]").forEach((el) => {
    el.addEventListener("click", () => setState({ assetDetail: el.dataset.pack, selectedDetailAssetIds: [], tab: "create", drawer: null }));
  });
  app.querySelectorAll("[data-asset-category]").forEach((el) => {
    el.addEventListener("click", () => setState({ activeAssetCategory: el.dataset.assetCategory }));
  });
  app.querySelectorAll("[data-transform]").forEach((el) => {
    el.addEventListener("pointerdown", handleTransformPointerDown);
  });
  app.querySelectorAll(".canvas-layer[data-layer-id]").forEach((el) => {
    el.addEventListener("pointerdown", handleLayerPointerDown);
  });
  app.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", (event) => {
      if (suppressCanvasClick) {
        suppressCanvasClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (el.dataset.action === "deselect-canvas" && event.target !== el) return;
      if (el.dataset.action === "close-inspo-image" && event.target !== el) return;
      handleAction(el.dataset.action, el);
    });
  });
}

function handleAction(action, el) {
  if (action === "undo") {
    undoCanvas();
    return;
  }
  if (action === "redo") {
    redoCanvas();
    return;
  }
  if (action === "add-photo" || action === "open-draft") {
    setState({ tab: "create", editor: "edit", selectedLayer: false, drawer: null, assetDetail: null });
  }
  if (action === "open-inspo-image") {
    setState({ selectedInspoImage: Number(el?.dataset.inspoIndex) });
    return;
  }
  if (action === "close-inspo-image") {
    setState({ selectedInspoImage: null });
    return;
  }
  if (action === "choose-album" || action === "take-photo") {
    setState({ tab: "create", editor: "edit", selectedLayer: false, drawer: null, assetDetail: null });
    showToast(action === "choose-album" ? "已选择图片" : "已拍照添加");
  }
  if (action === "clear-cache") {
    showToast("缓存已清理");
    return;
  }
  if (action === "select-layer") setState({ selectedLayer: "photo", drawer: null });
  if (action === "deselect") setState({ selectedLayer: false });
  if (action === "deselect-canvas") {
    if (state.textEditing) return;
    if (state.cutMode) return;
    setState({ selectedLayer: false, drawer: null });
  }
  if (action === "back-empty") setState({ editor: "empty", selectedLayer: false });
  if (action === "close-drawer") setState({ drawer: null });
  if (action === "select-cut-style") {
    setState({ cutStyle: el?.dataset.cutStyle || "straight", drawer: "cut", selectedLayer: false });
  }
  if (action === "add-asset") {
    const source = state.drawer === "tape" ? "tape" : state.drawer === "cut" ? "cut" : state.drawer === "shape" ? "shape" : "asset";
    addCanvasLayer(source, { cut: el?.dataset.cut, shape: el?.dataset.shape });
  }
  if (action === "add-text") {
    addTextLayer();
  }
  if (action === "cancel-text-edit") cancelTextEditing();
  if (action === "commit-text-edit") commitTextEditing();
  if (action === "edit-selected-text") {
    const layer = getSelectedLayer();
    if (layer?.type === "text") startTextEditing(layer.id, false);
  }
  if (action === "export") setState({ tab: "export", drawer: null, selectedLayer: false, exportSuccess: false });
  if (action === "back-editor") setState({ tab: "create", editor: "edit", exportSuccess: false, exportBusy: false });
  if (action === "export-download") exportCollage();
  if (action === "close-detail") setState({ tab: "assets", assetDetail: null, selectedDetailAssetIds: [] });
  if (action === "toggle-favorite-pack") {
    toggleFavoritePack(state.assetDetail);
    return;
  }
  if (action === "select-detail-asset") {
    toggleDetailAsset(el?.dataset.detailAsset);
    return;
  }
  if (action === "remove-detail-asset") {
    removeDetailAsset(el?.dataset.detailAsset);
    return;
  }
  if (action === "add-selected-asset") {
    addSelectedDetailAssetsToCanvas();
    return;
  }
  if (action === "cancel-cut") {
    setState({ cutMode: null });
  }
  if (action === "restore-fragment") {
    restoreFragment(el?.dataset.fragmentId);
  }
}

async function exportCollage() {
  if (state.exportBusy) return;
  const canvasNode = app.querySelector(".preview-wrap .collage-canvas");
  if (!canvasNode) {
    showToast("没有可导出的画布");
    return;
  }
  setState({ exportBusy: true, exportSuccess: false });
  try {
    await document.fonts?.ready;
    const blob = await renderCanvasNodeToPng(canvasNode, {
      ratio: state.ratio,
      scale: 1,
    });
    downloadBlob(blob, createExportFileName());
    setState({ exportBusy: false, exportSuccess: true });
    showToast("导出成功");
  } catch (error) {
    console.error(error);
    setState({ exportBusy: false, exportSuccess: false });
    showToast("导出失败，请重试");
  }
}

async function renderCanvasNodeToPng(canvasNode, options) {
  const sourceWidth = 324;
  const sourceHeight = 432;
  const targetSize = getExportSize(options.ratio, options.scale);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  drawCollageToCanvas(sourceCanvas, canvasNode);
  const canvas = document.createElement("canvas");
  canvas.width = targetSize.width;
  canvas.height = targetSize.height;
  const context = canvas.getContext("2d");
  context.fillStyle = getComputedStyle(canvasNode).backgroundColor || "#fdfdfb";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const fitScale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
  const drawWidth = sourceWidth * fitScale;
  const drawHeight = sourceHeight * fitScale;
  context.drawImage(sourceCanvas, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
  return canvasToBlob(canvas);
}

function drawCollageToCanvas(canvas, canvasNode) {
  const context = canvas.getContext("2d");
  drawCanvasPaper(context, canvas.width, canvas.height, getComputedStyle(canvasNode).backgroundColor || "#fdfdfb");
  state.layers.filter((layer) => layer.type === "paper").forEach((layer) => drawExportLayer(context, layer));
  drawExportPhotoLayer(context);
  state.layers.filter((layer) => layer.type !== "paper").forEach((layer) => drawExportLayer(context, layer));
}

function drawCanvasPaper(context, width, height, color) {
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(17, 17, 17, 0.04)";
  for (let x = 0; x < width; x += 10) {
    for (let y = 0; y < height; y += 10) {
      context.beginPath();
      context.arc(x, y, 0.75, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function drawExportPhotoLayer(context) {
  context.save();
  applyLayerTransform(context, { x: 55, y: 49, width: 226, height: 221, rotation: 1.6 });
  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(17, 17, 17, 0.12)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 8;
  context.fillRect(-113, -110.5, 226, 221);
  context.shadowColor = "transparent";
  context.translate(-105, -102.5);
  drawCameraArt(context, 210, 205);
  context.restore();
}

function drawExportLayer(context, layer) {
  context.save();
  context.globalAlpha = layer.opacity ?? 1;
  applyLayerTransform(context, layer);
  if (layer.shadow) {
    context.shadowColor = "rgba(17, 17, 17, 0.16)";
    context.shadowBlur = 20;
    context.shadowOffsetY = 10;
  }
  clipExportLayer(context, layer, layer.width, layer.height);
  if (layer.cutPiece) {
    context.translate(-(layer.sourceOffsetX || 0), -(layer.sourceOffsetY || 0));
    drawExportLayerContent(context, { ...layer, cutPiece: false }, layer.sourceWidth || layer.width, layer.sourceHeight || layer.height);
  } else {
    drawExportLayerContent(context, layer, layer.width, layer.height);
  }
  context.restore();
}

function applyLayerTransform(context, layer) {
  context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
  context.rotate(((layer.rotation || 0) * Math.PI) / 180);
  context.translate(-layer.width / 2, -layer.height / 2);
}

function clipExportLayer(context, layer, width, height) {
  context.beginPath();
  if (layer.clipPath) {
    const points = parseClipPolygon(layer.clipPath);
    if (points.length) {
      points.forEach((point, index) => {
        if (index) context.lineTo(point.x, point.y);
        else context.moveTo(point.x, point.y);
      });
      context.closePath();
    } else {
      roundedRectPath(context, 0, 0, width, height, layer.radius || 0);
    }
  } else if (layer.tear) {
    context.moveTo(0, 0);
    context.lineTo(width, 0);
    context.lineTo(width, height * 0.92);
    context.lineTo(width * 0.94, height);
    context.lineTo(width * 0.84, height * 0.94);
    context.lineTo(width * 0.72, height);
    context.lineTo(width * 0.6, height * 0.93);
    context.lineTo(width * 0.48, height);
    context.lineTo(width * 0.34, height * 0.94);
    context.lineTo(width * 0.22, height);
    context.lineTo(width * 0.1, height * 0.93);
    context.lineTo(0, height);
    context.closePath();
  } else {
    roundedRectPath(context, 0, 0, width, height, layer.radius || 0);
  }
  context.clip();
}

function drawExportLayerContent(context, layer, width, height) {
  if (layer.type === "paper") {
    context.fillStyle = "rgba(239, 231, 216, 0.7)";
    context.fillRect(0, 0, width, height);
    return;
  }
  if (layer.type === "tape") {
    const gradient = context.createLinearGradient(0, 0, width, height);
    const sage = layer.variant === "sage";
    gradient.addColorStop(0, sage ? "rgba(141, 155, 142, 0.82)" : "rgba(239, 214, 137, 0.82)");
    gradient.addColorStop(1, sage ? "rgba(141, 155, 142, 0.54)" : "rgba(232, 196, 104, 0.62)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    return;
  }
  if (layer.type === "receipt") {
    context.fillStyle = "rgba(255, 255, 255, 0.86)";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#242424";
    context.font = "11px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillText("07 · 06", width / 2, 22);
    context.fillText("· · · · ·", width / 2, 39);
    return;
  }
  if (layer.type === "text") {
    drawExportTextLayer(context, layer, width, height);
    return;
  }
  if (layer.type === "stamp") {
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#111111";
    context.font = "9px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillText("07", width / 2, height / 2 - 2);
    context.fillText("26", width / 2, height / 2 + 10);
    return;
  }
  drawExportAssetLayer(context, layer, width, height);
}

function drawExportAssetLayer(context, layer, width, height) {
  context.fillStyle = "#ffffff";
  roundedRectPath(context, 0, 0, width, height, layer.radius || 5);
  context.fill();
  const mark = {
    x: width * 0.13,
    y: height * 0.13,
    width: width * 0.74,
    height: height * 0.74,
  };
  context.save();
  context.translate(mark.x, mark.y);
  drawAssetMark(context, layer.variant || "paper", mark.width, mark.height);
  context.restore();
}

function drawAssetMark(context, variant, width, height) {
  context.fillStyle = variant === "sage" ? "#8d9b8e" : "#efe7d8";
  if (variant === "circle") {
    context.strokeStyle = "#111111";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(width / 2, height / 2, Math.min(width, height) / 2 - 1, 0, Math.PI * 2);
    context.stroke();
    return;
  }
  if (variant === "line") {
    context.strokeStyle = "#52606a";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(width / 2, height * 0.35, width * 0.4, 0.15 * Math.PI, 0.85 * Math.PI);
    context.stroke();
    return;
  }
  if (["heart", "star", "tag"].includes(variant)) {
    context.fillStyle = "#111111";
    roundedRectPath(context, width * 0.2, height * 0.2, width * 0.6, height * 0.6, variant === "tag" ? 5 : 0);
    context.fill();
    return;
  }
  if (variant === "stripe" || variant === "sage") {
    context.fillStyle = variant === "sage" ? "rgba(141, 155, 142, 0.85)" : "rgba(234, 212, 138, 0.85)";
    for (let x = -height; x < width; x += 14) {
      context.save();
      context.translate(x, 0);
      context.rotate(-35 * Math.PI / 180);
      context.fillRect(0, 0, 7, height * 2);
      context.restore();
    }
    return;
  }
  context.fillRect(0, 0, width, height);
}

function drawExportTextLayer(context, layer, width, height) {
  const font = textFonts.find((item) => item.id === layer.fontKey) || textFonts[0];
  const size = layer.fontSize || 28;
  if (layer.bg && layer.bg !== "none") {
    const bgColors = {
      paper: "rgba(239, 231, 216, 0.92)",
      white: "rgba(255, 255, 255, 0.86)",
      black: "#111111",
      tape: "rgba(233, 210, 138, 0.78)",
    };
    context.fillStyle = bgColors[layer.bg] || "transparent";
    roundedRectPath(context, 0, 0, width, height, 5);
    context.fill();
  }
  context.fillStyle = layer.bg === "black" ? "#ffffff" : (layer.color || "#111111");
  context.font = `${size}px ${font.family}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawMultilineText(context, layer.content || "写点什么...", width / 2, height / 2, width - 8, size * 1.15);
}

function drawMultilineText(context, text, x, y, maxWidth, lineHeight) {
  const lines = String(text).split("\n");
  const measured = [];
  lines.forEach((line) => {
    let current = "";
    Array.from(line).forEach((character) => {
      const next = current + character;
      if (current && context.measureText(next).width > maxWidth) {
        measured.push(current);
        current = character;
      } else {
        current = next;
      }
    });
    measured.push(current);
  });
  const startY = y - ((measured.length - 1) * lineHeight) / 2;
  measured.forEach((line, index) => context.fillText(line, x, startY + index * lineHeight));
}

function drawCameraArt(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#f2f3f2");
  gradient.addColorStop(0.55, "#ffffff");
  gradient.addColorStop(1, "#ececea");
  context.fillStyle = gradient;
  roundedRectPath(context, 0, 0, width, height, 4);
  context.fill();
  context.fillStyle = "#111111";
  roundedRectPath(context, width * 0.2, height * 0.28, width * 0.55, height * 0.37, 16);
  context.fill();
  context.fillStyle = "#202224";
  roundedRectPath(context, width * 0.28, height * 0.2, width * 0.25, height * 0.12, 8);
  context.fill();
  const lensGradient = context.createRadialGradient(width * 0.5, height * 0.42, 6, width * 0.5, height * 0.42, 38);
  lensGradient.addColorStop(0, "#38414a");
  lensGradient.addColorStop(0.48, "#0c0d0e");
  lensGradient.addColorStop(1, "#050505");
  context.fillStyle = lensGradient;
  context.beginPath();
  context.arc(width * 0.5, height * 0.42, 38, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(110, 140, 160, 0.42)";
  context.beginPath();
  context.arc(width * 0.51, height * 0.38, 8, 0, Math.PI * 2);
  context.fill();
}

function roundedRectPath(context, x, y, width, height, radius = 0) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function parseClipPolygon(value) {
  const match = String(value).match(/polygon\((.*)\)/);
  if (!match) return [];
  return match[1].split(",").map((pair) => {
    const [x, y] = pair.trim().split(/\s+/);
    return { x: parseFloat(x), y: parseFloat(y) };
  }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法生成 PNG 文件"));
    }, "image/png");
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createExportFileName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `collage-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.png`;
}

function getExportSize(ratio, scale = 1) {
  const base = {
    "1:1": { width: 1080, height: 1080 },
    "9:16": { width: 1080, height: 1920 },
    "3:4": { width: 1080, height: 1440 },
  }[ratio] || { width: 1080, height: 1440 };
  return {
    width: base.width * scale,
    height: base.height * scale,
  };
}

function toggleFavoritePack(packId) {
  if (!packId) return;
  const favoritePackIds = state.favoritePackIds.includes(packId)
    ? state.favoritePackIds.filter((id) => id !== packId)
    : [...state.favoritePackIds, packId];
  writeFavoritePackIds(favoritePackIds);
  setState({ favoritePackIds });
}

function toggleDetailAsset(assetId) {
  if (!assetId) return;
  const selectedDetailAssetIds = state.selectedDetailAssetIds.includes(assetId)
    ? state.selectedDetailAssetIds.filter((id) => id !== assetId)
    : [...state.selectedDetailAssetIds, assetId];
  setState({ selectedDetailAssetIds });
}

function removeDetailAsset(assetId) {
  if (!assetId) return;
  setState({
    selectedDetailAssetIds: state.selectedDetailAssetIds.filter((id) => id !== assetId),
  });
}

function addSelectedDetailAssetsToCanvas() {
  const selectedAssets = detailAssets.filter((asset) => state.selectedDetailAssetIds.includes(asset.id));
  if (!selectedAssets.length) return;
  const beforeSnapshot = captureCanvasSnapshot();
  let next = state.layerSeed;
  selectedAssets.forEach((asset, index) => {
    next += 1;
    const layer = asset.layer || {};
    state.layers.push({
      ...layer,
      id: `layer-user-${next}`,
      type: layer.type || "asset",
      x: 78 + ((next + index) % 4) * 22,
      y: 126 + ((next + index) % 3) * 36,
      width: layer.width || 66,
      height: layer.height || 76,
      rotation: layer.rotation ?? (next % 2 ? -5 : 4),
      variant: layer.variant || "paper",
    });
  });
  state.layerSeed = next;
  recordCanvasHistory(beforeSnapshot);
  setState({ tab: "create", editor: "edit", drawer: null, selectedLayer: false, assetDetail: null, selectedDetailAssetIds: [] });
}

function startTextEditing(layerId, isNew = false, beforeSnapshot = captureCanvasSnapshot()) {
  const layer = state.layers.find((item) => item.id === layerId);
  if (!layer || layer.type !== "text") return;
  setState({
    tab: "create",
    editor: "edit",
    drawer: null,
    selectedLayer: layerId,
    assetDetail: null,
    textEditing: {
      layerId,
      isNew,
      snapshot: { ...layer },
      historySnapshot: beforeSnapshot,
      focusKey: Date.now(),
    },
    textToolMode: "font",
  });
}

function updateTextLayer(patch, rerender = true) {
  const layer = getSelectedLayer();
  if (!state.textEditing || !layer || layer.type !== "text") return;
  Object.assign(layer, patch);
  const size = layer.fontSize || 28;
  layer.width = clamp(Math.max(layer.width, (layer.content || "").length * size * 0.58 + 20), 80, 250);
  layer.height = clamp(Math.ceil((layer.content || "").length / 10) * size * 1.15 + 12, 34, 140);
  if (rerender) {
    setState({});
    return;
  }
  const node = app.querySelector(`[data-layer-id="${layer.id}"]`);
  const content = node?.querySelector(".text-layer-content");
  if (node) {
    node.style.width = `${layer.width}px`;
    node.style.height = `${layer.height}px`;
    node.style.fontSize = `${size}px`;
  }
  if (content) content.textContent = layer.content || "";
}

function cancelTextEditing() {
  if (!state.textEditing) return;
  const { layerId, isNew, snapshot } = state.textEditing;
  const index = state.layers.findIndex((layer) => layer.id === layerId);
  if (index >= 0) {
    if (isNew) {
      state.layers.splice(index, 1);
    } else {
      state.layers[index] = { ...snapshot };
    }
  }
  setState({ textEditing: null, selectedLayer: isNew ? false : layerId, drawer: null });
}

function commitTextEditing() {
  const beforeSnapshot = state.textEditing?.historySnapshot;
  const layer = getSelectedLayer();
  if (layer?.type === "text" && !String(layer.content || "").trim()) {
    const index = state.layers.findIndex((item) => item.id === layer.id);
    if (index >= 0) state.layers.splice(index, 1);
    if (beforeSnapshot) recordCanvasHistory(beforeSnapshot);
    setState({ textEditing: null, selectedLayer: false, drawer: null });
    return;
  }
  if (beforeSnapshot) recordCanvasHistory(beforeSnapshot);
  setState({ textEditing: null, drawer: null });
}

function applyLayerAction(action) {
  const index = state.layers.findIndex((layer) => layer.id === state.selectedLayer);
  if (index < 0) return;
  const layer = state.layers[index];
  if (action === "cut") {
    startCutMode(layer.id);
    return;
  }
  const beforeSnapshot = captureCanvasSnapshot();
  if (action === "copy") {
    const next = state.layerSeed + 1;
    const copy = {
      ...layer,
      id: `layer-user-${next}`,
      x: layer.x + 18,
      y: layer.y + 18,
      rotation: layer.rotation + 2,
    };
    state.layers.splice(index + 1, 0, copy);
    state.layerSeed = next;
    recordCanvasHistory(beforeSnapshot);
    setState({ selectedLayer: copy.id });
    return;
  }
  if (action === "delete") {
    state.layers.splice(index, 1);
    recordCanvasHistory(beforeSnapshot);
    setState({ selectedLayer: false });
    return;
  }
  if (action === "tray") {
    if (!moveSelectedFragmentToTray(beforeSnapshot)) showToast("只有剪下来的碎片可收纳");
    return;
  }
  if (action === "up" || action === "down") {
    if (moveLayerInStack(index, action)) recordCanvasHistory(beforeSnapshot);
    setState({});
    return;
  }
  if (action === "shadow") layer.shadow = !layer.shadow;
  if (action === "opacity") layer.opacity = layer.opacity === 0.58 ? 1 : 0.58;
  if (action === "corner") layer.radius = layer.radius ? 0 : 12;
  if (action === "tear") layer.tear = !layer.tear;
  recordCanvasHistory(beforeSnapshot);
  setState({});
}

function moveLayerInStack(index, direction) {
  const layer = state.layers[index];
  if (!layer || layer.type === "paper") return false;
  const foregroundIndexes = state.layers
    .map((item, itemIndex) => (item.type === "paper" ? null : itemIndex))
    .filter((itemIndex) => itemIndex !== null);
  const currentForegroundIndex = foregroundIndexes.indexOf(index);
  if (currentForegroundIndex < 0) return false;
  const nextForegroundIndex = direction === "up"
    ? currentForegroundIndex + 1
    : currentForegroundIndex - 1;
  if (nextForegroundIndex < 0 || nextForegroundIndex >= foregroundIndexes.length) return false;
  const swapIndex = foregroundIndexes[nextForegroundIndex];
  [state.layers[index], state.layers[swapIndex]] = [state.layers[swapIndex], state.layers[index]];
  return true;
}

function handleLayerPointerDown(event) {
  if (event.target.closest("[data-transform]")) return;
  const id = event.currentTarget.dataset.layerId;
  const layer = state.layers.find((item) => item.id === id);
  if (!layer) return;
  if (state.drawer === "cut" && !state.cutMode) {
    event.preventDefault();
    event.stopPropagation();
    chooseCutTarget(layer);
    return;
  }
  if (state.cutMode) {
    handleCutPointerDown(event);
    return;
  }
  if (state.textEditing) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const now = Date.now();
  if (layer.type === "text" && lastTextTap.id === id && now - lastTextTap.time < 900) {
    event.preventDefault();
    event.stopPropagation();
    lastTextTap = { id: null, time: 0 };
    startTextEditing(id, false);
    return;
  }
  lastTextTap = layer.type === "text" ? { id, time: now } : { id: null, time: 0 };
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  state.selectedLayer = id;
  state.drawer = null;
  app.querySelectorAll(".canvas-layer.selected").forEach((node) => node.classList.remove("selected"));
  event.currentTarget.classList.add("selected");
  render();
  const beforeSnapshot = captureCanvasSnapshot();
  const startX = event.clientX;
  const startY = event.clientY;
  const startLayer = { x: layer.x, y: layer.y };
  const node = app.querySelector(`[data-layer-id="${id}"]`);
  const canvas = node?.closest(".collage-canvas");
  const scale = canvas ? canvas.getBoundingClientRect().width / 324 : 1;
  let didMove = false;
  const move = (moveEvent) => {
    didMove = true;
    layer.x = clamp(startLayer.x + (moveEvent.clientX - startX) / scale, -24, 324 - layer.width + 24);
    layer.y = clamp(startLayer.y + (moveEvent.clientY - startY) / scale, -24, 432 - layer.height + 24);
    if (node) {
      node.style.left = `${layer.x}px`;
      node.style.top = `${layer.y}px`;
    }
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    suppressCanvasClick = didMove;
    if (didMove) recordCanvasHistory(beforeSnapshot);
    render();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function handleTransformPointerDown(event) {
  if (state.cutMode) return;
  event.stopPropagation();
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const id = event.currentTarget.dataset.layerId;
  const mode = event.currentTarget.dataset.transform;
  const layer = state.layers.find((item) => item.id === id);
  const node = app.querySelector(`[data-layer-id="${id}"]`);
  if (!layer || !node) return;
  const canvas = node.closest(".collage-canvas");
  const scale = canvas ? canvas.getBoundingClientRect().width / 324 : 1;
  const rect = node.getBoundingClientRect();
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const start = {
    x: event.clientX,
    y: event.clientY,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    angle: Math.atan2(event.clientY - center.y, event.clientX - center.x),
  };
  const beforeSnapshot = captureCanvasSnapshot();
  let didMove = false;
  const move = (moveEvent) => {
    didMove = true;
    if (mode === "resize") {
      const delta = Math.max(moveEvent.clientX - start.x, moveEvent.clientY - start.y) / scale;
      const ratio = start.height / start.width;
      layer.width = clamp(start.width + delta, 32, 180);
      layer.height = clamp(layer.width * ratio, 24, 180);
    } else {
      const angle = Math.atan2(moveEvent.clientY - center.y, moveEvent.clientX - center.x);
      layer.rotation = start.rotation + ((angle - start.angle) * 180) / Math.PI;
    }
    node.style.width = `${layer.width}px`;
    node.style.height = `${layer.height}px`;
    node.style.transform = `rotate(${layer.rotation}deg)`;
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    suppressCanvasClick = didMove;
    if (didMove) recordCanvasHistory(beforeSnapshot);
    render();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function startCutMode(layerId = state.selectedLayer) {
  const layer = state.layers.find((item) => item.id === layerId);
  if (!layerId || !layer) {
    setState({
      tab: "create",
      editor: "edit",
      drawer: "cut",
      selectedLayer: false,
      cutMode: null,
    });
    return;
  }
  if (!canCutLayer(layer, layerId)) return;
  setState({
    tab: "create",
    editor: "edit",
    drawer: null,
    selectedLayer: layer.id,
    cutMode: { layerId: layer.id, points: [], style: state.cutStyle || "straight" },
  });
}

function chooseCutTarget(layer) {
  if (!canCutLayer(layer, layer.id)) return;
  setState({
    selectedLayer: layer.id,
    drawer: null,
    cutMode: { layerId: layer.id, points: [], style: state.cutStyle || "straight" },
  });
}

function canCutLayer(layer, layerId) {
  if (!layer || layer.type === "paper" || layerId === "photo") {
    showToast("先选中要剪开的素材");
    return false;
  }
  if (layer.type === "text") {
    showToast("文字先转成贴纸后再剪");
    return false;
  }
  if (layer.cutPiece && layer.clipPath) {
    showToast("斜切碎片暂不支持继续剪切");
    return false;
  }
  return true;
}

function handleCutPointerDown(event) {
  const cutMode = state.cutMode;
  if (!cutMode) return;
  const layer = state.layers.find((item) => item.id === cutMode.layerId);
  if (!layer || event.currentTarget.dataset.layerId !== layer.id) return;
  event.preventDefault();
  event.stopPropagation();
  const target = event.currentTarget;
  target.setPointerCapture?.(event.pointerId);
  const canvas = target.closest(".collage-canvas");
  const style = cutMode.style || state.cutStyle || "straight";
  const points = [eventToCanvasPoint(event, canvas)];
  state.cutMode.points = points;
  updateCutPath(points);
  event.currentTarget.classList.add("cutting-active");
  let idleTimer = null;
  const armIdleFinish = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (points.length > 1) up();
    }, 700);
  };
  const move = (moveEvent) => {
    const point = eventToCanvasPoint(moveEvent, canvas);
    const previous = points[points.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 2.5) {
      if (style === "straight") {
        points[1] = point;
      } else {
        points.push(point);
      }
      updateCutPath(points);
      armIdleFinish();
    }
  };
  let completed = false;
  const up = () => {
    if (completed) return;
    completed = true;
    window.clearTimeout(idleTimer);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    window.removeEventListener("mouseup", up);
    window.removeEventListener("touchend", up);
    target.removeEventListener("lostpointercapture", up);
    target.classList.remove("cutting-active");
    splitLayerByCut(layer.id, points);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  window.addEventListener("mouseup", up);
  window.addEventListener("touchend", up);
  target.addEventListener("lostpointercapture", up);
}

function splitLayerByCut(layerId, points) {
  const index = state.layers.findIndex((item) => item.id === layerId);
  const layer = state.layers[index];
  if (!layer || points.length < 2) {
    setState({ cutMode: { ...state.cutMode, points: [] } });
    showToast("剪切线太短");
    return;
  }
  const cut = getCutGeometry(layer, points);
  if (!cut) {
    setState({ cutMode: { ...state.cutMode, points: [] } });
    showToast("剪切线需要穿过素材");
    return;
  }
  const beforeSnapshot = captureCanvasSnapshot();
  const nextSeed = state.layerSeed + 2;
  const [first, second] = createCutPieces(layer, cut, nextSeed - 1, nextSeed);
  state.layers.splice(index, 1, first, second);
  state.layerSeed = nextSeed;
  recordCanvasHistory(beforeSnapshot);
  setState({ cutMode: null, selectedLayer: cut.focus === "first" ? first.id : second.id });
  showToast("已剪成两片");
}

function getCutGeometry(layer, points) {
  const localPoints = points.map((point) => canvasPointToLayerPoint(layer, point));
  const tolerance = 10;
  const inside = localPoints.filter((point) => (
    point.x >= -tolerance &&
    point.x <= layer.width + tolerance &&
    point.y >= -tolerance &&
    point.y <= layer.height + tolerance
  ));
  if (!inside.length) return null;
  const start = localPoints[0];
  const end = localPoints[localPoints.length - 1];
  const localLine = {
    start,
    end,
  };
  if ((state.cutMode?.style || state.cutStyle) === "straight") {
    const polygons = splitRectByLine(layer.width, layer.height, localLine.start, localLine.end);
    if (polygons) {
      return {
        axis: "diagonal",
        line: localLine,
        polygons,
        focus: polygonArea(polygons[0]) <= polygonArea(polygons[1]) ? "first" : "second",
      };
    }
  }
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  if (horizontal) {
    const cutY = clamp(average(inside.map((point) => point.y)), layer.height * 0.12, layer.height * 0.88);
    return {
      axis: "horizontal",
      cut: cutY,
      focus: cutY <= layer.height / 2 ? "first" : "second",
    };
  }
  const cutX = clamp(average(inside.map((point) => point.x)), layer.width * 0.12, layer.width * 0.88);
  return {
    axis: "vertical",
    cut: cutX,
    focus: cutX <= layer.width / 2 ? "first" : "second",
  };
}

function canvasPointToLayerPoint(layer, point) {
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  const angle = -((layer.rotation || 0) * Math.PI) / 180;
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle) + layer.width / 2,
    y: dx * Math.sin(angle) + dy * Math.cos(angle) + layer.height / 2,
  };
}

function createCutPieces(layer, cut, firstSeed, secondSeed) {
  const sourceWidth = layer.sourceWidth || layer.width;
  const sourceHeight = layer.sourceHeight || layer.height;
  const baseOffsetX = layer.sourceOffsetX || 0;
  const baseOffsetY = layer.sourceOffsetY || 0;
  const cutStyle = state.cutMode?.style || state.cutStyle || "straight";
  const cleanLayer = stripTransientCutState(layer);
  const first = {
    ...cleanLayer,
    id: `layer-cut-${firstSeed}`,
    fragmentId: `fragment-${firstSeed}`,
    cutPiece: true,
    cutStyle,
    sourceWidth,
    sourceHeight,
    sourceOffsetX: baseOffsetX,
    sourceOffsetY: baseOffsetY,
  };
  const second = {
    ...cleanLayer,
    id: `layer-cut-${secondSeed}`,
    fragmentId: `fragment-${secondSeed}`,
    cutPiece: true,
    cutStyle,
    sourceWidth,
    sourceHeight,
    sourceOffsetX: baseOffsetX,
    sourceOffsetY: baseOffsetY,
  };
  first.cutNudge = cut.axis === "horizontal" ? { x: -1.5, y: -3 } : { x: -3, y: -1.5 };
  second.cutNudge = cut.axis === "horizontal" ? { x: 1.5, y: 3 } : { x: 3, y: 1.5 };
  if (cut.axis === "diagonal") {
    first.clipPath = polygonToClipPath(cut.polygons[0]);
    second.clipPath = polygonToClipPath(cut.polygons[1]);
    first.cutEdge = "none";
    second.cutEdge = "none";
    const normal = lineNormal(cut.line.start, cut.line.end);
    first.cutNudge = { x: -normal.x * 3, y: -normal.y * 3 };
    second.cutNudge = { x: normal.x * 3, y: normal.y * 3 };
  } else if (cut.axis === "horizontal") {
    first.height = Math.max(18, Math.round(cut.cut));
    second.y = layer.y + first.height;
    second.height = Math.max(18, Math.round(layer.height - first.height));
    first.cutEdge = "bottom";
    second.cutEdge = "top";
    second.sourceOffsetY = baseOffsetY + first.height;
  } else {
    first.width = Math.max(18, Math.round(cut.cut));
    second.x = layer.x + first.width;
    second.width = Math.max(18, Math.round(layer.width - first.width));
    first.cutEdge = "right";
    second.cutEdge = "left";
    second.sourceOffsetX = baseOffsetX + first.width;
  }
  return [first, second].map((piece) => ({
    ...piece,
    justCut: true,
  }));
}

function stripTransientCutState(layer) {
  const {
    clipPath,
    cutEdge,
    cutNudge,
    justCut,
    fragmentId,
    ...cleanLayer
  } = layer;
  return cleanLayer;
}

function splitRectByLine(width, height, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.hypot(dx, dy) < 4) return null;
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const left = [];
  const right = [];
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    const currentSide = lineSide(start, end, current);
    const nextSide = lineSide(start, end, next);
    if (currentSide >= 0) left.push(current);
    if (currentSide <= 0) right.push(current);
    if ((currentSide > 0 && nextSide < 0) || (currentSide < 0 && nextSide > 0)) {
      const intersection = segmentLineIntersection(current, next, start, end);
      if (intersection) {
        left.push(intersection);
        right.push(intersection);
      }
    }
  }
  if (left.length < 3 || right.length < 3) return null;
  return [left, right];
}

function lineSide(start, end, point) {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
}

function segmentLineIntersection(segStart, segEnd, lineStart, lineEnd) {
  const sx = segEnd.x - segStart.x;
  const sy = segEnd.y - segStart.y;
  const lx = lineEnd.x - lineStart.x;
  const ly = lineEnd.y - lineStart.y;
  const denominator = sx * ly - sy * lx;
  if (Math.abs(denominator) < 0.001) return null;
  const t = ((lineStart.x - segStart.x) * ly - (lineStart.y - segStart.y) * lx) / denominator;
  return {
    x: segStart.x + sx * t,
    y: segStart.y + sy * t,
  };
}

function polygonToClipPath(points) {
  return `polygon(${points.map((point) => `${point.x.toFixed(2)}px ${point.y.toFixed(2)}px`).join(",")})`;
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

function lineNormal(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: -dy / length, y: dx / length };
}

function restoreFragment(fragmentId) {
  const index = state.fragments.findIndex((fragment) => fragment.fragmentId === fragmentId);
  if (index < 0) return;
  const beforeSnapshot = captureCanvasSnapshot();
  const [fragment] = state.fragments.splice(index, 1);
  state.layers.push({
    ...fragment.layer,
    x: clamp(fragment.layer.x + 16, -24, 324 - fragment.layer.width + 24),
    y: clamp(fragment.layer.y + 16, -24, 432 - fragment.layer.height + 24),
    cutNudge: null,
  });
  recordCanvasHistory(beforeSnapshot);
  setState({ selectedLayer: fragment.layer.id });
}

function moveSelectedFragmentToTray(beforeSnapshot = captureCanvasSnapshot()) {
  const index = state.layers.findIndex((layer) => layer.id === state.selectedLayer);
  if (index < 0) return false;
  const layer = state.layers[index];
  if (!layer.fragmentId) return false;
  state.layers.splice(index, 1);
  state.fragments.push({
    fragmentId: layer.fragmentId,
    type: layer.type,
    name: getLayerName(layer),
    layer: { ...layer, cutNudge: null },
  });
  recordCanvasHistory(beforeSnapshot);
  setState({ selectedLayer: false });
  showToast("已收进碎片托盘");
  return true;
}

function eventToCanvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / 324;
  return {
    x: clamp((event.clientX - rect.left) / scale, 0, 324),
    y: clamp((event.clientY - rect.top) / scale, 0, 432),
  };
}

function updateCutPath(points) {
  const path = app.querySelector("[data-cut-path]");
  if (path) path.setAttribute("d", pointsToPath(points));
}

function pointsToPath(points) {
  if (!points || !points.length) return "";
  return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function focusTextInput() {
  if (!state.textEditing) return;
  window.setTimeout(() => {
    const input = app.querySelector("[data-text-input]");
    if (!input) return;
    input.focus({ preventScroll: true });
    if (lastFocusedTextEditKey !== state.textEditing.focusKey) {
      input.select();
      lastFocusedTextEditKey = state.textEditing.focusKey;
    }
  }, 0);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeTextarea(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function normalizeColor(color) {
  return String(color).toLowerCase();
}

render();
