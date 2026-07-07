const app = document.querySelector("#app");

const state = {
  tab: "create",
  editor: "empty",
  selectedLayer: false,
  drawer: null,
  textEditing: null,
  toast: "",
  ratio: "3:4",
  assetDetail: null,
  exportSuccess: false,
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

const layerActions = [
  ["copy", "line-copy", "复制"],
  ["delete", "line-delete", "删除"],
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
  ["share-save", "保存"],
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

let suppressCanvasClick = false;
let lastTextTap = { id: null, time: 0 };

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
            : state.selectedLayer
            ? renderLayerToolbar()
            : renderMainToolbar(getActiveTool())
      }
      ${["cut", "shape"].includes(state.drawer) && !state.selectedLayer && !state.textEditing ? renderToolPalette(state.drawer) : ""}
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
          <span><strong>从素材纸包开始</strong></span>
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
        <button class="icon-button" aria-label="撤销">${renderIcon("line-undo")}</button>
        <button class="icon-button disabled" aria-label="重做">${renderIcon("line-redo")}</button>
        <button class="export-button" data-action="export">导出</button>
      </div>
    </div>
    <div class="canvas-stage" data-action="deselect-canvas">
      ${renderCanvas(state.selectedLayer)}
    </div>
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
    </div>
  `;
}

function renderCanvasLayer(layer) {
  const selected = state.selectedLayer === layer.id;
  const style = `left:${layer.x}px;top:${layer.y}px;width:${layer.width}px;height:${layer.height}px;transform:rotate(${layer.rotation}deg);opacity:${layer.opacity ?? 1};${layer.radius ? `border-radius:${layer.radius}px;` : ""}${layer.type === "text" ? renderTextLayerStyle(layer) : ""}`;
  if (layer.type === "paper") {
    return `<div class="canvas-layer ${layer.type}-layer layer-${layer.variant || layer.type}" style="${style}" aria-hidden="true"></div>`;
  }
  return `
    <button class="canvas-layer ${layer.type}-layer layer-${layer.variant || layer.type} ${layer.shadow ? "has-shadow" : ""} ${layer.tear ? "has-tear" : ""} ${selected ? "selected" : ""}"
      style="${style}"
      data-layer-id="${layer.id}"
      aria-label="选择${getLayerName(layer)}图层">
      ${renderLayerContent(layer)}
      ${selected ? renderLayerControls(layer.id) : ""}
    </button>
  `;
}

function renderLayerContent(layer) {
  if (layer.type === "paper") return "";
  if (layer.type === "tape") return "";
  if (layer.type === "receipt") return "07 · 06<br />· · · · ·";
  if (layer.type === "text") return `<span class="text-layer-content ${layer.bg && layer.bg !== "none" ? `text-bg-${layer.bg}` : ""}">${escapeHtml(layer.content || "写点什么...")}</span>`;
  if (layer.type === "stamp") return "07<br />26";
  if (layer.type === "asset") return `<span class="asset-layer-mark ${layer.variant || "paper"}"></span>`;
  return "";
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

function renderTextEditorPanel() {
  const layer = getSelectedLayer();
  if (!layer || layer.type !== "text") return "";
  return `
    <section class="text-editor-panel" aria-label="文字编辑面板">
      <div class="local-panel-head">
        <button data-action="cancel-text-edit">取消</button>
        <span>文字</span>
        <button data-action="commit-text-edit">完成</button>
      </div>
      <textarea class="text-input" data-text-input rows="2" maxlength="60" aria-label="输入文字">${escapeTextarea(layer.content || "")}</textarea>
      <div class="font-strip" aria-label="字体">
        ${textFonts.map((font) => `
          <button class="${(layer.fontKey || "system") === font.id ? "active" : ""}" data-text-font="${font.id}" style="font-family:${font.family}">
            ${font.label}
          </button>
        `).join("")}
      </div>
      <div class="text-control-row">
        <span>大小</span>
        <input type="range" min="14" max="44" value="${layer.fontSize || 28}" data-text-size aria-label="文字大小" />
        <strong>${layer.fontSize || 28}</strong>
      </div>
      <div class="swatch-row" aria-label="文字颜色">
        ${textColors.map(([color, label]) => `
          <button class="swatch ${normalizeColor(layer.color || "#111111") === normalizeColor(color) ? "active" : ""}" data-text-color="${color}" aria-label="${label}" style="--swatch:${color}"></button>
        `).join("")}
      </div>
      <div class="background-strip" aria-label="文字底色">
        ${textBackgrounds.map(([id, label]) => `
          <button class="${(layer.bg || "none") === id ? "active" : ""}" data-text-bg="${id}">${label}</button>
        `).join("")}
      </div>
    </section>
  `;
}

function getSelectedLayer() {
  return state.layers.find((layer) => layer.id === state.selectedLayer) || null;
}

function addCanvasLayer(source = "asset", detail = {}) {
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
  setState({ tab: "create", editor: "edit", drawer: null, selectedLayer: false, assetDetail: null });
}

function addTextLayer() {
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
  startTextEditing(layer.id, true);
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
        <button class="palette-tool ${index === 0 ? "active" : ""}" data-action="add-asset" data-cut="${id}" aria-label="${title}">
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
  return `
    <section class="screen">
      ${renderStatusBar()}
      <div class="top-row"><h1 class="page-title" style="font-size:24px">素材</h1><button class="search-button" aria-label="搜索">${renderIcon("line-search")}</button></div>
      <div class="sheet-page">
        <div class="category-tabs">${["推荐", "纸张", "胶带", "票据", "贴纸", "标记", "纹理", "收藏"].map((c, i) => `<button class="${i === 0 ? "active" : ""}">${c}</button>`).join("")}</div>
        <div class="helper" style="margin:0 0 8px">◷ 最近使用</div>
        <div class="recent-assets">${renderSmallAssets()}</div>
        <div class="section-head" style="margin:0 0 12px"><span>素材纸包</span></div>
        <div class="pack-grid">
          ${packs.map((pack, i) => renderPackCard(pack, i)).join("")}
        </div>
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
  return `
    <button class="pack-card" style="background:${pack.tone}" data-pack="${pack.id}">
      <div class="pack-scatter">
        <div class="paper-mini a" style="--rot:${index % 2 ? 7 : -8}deg"></div>
        <div class="paper-mini b" style="--rot:${index % 2 ? -4 : 5}deg"></div>
        ${index === 1 ? `<div class="paper-mini c" style="--rot:2deg"></div><div class="mono-line" style="position:absolute;left:88px;top:92px"></div>` : ""}
        ${index === 2 ? `<div class="tape-mini"></div><div class="tape-mini" style="left:74px;top:62px;background:rgba(141,155,142,.8);transform:rotate(12deg)"></div>` : `<div class="tape-mini"></div>`}
        ${index === 3 ? `<div class="circle-mark" style="position:absolute;right:38px;top:82px;width:30px;height:30px">·</div>` : ""}
      </div>
      <span class="pack-title">${pack.name}</span>
    </button>
  `;
}

