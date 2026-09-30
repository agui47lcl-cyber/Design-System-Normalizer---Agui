/**
 * [INPUT]: 依赖 Node.js test/assert/fs/path/vm、manifest.json 与 src 的 UI 结构、样式和交互源码
 * [OUTPUT]: 对外验证单步目标选择、加载隔离、配置变更失效、扫描说明与安全默认值
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

function uiHarness() {
  const controls = new Map();
  const sent = [];
  function control(id) {
    if (!controls.has(id)) controls.set(id, {
      value: "", hidden: true, checked: true, options: ["Inter"], dataset: {}, handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      querySelectorAll() { return []; },
    });
    return controls.get(id);
  }
  const sandbox = {
    document: { getElementById: control, querySelector: () => control("scope") },
    window: {}, parent: { postMessage(message) { sent.push(message.pluginMessage); } },
  };
  vm.runInNewContext(uiJs, sandbox);
  const message = (type, payload) => sandbox.window.onmessage({ data: { pluginMessage: { type, payload } } });
  return { control, message, sent };
}

const readyPayload = {
  profileConfirmed: true, activeProfileId: "a", selectionCount: 0,
  profiles: [{ id: "a", name: "规范 A", kind: "library", enabled: true },
    { id: "b", name: "规范 B", kind: "library", enabled: true }],
  families: ["Inter"], defaultFamily: "Inter", libraryEnabled: true, fontAvailable: true,
};

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

test("目标下拉框选择即生效并在用户与文件两级记忆", () => {
  assert.match(uiHtml, /id="profile"/);
  assert.doesNotMatch(uiHtml, /id="confirmProfile"|id="profileConfirmation"|id="profileSummary"/);
  assert.match(uiJs, /type:\s*"select-profile"/);
  assert.match(uiJs, /从下拉框选择即生效，无需再次确认/);
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
  assert.doesNotMatch(header, /<h1|class="description"/);
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

test("设计系统和字体同一行两列且没有二次确认区", () => {
  assert.match(uiHtml, /class="target-fields">[\s\S]*?id="profile"[\s\S]*?id="family"/);
  assert.doesNotMatch(uiHtml, /class="profile-confirmation"/);
  assert.match(uiCss, /\.target-fields\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(uiCss, /\.target-fields \[data-slot="native-select"\]\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?text-overflow:\s*ellipsis;/);
});

test("切换目标直接发送一次选择消息，加载期间禁止扫描与重入", () => {
  const { control, message, sent } = uiHarness();
  message("init", readyPayload);
  assert.equal(control("status").hidden, true);
  assert.equal(control("statusDescription").hidden, true);
  control("profile").value = "b";
  control("profile").handlers.change();
  assert.equal(control("status").hidden, false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "select-profile");
  assert.equal(sent[0].profileId, "b");
  assert.equal(control("profile").disabled, true);
  assert.equal(control("scan").disabled, true);
  assert.equal(control("statusDescription").hidden, false);
  assert.equal(control("status").hidden, false);
  control("profile").handlers.change();
  assert.equal(sent.length, 1);
  message("profile-selected", { ...readyPayload, activeProfileId: "b", fontAvailable: false });
  assert.equal(control("profile").disabled, false);
  assert.equal(control("scan").disabled, false);
  assert.equal(control("statusDescription").hidden, false);
  assert.match(control("statusDescription").textContent, /无法使用目标字体/);
  control("exportCatalog").handlers.click();
  assert.equal(control("statusDescription").hidden, false);
  message("error", { message: "没有库访问权限" });
  assert.equal(control("status").hidden, false);
  assert.equal(control("statusDescription").hidden, false);
  assert.equal(control("statusDescription").textContent, "没有库访问权限");
});

test("首次打开不擅自确认推荐项，用户可以直接选择同一候选", () => {
  const { control, message, sent } = uiHarness();
  message("init", { ...readyPayload, profileConfirmed: false });
  assert.equal(control("profile").value, "");
  assert.equal(control("status").hidden, true);
  assert.match(control("profile").innerHTML, /请选择目标设计系统/);
  assert.equal(control("scan").disabled, true);
  assert.equal(sent.length, 0);
  control("profile").value = "a";
  control("profile").handlers.change();
  assert.equal(sent[0].profileId, "a");
  message("error", { message: "读取失败" });
  assert.equal(control("profile").disabled, false);
  assert.equal(control("scan").disabled, true);
});

test("安全选项勾选即生效，不弹确认并禁用旧预览的应用按钮", () => {
  const { control, message, sent } = uiHarness();
  message("init", readyPayload);
  message("scan-result", { matched: 1, counts: { color: 1 }, previews: [{ kind: "color", target: "色", source: "节点", confidence: "high" }],
    totalNodes: 1, profileName: "规范 A", warnings: [] });
  assert.equal(control("apply").disabled, false);
  control("includeInstances").handlers.change();
  assert.equal(sent.length, 0);
  assert.equal(control("apply").disabled, true);
  assert.equal(control("resultSection").hidden, true);
  assert.equal(control("scan").disabled, false);
  assert.doesNotMatch(uiJs, /window\.confirm|\bconfirm\(/);
});

test("空结果展开原因说明，不再笼统显示无安全匹配", () => {
  const { control, message } = uiHarness();
  message("init", readyPayload);
  message("scan-result", { matched: 0, counts: {}, previews: [], totalNodes: 299, profileName: "规范 A", warnings: [],
    diagnostics: { available: { text: 35, color: 72, radius: 9, spacing: 11 }, variableFailures: 0,
      reasons: [{ code: "instance", reason: "实例保护", count: 299, unit: "节点" }], emptyTitle: "部分节点受实例保护", hint: "勾选实例权限后重扫" } });
  assert.equal(control("scanDiagnostics").open, true);
  assert.match(control("scanReasons").innerHTML, /实例保护：299 节点/);
  assert.match(control("preview").innerHTML, /部分节点受实例保护/);
  assert.equal(control("resultBadge").textContent, "无新增绑定");
});

test("范围描边完整，四类规范无外框左对齐且标题间距统一", () => {
  assert.match(
    uiCss,
    /\[data-slot="toggle-group-item"\]\[data-state="on"\]\s*\{[\s\S]*?z-index:\s*1;[\s\S]*?border-color:\s*var\(--foreground\);[\s\S]*?\}/,
  );
  assert.match(
    uiCss,
    /\.category-options\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);[\s\S]*?\}/,
  );
  assert.match(uiCss, /\[data-slot="field-set"\]\s*\{[\s\S]*?gap:\s*10px;/);
  assert.match(uiHtml, /<fieldset data-slot="field-set" class="category-set">/);
  assert.match(uiCss, /--field-control-gap:\s*7px;/);
  assert.match(uiCss, /\[data-slot="field"\]\s*\{[^}]*gap:\s*var\(--field-control-gap\);/);
  assert.match(uiCss, /\.category-set > \[data-slot="field-legend"\]\s*\{[^}]*margin-bottom:\s*var\(--field-control-gap\);/);
  assert.doesNotMatch(uiCss.match(/\.category-options\s*\{([^}]*)\}/)[1], /border:/);
  assert.doesNotMatch(uiCss.match(/\.category-field\s*\{([^}]*)\}/)[1], /border:/);
  assert.match(uiCss, /\.category-field\s*\{[^}]*padding:\s*0;/);
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
