const els = {
  fileInput: document.querySelector("#fileInput"),
  detectButton: document.querySelector("#detectButton"),
  rembgButton: document.querySelector("#rembgButton"),
  rembgAllButton: document.querySelector("#rembgAllButton"),
  fastSamButton: document.querySelector("#fastSamButton"),
  fastSamAllButton: document.querySelector("#fastSamAllButton"),
  previewMaskButton: document.querySelector("#previewMaskButton"),
  saveButton: document.querySelector("#saveButton"),
  selectAllButton: document.querySelector("#selectAllButton"),
  clearButton: document.querySelector("#clearButton"),
  dropZone: document.querySelector("#dropZone"),
  stagePanel: document.querySelector("#stagePanel"),
  stageCanvas: document.querySelector("#stageCanvas"),
  jobList: document.querySelector("#jobList"),
  spriteGrid: document.querySelector("#spriteGrid"),
  jobCountText: document.querySelector("#jobCountText"),
  countText: document.querySelector("#countText"),
  selectedText: document.querySelector("#selectedText"),
  modeInput: document.querySelector("#modeInput"),
  alphaInput: document.querySelector("#alphaInput"),
  toleranceInput: document.querySelector("#toleranceInput"),
  minAreaInput: document.querySelector("#minAreaInput"),
  mergeGapInput: document.querySelector("#mergeGapInput"),
  fastSamEdgeGrowInput: document.querySelector("#fastSamEdgeGrowInput"),
  localRefineInput: document.querySelector("#localRefineInput"),
  localRefineToleranceInput: document.querySelector("#localRefineToleranceInput"),
  whiteTrimInput: document.querySelector("#whiteTrimInput"),
  paddingInput: document.querySelector("#paddingInput"),
  coverQualityInput: document.querySelector("#coverQualityInput"),
  alphaValue: document.querySelector("#alphaValue"),
  toleranceValue: document.querySelector("#toleranceValue"),
  minAreaValue: document.querySelector("#minAreaValue"),
  mergeGapValue: document.querySelector("#mergeGapValue"),
  fastSamEdgeGrowValue: document.querySelector("#fastSamEdgeGrowValue"),
  localRefineToleranceValue: document.querySelector("#localRefineToleranceValue"),
  whiteTrimValue: document.querySelector("#whiteTrimValue"),
  paddingValue: document.querySelector("#paddingValue"),
  coverQualityValue: document.querySelector("#coverQualityValue")
};

const state = {
  jobs: [],
  activeJobId: null
};

const stageContext = els.stageCanvas.getContext("2d", { willReadFrequently: true });
let detectTimer = 0;

bindEvents();
syncControlLabels();
updateUI();

function bindEvents() {
  els.fileInput.addEventListener("change", () => {
    loadFiles(Array.from(els.fileInput.files || []));
    els.fileInput.value = "";
  });

  els.detectButton.addEventListener("click", () => {
    const job = getActiveJob();
    if (job) detectJob(job);
  });
  els.saveButton.addEventListener("click", saveSelectedSprites);
  els.rembgButton.addEventListener("click", () => {
    const job = getActiveJob();
    if (job) preprocessJobWithRembg(job);
  });
  els.rembgAllButton.addEventListener("click", preprocessAllJobsWithRembg);
  els.fastSamButton.addEventListener("click", () => {
    const job = getActiveJob();
    if (job) segmentJobWithFastSam(job);
  });
  els.fastSamAllButton.addEventListener("click", segmentAllJobsWithFastSam);
  els.previewMaskButton.addEventListener("click", toggleMaskPreview);
  els.selectAllButton.addEventListener("click", () => setAllSelected(true));
  els.clearButton.addEventListener("click", () => setAllSelected(false));
  els.stageCanvas.addEventListener("click", toggleSpriteAtPoint);

  [els.modeInput, els.alphaInput, els.toleranceInput, els.minAreaInput, els.mergeGapInput].forEach((input) => {
    input.addEventListener("input", () => {
      syncControlLabels();
      debounceDetectAll();
    });
  });

  els.fastSamEdgeGrowInput.addEventListener("input", () => {
    syncControlLabels();
    const job = getActiveJob();
    if (job && job.fastSamProcessed) {
      els.fastSamButton.textContent = "重新 FastSAM 分割";
    }
  });

  els.fastSamEdgeGrowInput.addEventListener("change", () => {
    const job = getActiveJob();
    if (job && job.fastSamProcessed) {
      segmentJobWithFastSam(job);
    }
  });

  els.paddingInput.addEventListener("input", () => {
    syncControlLabels();
    state.jobs.forEach((job) => job.renderedCanvases.clear());
    renderActiveJob();
  });

  [els.localRefineInput, els.localRefineToleranceInput, els.whiteTrimInput].forEach((input) => {
    input.addEventListener("input", () => {
      syncControlLabels();
      state.jobs.forEach((job) => job.renderedCanvases.clear());
      renderActiveJob();
    });
  });

  els.coverQualityInput.addEventListener("input", () => {
    syncControlLabels();
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("dragover");
    });
  });

  els.dropZone.addEventListener("drop", (event) => {
    loadFiles(Array.from(event.dataTransfer.files || []));
  });
}