function renderAssetDetail() {
  const pack = packs.find((p) => p.id === state.assetDetail) || packs[0];
  return `
    <section class="screen">
      ${renderStatusBar()}
      <div class="editor-topbar">
        <button class="icon-button" data-action="close-detail" aria-label="返回">${renderIcon("line-back")}</button>
        <div class="page-title" style="font-size:14px">${pack.name}</div>
        <button class="icon-button" aria-label="收藏">${renderIcon("line-star")}</button>
      </div>
      <div class="detail-paper">
        <div class="floating-piece" style="left:44px;top:88px;width:96px;height:34px;background:#eee9df;transform:rotate(-4deg);display:grid;place-items:center;">晨间</div>
        <div class="tape floating-piece" style="left:140px;top:70px;transform:rotate(-10deg)"></div>
        <button class="asset-piece floating-piece selected" style="left:72px;top:224px;width:76px;height:94px;--rot:-7deg" data-action="select-detail-asset"></button>
        <button class="asset-piece floating-piece" style="right:64px;top:200px;width:78px;height:105px;--rot:5deg" data-action="select-detail-asset"></button>
        <button class="floating-piece circle-mark" style="right:48px;top:126px;width:45px;height:45px;background:#f5ecda" data-action="select-detail-asset">·</button>
        <button class="floating-piece" style="right:70px;top:360px;width:92px;height:112px;background:#fff;border:1px solid var(--ink);border-radius:8px;transform:rotate(-2deg)" data-action="select-detail-asset"></button>
        <div class="tape floating-piece" style="right:42px;top:392px;background:rgba(141,155,142,.8);transform:rotate(8deg)"></div>
        <button class="receipt floating-piece" style="left:72px;bottom:150px;transform:rotate(3deg)" data-action="select-detail-asset">07<br />···</button>
        <button class="mono-line floating-piece" style="right:94px;bottom:112px;box-shadow:none" data-action="select-detail-asset"></button>
        <button class="add-to-canvas" data-action="add-selected-asset">✓ 添加到画布</button>
      </div>
    </section>
  `;
}

