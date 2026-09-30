/**
 * [INPUT]: 依赖 ui.html 控件、浏览器文件/剪贴板能力与插件主线程的规范包、配置和扫描消息
 * [OUTPUT]: 对外提供单步目标选择、扫描诊断、可退出的导出流程与拖动/键盘高度调节
 * [POS]: src 的 UI 交互层，不持有 Figma 节点，以加载状态保护目标切换和扫描/应用协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
"use strict";

const state = {
  initialized: false,
  busy: false,
  profileConfirmed: false,
  confirmedProfileId: null,
  profiles: [],
  matched: 0,
  mainStatus: null,
  exportStatusActive: false,
};
const elements = {
  profile: document.getElementById("profile"),
  family: document.getElementById("family"),
  scope: document.querySelector('[data-slot="toggle-group"]'),
  status: document.getElementById("status"),
  statusTitle: document.getElementById("statusTitle"),
  statusDescription: document.getElementById("statusDescription"),
  scan: document.getElementById("scan"),
  apply: document.getElementById("apply"),
  resultSection: document.getElementById("resultSection"),
  resultBadge: document.getElementById("resultBadge"),
  preview: document.getElementById("preview"),
  scanDiagnostics: document.getElementById("scanDiagnostics"),
  scanCandidates: document.getElementById("scanCandidates"),
  scanReasons: document.getElementById("scanReasons"),
  countText: document.getElementById("countText"),
  countColor: document.getElementById("countColor"),
  countRadius: document.getElementById("countRadius"),
  countSpacing: document.getElementById("countSpacing"),
  exportCatalog: document.getElementById("exportCatalog"),
  chooseCatalog: document.getElementById("chooseCatalog"),
  importCatalog: document.getElementById("importCatalog"),
  catalogExportResult: document.getElementById("catalogExportResult"),
  catalogExportSummary: document.getElementById("catalogExportSummary"),
  catalogWarning: document.getElementById("catalogWarning"),
  catalogRaw: document.getElementById("catalogRaw"),
  catalogJson: document.getElementById("catalogJson"),
  downloadCatalog: document.getElementById("downloadCatalog"),
  copyCatalog: document.getElementById("copyCatalog"),
  finishCatalog: document.getElementById("finishCatalog"),
  resizeHandle: document.getElementById("resizeHandle"),
};

const MAX_CATALOG_BYTES = 10 * 1024 * 1024;
const SETTING_IDS = ["visibleOnly", "onlyUnbound", "exactSize", "includeLowConfidence", "includeInstances",
  "categoryText", "categoryColor", "categoryRadius", "categorySpacing"];

function settings() {
  return {
    profileId: elements.profile.value,
    targetFamily: elements.family.value,
    scope: elements.scope.dataset.value,
    visibleOnly: document.getElementById("visibleOnly").checked,
    onlyUnbound: document.getElementById("onlyUnbound").checked,
    exactSize: document.getElementById("exactSize").checked,
    includeLowConfidence: document.getElementById("includeLowConfidence").checked,
    includeInstances: document.getElementById("includeInstances").checked,
    categories: {
      text: document.getElementById("categoryText").checked,
      color: document.getElementById("categoryColor").checked,
      radius: document.getElementById("categoryRadius").checked,
      spacing: document.getElementById("categorySpacing").checked,
    },
  };
}

function syncActions() {
  const selectedConfirmed = state.profileConfirmed &&
    elements.profile.value === state.confirmedProfileId;
  elements.profile.disabled = !state.initialized || state.busy;
  elements.family.disabled = state.busy || !selectedConfirmed || elements.family.options.length === 0;
  elements.scan.disabled = state.busy || !state.initialized || !selectedConfirmed;
  elements.apply.disabled = elements.scan.disabled || state.matched === 0;
  elements.exportCatalog.disabled = !state.initialized || state.busy;
  elements.chooseCatalog.disabled = !state.initialized || state.busy;
  elements.downloadCatalog.disabled = state.busy;
  elements.copyCatalog.disabled = state.busy;
  elements.finishCatalog.disabled = state.busy;
  for (const id of SETTING_IDS) document.getElementById(id).disabled = state.busy;
  elements.scope.querySelectorAll('[data-slot="toggle-group-item"]').forEach((item) => {
    item.disabled = state.busy;
  });
}

function setBusy(title, description) {
  state.exportStatusActive = false;
  state.busy = true;
  elements.status.hidden = false;
  elements.status.dataset.tone = "neutral";
  elements.statusTitle.textContent = title;
  elements.statusDescription.textContent = description;
  elements.statusDescription.hidden = !description;
  syncActions();
}

function setStatus(title, description, tone, visible = true, owner = "main") {
  state.exportStatusActive = owner === "export";
  if (!state.exportStatusActive) state.mainStatus = [title, description, tone, visible];
  state.busy = false;
  elements.status.hidden = !visible;
  elements.status.dataset.tone = tone || "neutral";
  elements.statusTitle.textContent = title;
  elements.statusDescription.textContent = description;
  elements.statusDescription.hidden = !description;
  syncActions();
}

function setExportStatus(title, description, tone) {
  setStatus(title, description, tone, true, "export");
}

// --- 窗口尺寸：屏幕坐标避免窗口高度变化干扰拖动差值 ---
const WINDOW_HEIGHT = { min: 480, max: 1040, step: 40 };
let resizeDrag = null;

function resizeWindow(height) {
  if (!Number.isFinite(height)) return;
  const bounded = Math.round(Math.max(WINDOW_HEIGHT.min, Math.min(WINDOW_HEIGHT.max, height)));
  parent.postMessage({ pluginMessage: { type: "resize", height: bounded } }, "*");
}

elements.resizeHandle.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || resizeDrag) return;
  event.preventDefault();
  resizeDrag = { pointerId: event.pointerId, y: event.screenY, height: window.innerHeight };
  elements.resizeHandle.setPointerCapture(event.pointerId);
});
elements.resizeHandle.addEventListener("pointermove", (event) => {
  if (resizeDrag?.pointerId !== event.pointerId) return;
  resizeWindow(resizeDrag.height + event.screenY - resizeDrag.y);
});
function endResize(event) {
  if (resizeDrag?.pointerId !== event.pointerId) return;
  resizeDrag = null;
  if (elements.resizeHandle.hasPointerCapture(event.pointerId)) {
    elements.resizeHandle.releasePointerCapture(event.pointerId);
  }
}
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  elements.resizeHandle.addEventListener(type, endResize);
}
elements.resizeHandle.addEventListener("keydown", (event) => {
  const heights = { ArrowUp: window.innerHeight - WINDOW_HEIGHT.step,
    ArrowDown: window.innerHeight + WINDOW_HEIGHT.step, Home: WINDOW_HEIGHT.min, End: WINDOW_HEIGHT.max };
  if (!(event.key in heights)) return;
  event.preventDefault();
  resizeWindow(heights[event.key]);
});
window.addEventListener("resize", () => {
  elements.resizeHandle.setAttribute("aria-valuenow", String(window.innerHeight));
});

function setScope(value) {
  elements.scope.dataset.value = value;
  elements.scope.querySelectorAll('[data-slot="toggle-group-item"]').forEach((item) => {
    const selected = item.dataset.value === value;
    item.dataset.state = selected ? "on" : "off";
    item.setAttribute("aria-pressed", String(selected));
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function kindLabel(kind) {
  return { text: "文字", color: "颜色", radius: "圆角", spacing: "间距" }[kind] || kind;
}

function selectedProfile() {
  return state.profiles.find((profile) => profile.id === elements.profile.value) || null;
}

function renderProfiles(profiles, selectedId) {
  state.profiles = profiles;
  const placeholder = state.profileConfirmed ? "" : '<option value="" disabled>请选择目标设计系统</option>';
  elements.profile.innerHTML = placeholder + profiles.map((profile) => {
    const suffix = profile.recommended ? "（推荐）" : profile.enabled ? "" : "（未启用）";
    const disabled = profile.kind === "local" && !profile.enabled ? " disabled" : "";
    return `<option value="${escapeHtml(profile.id)}"${disabled}>${escapeHtml(profile.name + suffix)}</option>`;
  }).join("");
  elements.profile.value = state.profileConfirmed ? selectedId : "";
}

function renderFamilies(families, defaultFamily) {
  elements.family.innerHTML = families.map((family) =>
    `<option value="${escapeHtml(family)}">${escapeHtml(family)}</option>`,
  ).join("");
  if (families.includes(defaultFamily)) elements.family.value = defaultFamily;
}

function renderPreview(items, diagnostics) {
  if (!items.length) {
    elements.preview.innerHTML = `
      <div data-slot="empty">
        <div data-slot="empty-header">
          <div data-slot="empty-title">${escapeHtml(diagnostics?.emptyTitle || "没有新增可绑定项")}</div>
          <p class="field-description">${escapeHtml(diagnostics?.hint || "请查看扫描说明，检查规范来源与保护条件。")}</p>
        </div>
      </div>
    `;
    return;
  }
  elements.preview.innerHTML = items.map((item) => `
    <div class="preview-row">
      <div class="preview-row-top">
        <span class="preview-target">${escapeHtml(item.target)}</span>
        <span data-slot="badge" data-variant="${item.confidence === "low" ? "warning" : "secondary"}">${item.confidence === "low" ? "近似 · " : ""}${kindLabel(item.kind)}</span>
      </div>
      <div class="preview-source">${escapeHtml(item.source)}</div>
    </div>
  `).join("");
}

function renderDiagnostics(diagnostics) {
  elements.scanDiagnostics.hidden = !diagnostics;
  if (!diagnostics) return;
  const available = diagnostics.available;
  elements.scanCandidates.textContent = `可用候选：文字 ${available.text} · 颜色 ${available.color} · 圆角 ${available.radius} · 间距 ${available.spacing}`;
  elements.scanReasons.innerHTML = diagnostics.reasons.map((item) =>
    `<li>${escapeHtml(item.reason)}：${item.count} ${escapeHtml(item.unit)}</li>`,
  ).join("");
  elements.scanDiagnostics.open = state.matched === 0;
}

function invalidateResults() {
  const hadResults = !elements.resultSection.hidden;
  state.matched = 0;
  elements.resultSection.hidden = true;
  if (hadResults) setStatus("配置已更新", "请重新扫描，检查新配置下的匹配结果。", "neutral");
  else syncActions();
}

function renderCounts(counts) {
  elements.countText.textContent = counts.text || 0;
  elements.countColor.textContent = counts.color || 0;
  elements.countRadius.textContent = counts.radius || 0;
  elements.countSpacing.textContent = counts.spacing || 0;
}

function initializationStatus(data) {
  if (!data.profileConfirmed) {
    return {
      title: "请选择目标设计系统",
      description: "从下拉框选择即生效，无需再次确认。",
      tone: "warning",
      visible: false,
    };
  }
  if (!data.libraryEnabled && data.libraryVariableCount === 0) {
    return {
      title: "目标规范缺少已启用的变量库",
      description: `${data.profileName} 的文字目录可用；颜色变量需要先在当前文件启用对应团队库。`,
      tone: "warning",
    };
  }
  return {
    title: "目标规范已就绪",
    description: data.fontAvailable ? "" : "当前环境无法使用目标字体；请检查字体安装或选择其他可用字体。",
    tone: data.fontAvailable ? "neutral" : "warning",
    visible: !data.fontAvailable,
  };
}

elements.profile.addEventListener("change", () => {
  const profile = selectedProfile();
  if (!profile || state.busy) return;
  state.profileConfirmed = false;
  state.matched = 0;
  elements.resultSection.hidden = true;
  setBusy("正在载入目标规范", `正在读取 ${profile.name} 的文字样式与设计变量…`);
  parent.postMessage({ pluginMessage: { type: "select-profile", profileId: profile.id } }, "*");
});

elements.scope.addEventListener("click", (event) => {
  const item = event.target.closest('[data-slot="toggle-group-item"]');
  if (item) {
    setScope(item.dataset.value);
    invalidateResults();
  }
});

elements.family.addEventListener("change", invalidateResults);
for (const id of SETTING_IDS) {
  document.getElementById(id).addEventListener("change", invalidateResults);
}

elements.scan.addEventListener("click", () => {
  if (elements.scan.disabled) return;
  const config = settings();
  if (!Object.values(config.categories).some(Boolean)) {
    setStatus("请选择规范类别", "至少选择文字、颜色、圆角或间距中的一项。", "warning");
    return;
  }
  if (config.categories.text && !config.targetFamily) {
    setStatus("目标规范没有可用文字样式", "请先导入 Text Styles，或取消“文字样式”类别后继续。", "warning");
    return;
  }
  state.matched = 0;
  elements.resultSection.hidden = true;
  setBusy("正在扫描规范", `正在读取 ${selectedProfile()?.name || "目标规范"} 的样式、变量和节点属性…`);
  parent.postMessage({ pluginMessage: { type: "scan", settings: config } }, "*");
});

elements.apply.addEventListener("click", () => {
  if (elements.apply.disabled) return;
  setBusy("正在应用规范", `正在按需导入并绑定 ${selectedProfile()?.name || "目标"} 设计资产…`);
  parent.postMessage({ pluginMessage: { type: "apply", settings: settings() } }, "*");
});

elements.exportCatalog.addEventListener("click", () => {
  setBusy("正在导出规范包", "正在采集当前文件的样式、变量和组件清单…");
  parent.postMessage({ pluginMessage: { type: "export-catalog" } }, "*");
});

elements.chooseCatalog.addEventListener("click", () => elements.importCatalog.click());

elements.importCatalog.addEventListener("change", async () => {
  const file = elements.importCatalog.files?.[0];
  if (!file) return;
  elements.importCatalog.value = "";
  if (file.size > MAX_CATALOG_BYTES) {
    setStatus("文件过大", "JSON 规范包不能超过 10 MB。", "error");
    return;
  }
  try {
    setBusy("正在导入规范包", `正在读取 ${file.name}…`);
    const json = await file.text();
    parent.postMessage({ pluginMessage: { type: "import-catalog", json } }, "*");
  } catch (error) {
    setStatus("文件读取失败", error instanceof Error ? error.message : String(error), "error");
  }
});

elements.downloadCatalog.addEventListener("click", () => {
  const json = elements.catalogJson.value;
  if (!json) return;
  try {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "design-system-catalog.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportStatus("已发起下载", "如果 Figma 未保存文件，可复制下方 JSON 手动保存；保存后点击“完成”返回。", "neutral");
  } catch (error) {
    setExportStatus("无法下载", "请复制下方 JSON 并保存为 .json 文件。", "error");
  }
});

elements.copyCatalog.addEventListener("click", async () => {
  if (state.busy || !elements.catalogJson.value) return;
  setBusy("正在复制 JSON", "");
  try {
    await navigator.clipboard.writeText(elements.catalogJson.value);
    setExportStatus("已复制 JSON", "可粘贴并保存为 .json 文件；点击“完成”返回规范绑定。", "neutral");
  } catch {
    elements.catalogExportResult.hidden = false;
    elements.catalogRaw.open = true;
    elements.catalogJson.select();
    setExportStatus("请手动复制", "已选中 JSON；按 ⌘C 或 Ctrl+C，保存后点击“完成”返回。", "warning");
  }
});

elements.finishCatalog.addEventListener("click", () => {
  if (state.busy) return;
  elements.catalogExportResult.hidden = true;
  elements.catalogRaw.open = false;
  elements.catalogJson.value = "";
  if (state.exportStatusActive && state.mainStatus) setStatus(...state.mainStatus);
  elements.exportCatalog.focus();
});

window.onmessage = (event) => {
  const message = event.data.pluginMessage;
  if (!message) return;

  if (message.type === "init") {
    const data = message.payload;
    state.initialized = true;
    state.profileConfirmed = data.profileConfirmed;
    state.confirmedProfileId = data.profileConfirmed ? data.activeProfileId : null;
    renderProfiles(data.profiles, data.activeProfileId);
    renderFamilies(data.families, data.defaultFamily);
    setScope(data.selectionCount > 0 ? "selection" : "page");
    const status = initializationStatus(data);
    setStatus(status.title, status.description, status.tone, status.visible);
  }

  if (message.type === "profile-selected") {
    const data = message.payload;
    state.profileConfirmed = true;
    state.confirmedProfileId = data.activeProfileId;
    state.matched = 0;
    renderProfiles(data.profiles, data.activeProfileId);
    renderFamilies(data.families, data.defaultFamily);
    elements.resultSection.hidden = true;
    const status = initializationStatus(data);
    setStatus(status.title, status.description, status.tone, status.visible);
  }

  if (message.type === "catalog-exported") {
    const { json, summary, warnings = [] } = message.payload;
    const count = summary.counts;
    elements.catalogJson.value = json;
    elements.catalogExportResult.hidden = false;
    elements.catalogRaw.open = false;
    elements.catalogExportSummary.textContent = `${count.text} 文字 · ${count.variables} 变量 · ${count.components + count.componentSets} 组件`;
    elements.catalogWarning.hidden = warnings.length === 0;
    elements.catalogWarning.textContent = warnings.length
      ? `${warnings.length} 个组件属性缺失：${warnings.slice(0, 3).map((item) => item.name).join("、")}`
      : "";
    setExportStatus(
      warnings.length ? "规范包已生成，但有缺项" : "规范包已生成",
      warnings.length
        ? `样式和变量已导出；${warnings.length} 个组件属性缺失，见下方。`
        : "可下载 JSON；复制与原始内容为备用方式。",
      warnings.length ? "warning" : "neutral",
    );
  }

  if (message.type === "catalog-imported") {
    const count = message.payload.counts;
    elements.catalogExportResult.hidden = true;
    elements.catalogRaw.open = false;
    setStatus(
      "规范包已导入并设为目标",
      `文字 ${count.text} · 变量 ${count.variables} · 组件 ${count.components + count.componentSets}${message.payload.warningCount ? ` · ${message.payload.warningCount} 项组件属性缺失` : ""}；跨文件绑定仍需源库访问权限。`,
      message.payload.warningCount ? "warning" : "neutral",
    );
  }

  if (message.type === "scan-result") {
    const data = message.payload;
    state.matched = data.matched;
    elements.resultSection.hidden = false;
    elements.resultBadge.dataset.variant = "secondary";
    elements.resultBadge.textContent = data.matched > 0 ? `${data.matched} 项可应用` : "无新增绑定";
    renderCounts(data.counts);
    renderPreview(data.previews, data.diagnostics);
    renderDiagnostics(data.diagnostics);
    const warningCount = data.diagnostics?.variableFailures || data.warnings.length;
    const warning = warningCount > 0 ? `；${warningCount} 个变量读取失败` : "";
    setStatus(
      "扫描完成",
      `按「${data.profileName}」检查 ${data.totalNodes} 个节点，找到 ${data.matched} 项新增绑定${data.diagnostics?.lowConfidence ? `（含 ${data.diagnostics.lowConfidence} 项近似或低置信度匹配）` : ""}${warning}。`,
      data.matched > 0 ? "neutral" : "warning",
    );
  }

  if (message.type === "apply-result") {
    state.matched = 0;
    elements.resultBadge.textContent = "已完成";
    elements.resultBadge.dataset.variant = "success";
    renderCounts(message.payload.counts || {});
    setStatus("应用完成", message.payload.message, "success");
  }

  if (message.type === "error") {
    state.matched = 0;
    setStatus("操作未完成", message.payload.message, "error");
  }
};