function loadFiles(files) {
  const imageFiles = files.filter((file) => /^image\/(png|jpeg|webp)$/.test(file.type));
  imageFiles.forEach(loadFile);
}

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const job = createJob(file, image);
      state.jobs.push(job);
      state.activeJobId = job.id;
      els.dropZone.classList.add("hidden");
      els.stagePanel.classList.remove("hidden");
      detectJob(job);
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function createJob(file, image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fileName: file.name,
    imageName: sanitizeName(file.name.replace(/\.[^.]+$/, "") || "sprite-sheet"),
    sourceBlob: file,
    processedBlob: null,
    rembgProcessed: false,
    fastSamProcessed: false,
    maskImage: null,
    showMaskPreview: false,
    image,
    imageData: context.getImageData(0, 0, canvas.width, canvas.height),
    maskImageData: null,
    instanceMaskImageData: null,
    labelMap: null,
    sprites: [],
    renderedCanvases: new Map()
  };
}

function debounceDetectAll() {
  window.clearTimeout(detectTimer);
  detectTimer = window.setTimeout(() => {
    state.jobs.forEach(detectJob);
  }, 180);
}

function syncControlLabels() {
  els.alphaValue.value = els.alphaInput.value;
  els.toleranceValue.value = els.toleranceInput.value;
  els.minAreaValue.value = els.minAreaInput.value;
  els.mergeGapValue.value = els.mergeGapInput.value;
  els.fastSamEdgeGrowValue.value = els.fastSamEdgeGrowInput.value;
  els.localRefineToleranceValue.value = els.localRefineToleranceInput.value;
  els.whiteTrimValue.value = els.whiteTrimInput.value;
  els.paddingValue.value = els.paddingInput.value;
  els.coverQualityValue.value = els.coverQualityInput.value;
}

function detectJob(job) {
  const options = getOptions();
  if (job.instanceMaskImageData) {
    const labels = labelInstancesFromImageData(job.instanceMaskImageData, options.minArea);
    job.labelMap = labels.labels;
    job.sprites = labels.components.map((sprite, index) => ({
      ...sprite,
      id: `${job.id}-sprite-${index + 1}`,
      selected: true
    }));
    job.renderedCanvases.clear();
    renderActiveJob();
    return;
  }

  const detectionImageData = job.maskImageData || job.imageData;
  const mask = createForegroundMask(detectionImageData, options);
  const labels = labelComponents(mask, detectionImageData.width, detectionImageData.height, options.minArea);
  job.labelMap = labels.labels;
  job.sprites = mergeComponents(labels.components, options.mergeGap).map((sprite, index) => ({
    ...sprite,
    id: `${job.id}-sprite-${index + 1}`,
    selected: true
  }));
  job.renderedCanvases.clear();
  renderActiveJob();
}

function getOptions() {
  return {
    mode: els.modeInput.value,
    alphaThreshold: Number(els.alphaInput.value),
    tolerance: Number(els.toleranceInput.value),
    minArea: Number(els.minAreaInput.value),
    mergeGap: Number(els.mergeGapInput.value),
    localRefine: els.localRefineInput.checked,
    localRefineTolerance: Number(els.localRefineToleranceInput.value),
    localRefineRadius: Number(els.fastSamEdgeGrowInput.value),
    whiteTrim: Number(els.whiteTrimInput.value),
    padding: Number(els.paddingInput.value),
    coverQuality: Number(els.coverQualityInput.value) / 100
  };
}

function getActiveJob() {
  return state.jobs.find((job) => job.id === state.activeJobId) || null;
}

function renderActiveJob() {
  const job = getActiveJob();
  renderJobList();
  if (!job) {
    updateUI();
    return;
  }
  redrawStage(job);
  renderSpriteGrid(job);
  updateUI();
}

function renderJobList() {
  els.jobList.innerHTML = "";
  els.jobList.classList.toggle("empty", state.jobs.length === 0);
  if (!state.jobs.length) {
    const empty = document.createElement("span");
    empty.textContent = "还没有图片。";
    els.jobList.append(empty);
    return;
  }

  state.jobs.forEach((job, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `job-item${job.id === state.activeJobId ? " active" : ""}`;
    const badges = [
      job.rembgProcessed ? "AI" : "",
      job.fastSamProcessed ? "SAM" : ""
    ].filter(Boolean).join(" · ");
    item.innerHTML = `
      <span>${index + 1}. ${escapeHtml(job.fileName)}${badges ? ` · ${badges}` : ""}</span>
      <strong>${job.sprites.filter((sprite) => sprite.selected).length}/${job.sprites.length}</strong>
    `;
    item.addEventListener("click", () => {
      state.activeJobId = job.id;
      renderActiveJob();
    });
    els.jobList.append(item);
  });
}