function renderInspoScreen() {
  const items = [
    ["01", "胶带", "用透明胶压住照片角", "让照片像真的贴在纸上"],
    ["02", "构图", "三张照片斜向叠放", "错位角度制造手作层次"],
    ["03", "标题", "旧纸片做标题底", "撕边纸衬底 + 衬线标题"],
    ["04", "排版", "票据拼一条时间线", "等距排列讲一天的故事"],
    ["05", "材质", "手写标记点缀留白", "一笔墨线让画面呼吸"],
  ];
  return `
    <section class="screen">
      ${renderStatusBar()}
      <div class="top-row"><h1 class="page-title" style="font-size:24px">灵感</h1></div>
      <div class="category-tabs" style="padding:0 20px">${["为你推荐", "旅行", "拍立得", "手账", "极简"].map((c, i) => `<button class="${i === 0 ? "active" : ""}">${c}</button>`).join("")}</div>
      <div class="inspo-list">
        ${items.map(([num, tag, title, desc]) => `
          <button class="technique-card" data-action="start-inspo">
            <div class="demo-thumb"><div class="tape left" style="left:14px;top:20px"></div></div>
            <div><div class="helper" style="margin:0">${num} · ${tag}</div><h3>${title}</h3><p>${desc}</p></div>
            <div>›</div>
          </button>
        `).join("")}
      </div>
      ${renderTabbar()}
    </section>
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
        <div class="section-head"><span>收藏素材</span></div>
        <div class="recent-assets">${renderSmallAssets()}</div>
        <div class="section-head"><span>设置</span></div>
        <button class="technique-card"><div class="demo-thumb icon-demo" style="height:52px;width:52px">${renderIcon("line-delete")}</div><div><h3>清理缓存</h3><p>释放临时素材和导出文件</p></div><div>›</div></button>
      </div>
      ${renderTabbar()}
    </section>
  `;
}

function renderExportScreen() {
  return `
    <section class="screen">
      ${renderStatusBar()}
      <div class="editor-topbar">
        <button class="icon-button" data-action="back-editor" aria-label="返回">${renderIcon("line-back")}</button>
        <div class="page-title" style="font-size:15px">导出预览</div>
        <button class="icon-button" aria-label="收藏">${renderIcon("line-star")}</button>
      </div>
      <div class="export-preview">
        <div class="preview-wrap">${renderCanvas(false)}</div>
        <div class="segmented">${["3:4", "1:1", "9:16", "PNG", "高清"].map((x, i) => `<button class="${i === 0 ? "active" : ""}">${x}</button>`).join("")}</div>
        <div class="section-head" style="margin:0"><span>分享到</span></div>
        <div class="share-row">
          ${shareActions.map(([icon, label]) => `<button class="share-button"><span class="share-icon">${renderIcon(icon)}</span>${label}</button>`).join("")}
        </div>
        <button class="full-button" data-action="export-success">${state.exportSuccess ? "已保存到相册" : "导出并分享"}</button>
      </div>
    </section>
  `;
}

