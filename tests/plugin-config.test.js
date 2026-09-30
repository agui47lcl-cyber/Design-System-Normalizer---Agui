/**
 * [INPUT]: 依赖 Node.js test/assert/fs/path/vm、manifest.json 与 src 的 UI 结构、样式和交互源码
 * [OUTPUT]: 对外验证目标确认显隐、警告恢复、双列选择、JSON 入口及安全规则默认值
 * [POS]: tests 的插件配置回归套件，防止权限、用户决策边界、组件结构与视觉状态在迭代中退化
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const uiCss = fs.readFileSync(path.join(root, "src/ui.css"), "utf8");
const uiHtml = fs.readFileSync(path.join(root, "src/ui.html"), "utf8");
const uiJs = fs.readFileSync(path.join(root, "src/ui.js"), "utf8");
const codeJs = fs.readFileSync(path.join(root, "src/code.js"), "utf8");

test("插件声明 teamlibrary 权限且保持无网络访问", () => {
  assert.deepEqual(manifest.permissions, ["teamlibrary"]);
  assert.deepEqual(manifest.networkAccess, { allowedDomains: ["none"] });
});

test("插件不依赖 Access Token 配置", () => {
  assert.doesNotMatch(JSON.stringify(manifest), /token|secret|oauth/i);
  assert.doesNotMatch(uiCss, /figma-color-bg-brand|#0d99ff|text-success|text-warning|text-danger/i);
});

test("插件主题以 shadcn 中性色为主且只为结果状态增加语义色", () => {
  for (const color of ["#fff", "#0a0a0a", "#f5f5f5", "#737373", "#e5e5e5", "#171717"]) {
    assert.match(uiCss, new RegExp(color.replace("#", "#"), "i"));
  }
  assert.match(uiCss, /--success:\s*#16a34a/i);
  assert.match(uiCss, /--destructive:\s*#dc2626/i);
  assert.match(uiCss, /border-radius:\s*0\s*!important/i);
  const braceDepth = [...uiCss].reduce((depth, character) => {
    if (character === "{") return depth + 1;
    if (character === "}") return depth - 1;
    return depth;
  }, 0);
  assert.equal(braceDepth, 0);
});

test("表单和反馈使用 shadcn 对应的组合结构", () => {
  for (const slot of [
    "alert",
    "alert-title",
    "alert-description",
    "field-group",
    "field-set",
    "field-legend",
    "native-select",
    "toggle-group",
    "toggle-group-item",
    "checkbox",
    "separator",
    "badge",
    "button",
  ]) {
    assert.match(uiHtml, new RegExp(`data-slot="${slot}"`));
  }
  assert.doesNotMatch(uiHtml, /category-grid|check-field/);
  assert.doesNotMatch(uiCss, /\.category-grid|\.check-field/);
});

test("目标设计系统必须由用户确认并在用户与文件两级记忆", () => {
  assert.match(uiHtml, /id="profile"/);
  assert.match(uiHtml, /id="confirmProfile"/);
  assert.match(uiJs, /type:\s*"select-profile"/);
  assert.match(uiJs, /插件只负责推荐候选；确认后才会扫描和应用规范/);
  assert.match(codeJs, /figma\.clientStorage\.setAsync\(PROFILE_STORAGE_KEY/);
  assert.match(codeJs, /figma\.root\.setPluginData\(PROFILE_STORAGE_KEY/);
});

test("JSON 导入导出由文件控件触发并在主线程存储规范包", () => {
  for (const id of ["exportCatalog", "importCatalog", "downloadCatalog", "copyCatalog", "catalogJson", "catalogRaw", "catalogWarning"]) {
    assert.match(uiHtml, new RegExp(`id="${id}"`));
  }
  assert.match(uiJs, /type: "export-catalog"/);
  assert.match(uiJs, /type: "import-catalog", json/);
  assert.match(uiJs, /message\.type === "catalog-exported"/);
  assert.match(uiJs, /message\.type === "catalog-imported"/);
  assert.match(uiJs, /elements\.catalogWarning\.textContent/);
  assert.match(uiHtml, /<details class="catalog-raw" id="catalogRaw">/);
  assert.match(uiJs, /elements\.catalogRaw\.open = false/);
  assert.match(uiJs, /elements\.catalogRaw\.open = true/);
  assert.match(codeJs, /LibraryCatalog\.parse\(json\)/);
  assert.match(codeJs, /figma\.clientStorage\.setAsync\(catalogStorageKey\(entry\.id\), catalog\)/);
});

test("JSON 入口位于标题栏且导入成功隐藏旧导出结果", () => {
  const header = uiHtml.match(/<header class="header">([\s\S]*?)<\/header>/)[1];
  assert.match(header, /id="chooseCatalog"/);
  assert.match(header, /id="exportCatalog"/);
  assert.doesNotMatch(uiHtml, /id="catalogTools"|id="profileBadge"/);
  assert.match(uiJs, /elements\.chooseCatalog\.addEventListener\("click", \(\) => elements\.importCatalog\.click\(\)\)/);
  assert.match(uiJs, /message\.type === "catalog-imported"[\s\S]*?elements\.catalogExportResult\.hidden = true/);
});

test("安全规则默认收起但保留五项已有默认值", () => {
  assert.match(uiHtml, /<details class="safety-tools">/);
  for (const id of ["visibleOnly", "onlyUnbound", "exactSize"]) {
    assert.match(uiHtml, new RegExp(`id="${id}" type="checkbox" checked`));
  }
  for (const id of ["includeLowConfidence", "includeInstances"]) {
    assert.match(uiHtml, new RegExp(`id="${id}" type="checkbox"`));
  }
});

test("设计系统和字体同一行两列且确认区位于下方", () => {
  assert.match(uiHtml, /class="target-fields">[\s\S]*?id="profile"[\s\S]*?id="family"[\s\S]*?class="profile-confirmation"/);
  assert.match(uiCss, /\.target-fields\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(uiCss, /\.target-fields \[data-slot="native-select"\]\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?text-overflow:\s*ellipsis;/);
});

test("确认后隐藏重复摘要，切换候选和操作异常仍显示必要信息", () => {
  const controls = new Map();
  function control(id) {
    if (!controls.has(id)) controls.set(id, {
      value: "", options: ["Inter"], dataset: {}, handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      querySelectorAll() { return []; },
    });
    return controls.get(id);
  }
  const sandbox = {
    document: { getElementById: control, querySelector: () => control("scope") },
    window: {}, parent: { postMessage() {} },
  };
  vm.runInNewContext(uiJs, sandbox);
  const payload = {
    profileConfirmed: true, activeProfileId: "a", selectionCount: 0,
    profiles: [{ id: "a", name: "规范 A", summary: "文字 41", enabled: true }],
    families: ["Inter"], defaultFamily: "Inter", libraryEnabled: true, fontAvailable: true,
  };
  function message(type, data) {
    sandbox.window.onmessage({ data: { pluginMessage: { type, payload: data } } });
  }
  message("init", payload);
  assert.equal(control("profileConfirmation").hidden, true);
  assert.equal(control("statusDescription").hidden, true);
  control("profile").value = "b";
  control("profile").handlers.change();
  assert.equal(control("profileConfirmation").hidden, false);
  assert.equal(control("confirmProfile").disabled, false);
  assert.equal(control("scan").disabled, true);
  assert.equal(control("statusDescription").hidden, false);
  message("profile-selected", { ...payload, fontAvailable: false });
  assert.equal(control("profileConfirmation").hidden, true);
  assert.equal(control("statusDescription").hidden, false);
  assert.match(control("statusDescription").textContent, /无法使用目标字体/);
  control("exportCatalog").handlers.click();
  assert.equal(control("statusDescription").hidden, false);
  message("error", { message: "没有库访问权限" });
  assert.equal(control("statusDescription").hidden, false);
  assert.equal(control("statusDescription").textContent, "没有库访问权限");
});

test("范围选中描边完整且四类规范保持单行", () => {
  assert.match(
    uiCss,
    /\[data-slot="toggle-group-item"\]\[data-state="on"\]\s*\{[\s\S]*?z-index:\s*1;[\s\S]*?border-color:\s*var\(--foreground\);[\s\S]*?\}/,
  );
  assert.match(
    uiCss,
    /\.category-options\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);[\s\S]*?\}/,
  );
  assert.match(uiCss, /\[data-slot="field-set"\]\s*\{[\s\S]*?gap:\s*10px;/);
});

test("只有应用完成使用绿色，操作失败使用红色", () => {
  const applyResultBlock = uiJs.match(/if \(message\.type === "apply-result"\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.equal((applyResultBlock.match(/"success"/g) || []).length, 2);
  assert.doesNotMatch(uiJs.replace(applyResultBlock, ""), /"success"/);
  assert.match(uiJs, /setStatus\("应用完成", message\.payload\.message, "success"\)/);
  assert.match(uiJs, /setStatus\("操作未完成", message\.payload\.message, "error"\)/);
  assert.match(uiCss, /\[data-tone="success"\][\s\S]*var\(--success\)/);
  assert.match(uiCss, /\[data-tone="error"\][\s\S]*var\(--destructive\)/);
});