function redrawStage(job) {
  els.stageCanvas.width = job.image.naturalWidth;
  els.stageCanvas.height = job.image.naturalHeight;
  stageContext.clearRect(0, 0, els.stageCanvas.width, els.stageCanvas.height);
  stageContext.drawImage(job.showMaskPreview && job.maskImage ? job.maskImage : job.image, 0, 0);
  stageContext.lineWidth = Math.max(2, Math.round(Math.min(els.stageCanvas.width, els.stageCanvas.height) / 500));
  stageContext.font = `${Math.max(12, stageContext.lineWidth * 6)}px Inter, Arial, sans-serif`;

  job.sprites.forEach((sprite, index) => {
    const selected = sprite.selected;
    stageContext.strokeStyle = selected ? "#2f7d6d" : "#a64b45";
    stageContext.fillStyle = selected ? "rgba(47, 125, 109, 0.12)" : "rgba(166, 75, 69, 0.12)";
    const width = sprite.maxX - sprite.minX + 1;
    const height = sprite.maxY - sprite.minY + 1;
    stageContext.fillRect(sprite.minX, sprite.minY, width, height);
    stageContext.strokeRect(sprite.minX, sprite.minY, width, height);
    stageContext.fillStyle = selected ? "#245c51" : "#8a3430";
    stageContext.fillText(String(index + 1).padStart(2, "0"), sprite.minX + 5, Math.max(16, sprite.minY - 6));
  });
}

function renderSpriteGrid(job) {
  els.spriteGrid.innerHTML = "";
  els.spriteGrid.classList.toggle("empty", job.sprites.length === 0);

  if (!job.sprites.length) {
    const empty = document.createElement("span");
    empty.textContent = "没有识别到切片，试着降低背景容差或最小面积。";
    els.spriteGrid.append(empty);
    return;
  }

  job.sprites.forEach((sprite, index) => {
    const card = document.createElement("article");
    card.className = `sprite-card${sprite.selected ? "" : " disabled"}`;
    const preview = document.createElement("div");
    preview.className = "sprite-preview";
    const canvas = renderSpriteCanvas(job, sprite);
    preview.append(canvas);

    const meta = document.createElement("div");
    meta.className = "sprite-meta";
    const size = document.createElement("span");
    size.textContent = `${index + 1} · ${canvas.width}×${canvas.height}`;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = sprite.selected ? "保留" : "排除";
    toggle.setAttribute("aria-pressed", String(sprite.selected));
    toggle.addEventListener("click", () => {
      sprite.selected = !sprite.selected;
      renderActiveJob();
    });

    meta.append(size, toggle);
    card.append(preview, meta);
    els.spriteGrid.append(card);
  });
}

function toggleSpriteAtPoint(event) {
  const job = getActiveJob();
  if (!job) return;
  const rect = els.stageCanvas.getBoundingClientRect();
  const scaleX = els.stageCanvas.width / rect.width;
  const scaleY = els.stageCanvas.height / rect.height;
  const x = Math.round((event.clientX - rect.left) * scaleX);
  const y = Math.round((event.clientY - rect.top) * scaleY);
  const sprite = [...job.sprites].reverse().find((item) => (
    x >= item.minX &&
    x <= item.maxX &&
    y >= item.minY &&
    y <= item.maxY
  ));

  if (!sprite) return;
  sprite.selected = !sprite.selected;
  renderActiveJob();
}

function renderSpriteCanvas(job, sprite) {
  if (job.renderedCanvases.has(sprite.id)) {
    return job.renderedCanvases.get(sprite.id);
  }

  const options = getOptions();
  const source = job.imageData;
  const labelSet = new Set(sprite.labels);
  const x0 = Math.max(0, sprite.minX - options.padding);
  const y0 = Math.max(0, sprite.minY - options.padding);
  const x1 = Math.min(source.width - 1, sprite.maxX + options.padding);
  const y1 = Math.min(source.height - 1, sprite.maxY + options.padding);
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const output = context.createImageData(width, height);
  let alphaMask = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = x0 + x;
      const sy = y0 + y;
      const sourceIndex = sy * source.width + sx;
      alphaMask[y * width + x] = labelSet.has(job.labelMap[sourceIndex]) ? 1 : 0;
    }
  }

  if (options.localRefine && job.fastSamProcessed) {
    alphaMask = refineLocalSpriteMask(source, alphaMask, x0, y0, width, height, options);
  }
  if (options.whiteTrim > 0 && job.fastSamProcessed) {
    alphaMask = trimWhiteSpriteEdge(source, alphaMask, x0, y0, width, height, options);
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = x0 + x;
      const sy = y0 + y;
      const sourceIndex = sy * source.width + sx;
      const sourceOffset = sourceIndex * 4;
      const targetOffset = (y * width + x) * 4;
      const targetIndex = y * width + x;
      output.data[targetOffset] = source.data[sourceOffset];
      output.data[targetOffset + 1] = source.data[sourceOffset + 1];
      output.data[targetOffset + 2] = source.data[sourceOffset + 2];
      output.data[targetOffset + 3] = alphaMask[targetIndex] ? source.data[sourceOffset + 3] : 0;
    }
  }

  context.putImageData(output, 0, 0);
  job.renderedCanvases.set(sprite.id, canvas);
  return canvas;
}