function bindEvents() {
  app.querySelectorAll("[data-tab]").forEach((el) => {
    el.addEventListener("click", () => setState({ tab: el.dataset.tab, drawer: null, assetDetail: null, selectedLayer: false }));
  });
  app.querySelectorAll("[data-ratio]").forEach((el) => {
    el.addEventListener("click", () => setState({ ratio: el.dataset.ratio }));
  });
  app.querySelectorAll("[data-tool]").forEach((el) => {
    el.addEventListener("click", () => {
      const tool = el.dataset.tool;
      if (tool === "image") setState({ drawer: "image", selectedLayer: false });
      if (tool === "asset") setState({ drawer: "asset" });
      if (tool === "tape") setState({ drawer: "tape" });
      if (tool === "text") addTextLayer();
      if (tool === "cut") setState({ drawer: "cut" });
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
  app.querySelectorAll("[data-text-color]").forEach((el) => {
    el.addEventListener("click", () => updateTextLayer({ color: el.dataset.textColor }));
  });
  app.querySelectorAll("[data-text-bg]").forEach((el) => {
    el.addEventListener("click", () => updateTextLayer({ bg: el.dataset.textBg }));
  });
  app.querySelectorAll("[data-text-size]").forEach((el) => {
    el.addEventListener("input", () => updateTextLayer({ fontSize: Number(el.value) }));
  });
  app.querySelectorAll("[data-text-input]").forEach((el) => {
    el.addEventListener("input", () => updateTextLayer({ content: el.value }, false));
  });
  app.querySelectorAll("[data-pack]").forEach((el) => {
    el.addEventListener("click", () => setState({ assetDetail: el.dataset.pack, tab: "create", drawer: null }));
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
      handleAction(el.dataset.action, el);
    });
  });
}

function handleAction(action, el) {
  if (action === "add-photo" || action === "open-draft" || action === "start-inspo") {
    setState({ tab: "create", editor: "edit", selectedLayer: false, drawer: null, assetDetail: null });
  }
  if (action === "choose-album" || action === "take-photo") {
    setState({ tab: "create", editor: "edit", selectedLayer: false, drawer: null, assetDetail: null });
    showToast(action === "choose-album" ? "已选择图片" : "已拍照添加");
  }
  if (action === "select-layer") setState({ selectedLayer: "photo", drawer: null });
  if (action === "deselect") setState({ selectedLayer: false });
  if (action === "deselect-canvas") {
    if (state.textEditing) return;
    setState({ selectedLayer: false, drawer: null });
  }
  if (action === "back-empty") setState({ editor: "empty", selectedLayer: false });
  if (action === "close-drawer") setState({ drawer: null });
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
  if (action === "back-editor") setState({ tab: "create", editor: "edit", exportSuccess: false });
  if (action === "export-success") {
    setState({ exportSuccess: true });
    showToast("导出成功");
  }
  if (action === "close-detail") setState({ tab: "assets", assetDetail: null });
  if (action === "select-detail-asset") showToast("已选中素材");
  if (action === "add-selected-asset") {
    addCanvasLayer("asset", { variant: "paper" });
  }
}

function startTextEditing(layerId, isNew = false) {
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
    },
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
  const layer = getSelectedLayer();
  if (layer?.type === "text" && !String(layer.content || "").trim()) {
    const index = state.layers.findIndex((item) => item.id === layer.id);
    if (index >= 0) state.layers.splice(index, 1);
    setState({ textEditing: null, selectedLayer: false, drawer: null });
    return;
  }
  setState({ textEditing: null, drawer: null });
}

function applyLayerAction(action) {
  const index = state.layers.findIndex((layer) => layer.id === state.selectedLayer);
  if (index < 0) return;
  const layer = state.layers[index];
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
    setState({ selectedLayer: copy.id });
    return;
  }
  if (action === "delete") {
    state.layers.splice(index, 1);
    setState({ selectedLayer: false });
    return;
  }
  if (action === "up" || action === "down") {
    moveLayerInStack(index, action);
    setState({});
    return;
  }
  if (action === "shadow") layer.shadow = !layer.shadow;
  if (action === "opacity") layer.opacity = layer.opacity === 0.58 ? 1 : 0.58;
  if (action === "corner") layer.radius = layer.radius ? 0 : 12;
  if (action === "tear") layer.tear = !layer.tear;
  setState({});
}

function moveLayerInStack(index, direction) {
  const layer = state.layers[index];
  if (!layer || layer.type === "paper") return;
  const foregroundIndexes = state.layers
    .map((item, itemIndex) => (item.type === "paper" ? null : itemIndex))
    .filter((itemIndex) => itemIndex !== null);
  const currentForegroundIndex = foregroundIndexes.indexOf(index);
  if (currentForegroundIndex < 0) return;
  const nextForegroundIndex = direction === "up"
    ? currentForegroundIndex + 1
    : currentForegroundIndex - 1;
  if (nextForegroundIndex < 0 || nextForegroundIndex >= foregroundIndexes.length) return;
  const swapIndex = foregroundIndexes[nextForegroundIndex];
  [state.layers[index], state.layers[swapIndex]] = [state.layers[swapIndex], state.layers[index]];
}

function handleLayerPointerDown(event) {
  if (event.target.closest("[data-transform]")) return;
  const id = event.currentTarget.dataset.layerId;
  const layer = state.layers.find((item) => item.id === id);
  if (!layer) return;
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
    render();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function handleTransformPointerDown(event) {
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
    render();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function focusTextInput() {
  if (!state.textEditing) return;
  window.setTimeout(() => {
    const input = app.querySelector("[data-text-input]");
    input?.focus();
    input?.select();
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