function updateUI() {
  const activeJob = getActiveJob();
  const selectedTotal = state.jobs.reduce((total, job) => total + job.sprites.filter((sprite) => sprite.selected).length, 0);
  els.jobCountText.textContent = String(state.jobs.length);
  els.countText.textContent = activeJob ? String(activeJob.sprites.length) : "0";
  els.selectedText.textContent = `${activeJob ? activeJob.sprites.filter((sprite) => sprite.selected).length : 0} / ${selectedTotal}`;
  els.detectButton.disabled = !activeJob;
  els.rembgButton.disabled = !activeJob;
  els.rembgAllButton.disabled = state.jobs.length === 0;
  els.fastSamButton.disabled = !activeJob;
  els.fastSamAllButton.disabled = state.jobs.length === 0;
  els.previewMaskButton.disabled = !activeJob || !activeJob.maskImage;
  els.previewMaskButton.textContent = activeJob && activeJob.showMaskPreview ? "显示原图" : "显示 AI 预览";
  els.saveButton.disabled = selectedTotal === 0;
  els.selectAllButton.disabled = !activeJob || activeJob.sprites.length === 0;
  els.clearButton.disabled = !activeJob || activeJob.sprites.length === 0;

  if (!activeJob) {
    els.spriteGrid.innerHTML = "<span>识别后会显示切片。</span>";
    els.spriteGrid.classList.add("empty");
    els.stagePanel.classList.add("hidden");
    els.dropZone.classList.remove("hidden");
  } else {
    els.stagePanel.classList.remove("hidden");
    els.dropZone.classList.add("hidden");
  }
}

function setAllSelected(selected) {
  const job = getActiveJob();
  if (!job) return;
  job.sprites.forEach((sprite) => {
    sprite.selected = selected;
  });
  renderActiveJob();
}

async function preprocessJobWithRembg(job) {
  setBusy(true, "AI 去背景中...");
  try {
    const blob = await removeBackground(job.processedBlob || job.sourceBlob);
    await replaceJobImage(job, blob, true);
    els.modeInput.value = "alpha";
    els.alphaInput.value = Math.max(Number(els.alphaInput.value), 96);
    syncControlLabels();
    detectJob(job);
  } catch (error) {
    alert(`AI 去背景失败：${error.message || error}`);
  } finally {
    setBusy(false);
  }
}

async function preprocessAllJobsWithRembg() {
  if (!state.jobs.length) return;
  setBusy(true, "批量 AI 去背景中...");
  try {
    for (const job of state.jobs) {
      const blob = await removeBackground(job.processedBlob || job.sourceBlob);
      await replaceJobImage(job, blob, true);
      detectJob(job);
    }
    els.modeInput.value = "alpha";
    els.alphaInput.value = Math.max(Number(els.alphaInput.value), 96);
    syncControlLabels();
    renderActiveJob();
  } catch (error) {
    alert(`批量 AI 去背景失败：${error.message || error}`);
  } finally {
    setBusy(false);
  }
}

async function segmentJobWithFastSam(job) {
  setBusy(true, "FastSAM 分割中...");
  try {
    const payload = await segmentWithFastSam(job.sourceBlob);
    await setJobInstanceMask(job, payload.labelPng);
    detectJob(job);
  } catch (error) {
    alert(`FastSAM 分割失败：${error.message || error}`);
  } finally {
    setBusy(false);
  }
}

async function segmentAllJobsWithFastSam() {
  if (!state.jobs.length) return;
  setBusy(true, "批量 FastSAM 中...");
  try {
    for (const job of state.jobs) {
      const payload = await segmentWithFastSam(job.sourceBlob);
      await setJobInstanceMask(job, payload.labelPng);
      detectJob(job);
    }
    renderActiveJob();
  } catch (error) {
    alert(`批量 FastSAM 失败：${error.message || error}`);
  } finally {
    setBusy(false);
  }
}

async function segmentWithFastSam(blob) {
  const formData = new FormData();
  formData.append("image", blob, "source.png");
  formData.append("edgeGrow", els.fastSamEdgeGrowInput.value);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch("http://127.0.0.1:5181/segment", {
      method: "POST",
      body: formData,
      signal: controller.signal
    });
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json();
        message = payload.error || message;
      } catch {
        // Keep HTTP status message.
      }
      throw new Error(message);
    }
    return response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("FastSAM 本地服务 120 秒内没有返回，可能已卡住。请重启 fastsam-server.py 后重试。");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function removeBackground(blob) {
  const formData = new FormData();
  formData.append("image", blob, "source.png");
  const response = await fetch("http://127.0.0.1:5180/remove-bg", {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      // Keep HTTP status message.
    }
    throw new Error(message);
  }
  return response.blob();
}

function replaceJobImage(job, blob, rembgProcessed) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(image.src);

      job.maskImageData = context.getImageData(0, 0, canvas.width, canvas.height);
      job.processedBlob = blob;
      job.rembgProcessed = rembgProcessed;
      job.fastSamProcessed = false;
      job.maskImage = image;
      job.showMaskPreview = rembgProcessed;
      job.instanceMaskImageData = null;
      job.labelMap = null;
      job.sprites = [];
      job.renderedCanvases.clear();
      resolve();
    };
    image.onerror = () => reject(new Error("无法读取 AI 去背景结果"));
    image.src = URL.createObjectURL(blob);
  });
}

function setJobInstanceMask(job, dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = job.image.naturalWidth;
      canvas.height = job.image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      job.instanceMaskImageData = context.getImageData(0, 0, canvas.width, canvas.height);
      job.maskImageData = job.instanceMaskImageData;
      job.maskImage = image;
      job.showMaskPreview = true;
      job.fastSamProcessed = true;
      job.rembgProcessed = false;
      job.processedBlob = null;
      job.labelMap = null;
      job.sprites = [];
      job.renderedCanvases.clear();
      resolve();
    };
    image.onerror = () => reject(new Error("无法读取 FastSAM 分割结果"));
    image.src = dataUrl;
  });
}

function setBusy(busy, label = "") {
  els.rembgButton.disabled = busy || !getActiveJob();
  els.rembgAllButton.disabled = busy || state.jobs.length === 0;
  els.fastSamButton.disabled = busy || !getActiveJob();
  els.fastSamAllButton.disabled = busy || state.jobs.length === 0;
  els.previewMaskButton.disabled = busy || !getActiveJob() || !getActiveJob().maskImage;
  els.detectButton.disabled = busy || !getActiveJob();
  els.saveButton.disabled = busy || state.jobs.every((job) => !job.sprites.some((sprite) => sprite.selected));
  if (busy && label && !label.includes("FastSAM")) {
    els.rembgButton.textContent = label;
  } else {
    els.rembgButton.textContent = "AI 去背景";
  }
  if (busy && label && label.includes("FastSAM")) {
    els.fastSamButton.textContent = label;
  } else {
    els.fastSamButton.textContent = "FastSAM 分割";
  }
}

function toggleMaskPreview() {
  const job = getActiveJob();
  if (!job || !job.maskImage) return;
  job.showMaskPreview = !job.showMaskPreview;
  renderActiveJob();
}

async function saveSelectedSprites() {
  const jobs = state.jobs.filter((job) => job.sprites.some((sprite) => sprite.selected));
  if (!jobs.length) return;

  if ("showDirectoryPicker" in window) {
    const rootDirectory = await window.showDirectoryPicker({
      id: "source-assets-packs",
      mode: "readwrite",
      startIn: "documents"
    });
    for (const job of jobs) {
      const jobDirectory = await rootDirectory.getDirectoryHandle(job.imageName, { create: true });
      await saveJobToDirectory(job, jobDirectory);
    }
    return;
  }

  for (const job of jobs) {
    const selected = job.sprites.filter((sprite) => sprite.selected);
    for (let index = 0; index < selected.length; index += 1) {
      const canvas = renderSpriteCanvas(job, selected[index]);
      const blob = await canvasToBlob(canvas);
      downloadBlob(blob, `${job.imageName}_${String(index + 1).padStart(3, "0")}.png`);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
  }
}

async function saveJobToDirectory(job, directoryHandle) {
  const coverBlob = await createPackSheetBlob(job);
  await writeBlobToDirectory(directoryHandle, "pack-sheet.jpg", coverBlob);

  const itemsDirectory = await directoryHandle.getDirectoryHandle("items", { create: true });
  const selected = job.sprites.filter((sprite) => sprite.selected);
  for (let index = 0; index < selected.length; index += 1) {
    const canvas = renderSpriteCanvas(job, selected[index]);
    const blob = await canvasToBlob(canvas);
    const fileName = `${index + 1}.png`;
    await writeBlobToDirectory(itemsDirectory, fileName, blob);
  }
}

async function createPackSheetBlob(job) {
  const options = getOptions();
  const canvas = document.createElement("canvas");
  canvas.width = job.image.naturalWidth;
  canvas.height = job.image.naturalHeight;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(job.image, 0, 0);
  return canvasToBlob(canvas, "image/jpeg", options.coverQuality);
}

async function writeBlobToDirectory(directoryHandle, fileName, blob) {
  const handle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function refineLocalSpriteMask(source, baseMask, x0, y0, width, height, options) {
  const radius = Math.max(1, Math.min(8, options.localRefineRadius || 3));
  const tolerance = Math.max(4, options.localRefineTolerance);
  const expanded = expandBinaryMask(baseMask, width, height, radius + 1);
  const background = estimateLocalCropBackground(source, baseMask, x0, y0, width, height);
  const refined = new Uint8Array(baseMask);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (baseMask[index] || !expanded[index]) continue;

      const sx = x0 + x;
      const sy = y0 + y;
      const sourceOffset = (sy * source.width + sx) * 4;
      const r = source.data[sourceOffset];
      const g = source.data[sourceOffset + 1];
      const b = source.data[sourceOffset + 2];
      const delta = colorDistance(r, g, b, background.r, background.g, background.b);
      const gradient = localGradient(source.data, source.width, source.height, sx, sy);
      const hsl = rgbToHsl(r, g, b);

      if (delta > tolerance || gradient > 16 || (delta > tolerance * 0.6 && hsl.s > 0.12)) {
        refined[index] = 1;
      }
    }
  }

  return refined;
}

function estimateLocalCropBackground(source, mask, x0, y0, width, height) {
  const samples = [];
  const inset = Math.max(1, Math.min(6, Math.floor(Math.min(width, height) * 0.08)));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nearEdge = x < inset || y < inset || x >= width - inset || y >= height - inset;
      if (!nearEdge || mask[y * width + x]) continue;
      collect(x, y);
    }
  }

  if (samples.length < 16) {
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (!mask[y * width + x]) collect(x, y);
      }
    }
  }

  if (!samples.length) return { r: 255, g: 255, b: 255 };
  samples.sort((a, b) => a.l - b.l);
  const mid = samples.slice(Math.floor(samples.length * 0.2), Math.ceil(samples.length * 0.8));
  return averageColor(mid.length ? mid : samples);

  function collect(x, y) {
    const sx = x0 + x;
    const sy = y0 + y;
    const offset = (sy * source.width + sx) * 4;
    if (source.data[offset + 3] <= 8) return;
    const r = source.data[offset];
    const g = source.data[offset + 1];
    const b = source.data[offset + 2];
    const hsl = rgbToHsl(r, g, b);
    const brightness = (r + g + b) / 3;
    if (brightness > 115 && hsl.s < 0.36) {
      samples.push({ r, g, b, l: brightness });
    }
  }
}

function expandBinaryMask(mask, width, height, radius) {
  const expanded = new Uint8Array(mask);
  const active = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) active.push(index);
  }

  active.forEach((index) => {
    const cx = index % width;
    const cy = Math.floor(index / width);
    const yStart = Math.max(0, cy - radius);
    const yEnd = Math.min(height - 1, cy + radius);
    const xStart = Math.max(0, cx - radius);
    const xEnd = Math.min(width - 1, cx + radius);
    for (let y = yStart; y <= yEnd; y += 1) {
      for (let x = xStart; x <= xEnd; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) {
          expanded[y * width + x] = 1;
        }
      }
    }
  });

  return expanded;
}

function trimWhiteSpriteEdge(source, mask, x0, y0, width, height, options) {
  const strength = Math.max(0, Math.min(5, options.whiteTrim));
  if (!strength) return mask;

  const background = estimateLocalCropBackground(source, mask, x0, y0, width, height);
  const backgroundBrightness = (background.r + background.g + background.b) / 3;
  const boundary = createMaskBoundary(mask, width, height, Math.max(1, strength + 1));
  const trimmed = new Uint8Array(mask);
  const colorTolerance = 12 + strength * 7;
  const saturationLimit = 0.16 + strength * 0.035;
  const brightnessSlack = 18 + strength * 7;
  const gradientLimit = 18 + strength * 5;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!boundary[index]) continue;

      const sx = x0 + x;
      const sy = y0 + y;
      const sourceOffset = (sy * source.width + sx) * 4;
      const r = source.data[sourceOffset];
      const g = source.data[sourceOffset + 1];
      const b = source.data[sourceOffset + 2];
      const hsl = rgbToHsl(r, g, b);
      const brightness = (r + g + b) / 3;
      const delta = colorDistance(r, g, b, background.r, background.g, background.b);
      const gradient = localGradient(source.data, source.width, source.height, sx, sy);
      const backgroundLike = delta <= colorTolerance && hsl.s <= saturationLimit;
      const paleWhite = brightness >= backgroundBrightness - brightnessSlack && hsl.s <= saturationLimit * 0.9;

      if ((backgroundLike || paleWhite) && gradient <= gradientLimit) {
        trimmed[index] = 0;
      }
    }
  }

  return trimmed;
}

function createMaskBoundary(mask, width, height, radius) {
  let inner = new Uint8Array(mask);
  for (let i = 0; i < radius; i += 1) {
    inner = erodeMask(inner, width, height);
  }

  const boundary = new Uint8Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    boundary[index] = mask[index] && !inner[index] ? 1 : 0;
  }
  return boundary;
}

function createForegroundMask(imageData, options) {
  const { data, width, height } = imageData;
  const mask = new Uint8Array(width * height);
  const hasTransparency = detectTransparency(data);
  const mode = options.mode === "auto" ? (hasTransparency ? "alpha" : "corner") : options.mode;
  if (mode === "white-paper") {
    return createWhitePaperMask(imageData, options);
  }
  const background = estimateBackgroundColor(data, width, height);

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const alpha = data[offset + 3];
    if (mode === "alpha") {
      mask[index] = alpha > options.alphaThreshold ? 1 : 0;
    } else {
      const distance = colorDistance(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        background.r,
        background.g,
        background.b
      );
      mask[index] = alpha > options.alphaThreshold && distance > options.tolerance ? 1 : 0;
    }
  }

  return closeMask(mask, width, height);
}

function labelInstancesFromImageData(imageData, minArea) {
  const { data, width, height } = imageData;
  const labels = new Int32Array(width * height);
  const componentsByColor = new Map();

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    if (data[offset + 3] <= 0) continue;
    const key = data[offset] + (data[offset + 1] << 8) + (data[offset + 2] << 16);
    if (!key) continue;
    let component = componentsByColor.get(key);
    if (!component) {
      component = {
        labels: [key],
        area: 0,
        minX: width,
        minY: height,
        maxX: 0,
        maxY: 0
      };
      componentsByColor.set(key, component);
    }
    const x = index % width;
    const y = Math.floor(index / width);
    labels[index] = key;
    component.area += 1;
    component.minX = Math.min(component.minX, x);
    component.minY = Math.min(component.minY, y);
    component.maxX = Math.max(component.maxX, x);
    component.maxY = Math.max(component.maxY, y);
  }

  const components = Array.from(componentsByColor.values())
    .filter((component) => component.area >= minArea)
    .sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX));

  return { labels, components };
}

function createWhitePaperMask(imageData, options) {
  const { data, width, height } = imageData;
  const mask = new Uint8Array(width * height);
  const background = estimateWhitePaperBackground(data, width, height);
  const tolerance = Math.max(10, options.tolerance);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      const alpha = data[offset + 3];
      if (alpha <= options.alphaThreshold) continue;

      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const hsl = rgbToHsl(r, g, b);
      const brightness = (r + g + b) / 3;
      const bgBrightness = (background.r + background.g + background.b) / 3;
      const colorDelta = colorDistance(r, g, b, background.r, background.g, background.b);
      const brightnessDelta = bgBrightness - brightness;
      const gradient = localGradient(data, width, height, x, y);

      const coloredMaterial = colorDelta > tolerance || hsl.s > 0.14;
      const paperEdge = brightnessDelta > 12 && gradient > 8;
      const shadowOrRelief = brightnessDelta > 24 && colorDelta > 10;

      if (coloredMaterial || paperEdge || shadowOrRelief) {
        mask[index] = 1;
      }
    }
  }

  const expanded = dilateMask(mask, width, height);
  const closed = closeMask(expanded, width, height);
  const filled = fillMaskHoles(closed, width, height);
  return erodeMask(filled, width, height);
}

function estimateWhitePaperBackground(data, width, height) {
  const samples = [];
  const inset = Math.max(2, Math.floor(Math.min(width, height) * 0.02));
  const step = Math.max(1, Math.floor(Math.min(width, height) / 160));

  for (let y = inset; y < height - inset; y += step) {
    collect(y * width + inset);
    collect(y * width + (width - inset - 1));
  }
  for (let x = inset; x < width - inset; x += step) {
    collect(inset * width + x);
    collect((height - inset - 1) * width + x);
  }

  if (!samples.length) return estimateBackgroundColor(data, width, height);
  samples.sort((a, b) => b.brightness - a.brightness);
  const brightSamples = samples.slice(0, Math.max(8, Math.floor(samples.length * 0.35)));
  return averageColor(brightSamples);

  function collect(index) {
    const offset = index * 4;
    const alpha = data[offset + 3];
    if (alpha <= 8) return;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const hsl = rgbToHsl(r, g, b);
    const brightness = (r + g + b) / 3;
    if (brightness > 170 && hsl.s < 0.22) {
      samples.push({ r, g, b, brightness });
    }
  }
}

function averageColor(samples) {
  const total = samples.reduce((sum, sample) => ({
    r: sum.r + sample.r,
    g: sum.g + sample.g,
    b: sum.b + sample.b
  }), { r: 0, g: 0, b: 0 });
  return {
    r: Math.round(total.r / samples.length),
    g: Math.round(total.g / samples.length),
    b: Math.round(total.b / samples.length)
  };
}

function localGradient(data, width, height, x, y) {
  const left = pixelBrightness(data, Math.max(0, x - 1), y, width);
  const right = pixelBrightness(data, Math.min(width - 1, x + 1), y, width);
  const top = pixelBrightness(data, x, Math.max(0, y - 1), width);
  const bottom = pixelBrightness(data, x, Math.min(height - 1, y + 1), width);
  return Math.abs(left - right) + Math.abs(top - bottom);
}

function pixelBrightness(data, x, y, width) {
  const offset = (y * width + x) * 4;
  return (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
}

function fillMaskHoles(mask, width, height) {
  const outside = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    visit(index - 1, x > 0);
    visit(index + 1, x < width - 1);
    visit(index - width, y > 0);
    visit(index + width, y < height - 1);
  }

  const filled = new Uint8Array(mask);
  for (let index = 0; index < filled.length; index += 1) {
    if (!filled[index] && !outside[index]) filled[index] = 1;
  }
  return filled;

  function enqueue(index) {
    if (mask[index] || outside[index]) return;
    outside[index] = 1;
    queue[tail] = index;
    tail += 1;
  }

  function visit(index, valid) {
    if (!valid) return;
    enqueue(index);
  }
}

function detectTransparency(data) {
  for (let offset = 3; offset < data.length; offset += 4) {
    if (data[offset] < 250) return true;
  }
  return false;
}

function estimateBackgroundColor(data, width, height) {
  const samples = [];
  const sampleSize = Math.max(4, Math.floor(Math.min(width, height) * 0.035));
  const corners = [
    [0, 0],
    [width - sampleSize, 0],
    [0, height - sampleSize],
    [width - sampleSize, height - sampleSize]
  ];

  corners.forEach(([startX, startY]) => {
    for (let y = startY; y < startY + sampleSize; y += 1) {
      for (let x = startX; x < startX + sampleSize; x += 1) {
        const offset = (y * width + x) * 4;
        if (data[offset + 3] > 8) {
          samples.push([data[offset], data[offset + 1], data[offset + 2]]);
        }
      }
    }
  });

  if (!samples.length) return { r: 255, g: 255, b: 255 };
  samples.sort((a, b) => luminance(a) - luminance(b));
  const mid = samples[Math.floor(samples.length / 2)];
  return { r: mid[0], g: mid[1], b: mid[2] };
}

function luminance(color) {
  return color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114;
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l: lightness };
  }
  const delta = max - min;
  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min);
  let hue = 0;
  if (max === rn) hue = (gn - bn) / delta + (gn < bn ? 6 : 0);
  if (max === gn) hue = (bn - rn) / delta + 2;
  if (max === bn) hue = (rn - gn) / delta + 4;
  return { h: hue / 6, s: saturation, l: lightness };
}

function closeMask(mask, width, height) {
  return erodeMask(dilateMask(mask, width, height), width, height);
}

function dilateMask(mask, width, height) {
  const next = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (mask[index]) {
        next[index] = 1;
        continue;
      }
      for (let oy = -1; oy <= 1 && !next[index]; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx]) {
            next[index] = 1;
            break;
          }
        }
      }
    }
  }
  return next;
}

function erodeMask(mask, width, height) {
  const next = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      let keep = true;
      for (let oy = -1; oy <= 1 && keep; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) {
            keep = false;
            break;
          }
        }
      }
      next[index] = keep ? 1 : 0;
    }
  }
  return next;
}

function labelComponents(mask, width, height, minArea) {
  const labels = new Int32Array(mask.length);
  const components = [];
  let label = 1;
  const queue = new Int32Array(mask.length);

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start]) continue;
    let head = 0;
    let tail = 0;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    queue[tail] = start;
    tail += 1;
    labels[start] = label;

    while (head < tail) {
      const index = queue[head];
      head += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      visitNeighbor(index - 1, x > 0);
      visitNeighbor(index + 1, x < width - 1);
      visitNeighbor(index - width, y > 0);
      visitNeighbor(index + width, y < height - 1);
    }

    if (area >= minArea) {
      components.push({ labels: [label], area, minX, minY, maxX, maxY });
      label += 1;
    } else {
      for (let i = 0; i < tail; i += 1) {
        labels[queue[i]] = -1;
      }
    }

    function visitNeighbor(nextIndex, valid) {
      if (!valid || !mask[nextIndex] || labels[nextIndex]) return;
      labels[nextIndex] = label;
      queue[tail] = nextIndex;
      tail += 1;
    }
  }

  return { labels, components };
}

function mergeComponents(components, gap) {
  const sprites = components.map((component) => ({ ...component }));
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < sprites.length && !changed; i += 1) {
      for (let j = i + 1; j < sprites.length; j += 1) {
        if (boxesTouch(sprites[i], sprites[j], gap)) {
          sprites[i] = combineSprites(sprites[i], sprites[j]);
          sprites.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
  }

  return sprites.sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX));
}

function boxesTouch(a, b, gap) {
  return !(
    a.maxX + gap < b.minX ||
    b.maxX + gap < a.minX ||
    a.maxY + gap < b.minY ||
    b.maxY + gap < a.minY
  );
}

function combineSprites(a, b) {
  return {
    labels: a.labels.concat(b.labels),
    area: a.area + b.area,
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  };
}

function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function downloadBlob(blob, fileName) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function sanitizeName(value) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "sprite-sheet";
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}
