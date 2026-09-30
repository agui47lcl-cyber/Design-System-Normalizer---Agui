/**
 * [INPUT]: 依赖 Node.js vm/test/assert 与 src 主线程模块、Figma API 的最小替身
 * [OUTPUT]: 对外验证规范包导入导出、单步目标切换及实例保护/已有绑定的扫描原因链路
 * [POS]: tests 的主线程契约测试，覆盖纯 JSON 契约之外的跨模块编排边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourceDir = path.resolve(__dirname, "../src");
const modules = [
  "library-catalog.js", "component-catalog.js", "design-system-profile.js", "scan-diagnostics.js", "matcher.js", "token-matcher.js",
  "vdesign-styles.js", "vdesign-tokens.js", "code.js",
].map((name) => fs.readFileSync(path.join(sourceDir, name), "utf8")).join("\n");

test("Figma 未提供 fileKey 时仍可导出并导入已确认的目标规范", async () => {
  const messages = [];
  const storage = new Map();
  const documentData = new Map();
  const style = {
    id: "style-local", key: "style-key", name: "Body", remote: false,
    fontName: { family: "Inter", style: "Regular" }, fontSize: 14,
    lineHeight: { unit: "AUTO" }, letterSpacing: { unit: "PIXELS", value: 0 },
    paragraphSpacing: 0, textCase: "ORIGINAL", textDecoration: "NONE",
  };
  const collection = {
    id: "collection-local", key: "collection-key", name: "Color", remote: false,
    modes: [{ modeId: "mode-light", name: "Light" }], defaultModeId: "mode-light",
  };
  const variable = {
    id: "variable-local", key: "variable-key", name: "Brand", remote: false,
    variableCollectionId: collection.id, resolvedType: "COLOR", scopes: ["ALL_FILLS"],
    valuesByMode: { "mode-light": { r: 1, g: 0, b: 0 } },
    resolveForConsumer: () => ({ resolvedType: "COLOR", value: { r: 1, g: 0, b: 0, a: 1 } }),
  };
  const componentSet = {
    type: "COMPONENT_SET", key: "set-key", name: "Button", remote: false,
    componentPropertyDefinitions: { Size: { type: "VARIANT", defaultValue: "Medium" } },
  };
  const variant = {
    type: "COMPONENT", key: "variant-key", name: "Size=Medium", remote: false,
    parent: componentSet,
    get componentPropertyDefinitions() {
      throw new Error("in get_componentPropertyDefinitions: Can only get component property definitions of a component set or non-variant component");
    },
  };
  const standalone = {
    type: "COMPONENT", key: "standalone-key", name: "Icon", remote: false,
    componentPropertyDefinitions: { Label: { type: "TEXT", defaultValue: "Icon" } },
  };
  const brokenSet = {
    type: "COMPONENT_SET", key: "broken-set-key", name: "Broken Button", remote: false,
    get componentPropertyDefinitions() {
      throw new Error("in get_componentPropertyDefinitions: Component set has existing errors");
    },
  };
  const figma = {
    showUI() {},
    ui: { postMessage(message) { messages.push(message); } },
    root: {
      name: "Acme Library",
      children: [{ name: "Components", findAll() {
        return [componentSet, variant, standalone, brokenSet];
      } }],
      getPluginData(key) { return documentData.get(key) || ""; },
      setPluginData(key, value) { documentData.set(key, value); },
    },
    currentPage: { selection: [] },
    listAvailableFontsAsync: async () => [{ fontName: style.fontName }],
    getLocalTextStylesAsync: async () => [style],
    getLocalPaintStylesAsync: async () => [],
    getLocalEffectStylesAsync: async () => [],
    getLocalGridStylesAsync: async () => [],
    loadAllPagesAsync: async () => {},
    variables: {
      getLocalVariableCollectionsAsync: async () => [collection],
      getLocalVariablesAsync: async () => [variable],
    },
    teamLibrary: { getAvailableLibraryVariableCollectionsAsync: async () => [] },
    clientStorage: {
      getAsync: async (key) => storage.get(key),
      setAsync: async (key, value) => { storage.set(key, value); },
    },
  };
  vm.runInNewContext(modules, { figma, __html__: "", console, setTimeout });
  await new Promise((resolve) => setImmediate(resolve));
  await figma.ui.onmessage({ type: "export-catalog" });
  const exported = messages.find((message) => message.type === "catalog-exported");
  assert.ok(exported);
  assert.equal(JSON.parse(exported.payload.json).source.fileKey, null);
  assert.equal(exported.payload.summary.counts.components, 2);
  assert.equal(exported.payload.summary.counts.componentSets, 2);
  assert.equal(exported.payload.summary.warningCount, 1);
  const exportedCatalog = JSON.parse(exported.payload.json);
  assert.equal(exportedCatalog.components.sets[0].properties.Size.type, "VARIANT");
  assert.equal(exportedCatalog.components.sets[1].definitionsStatus, "error");
  assert.deepEqual(exportedCatalog.components.sets[1].properties, {});
  assert.match(exportedCatalog.warnings[0].message, /Component set has existing errors/);
  assert.equal(exportedCatalog.warnings[0].name, "Broken Button");
  assert.equal(exportedCatalog.components.items[0].componentSetKey, "set-key");
  assert.deepEqual(exportedCatalog.components.items[0].properties, {});
  assert.equal(exportedCatalog.components.items[1].properties.Label.type, "TEXT");
  assert.equal(exported.payload.summary.counts.variables, 1);
  await figma.ui.onmessage({ type: "import-catalog", json: exported.payload.json });
  assert.ok(messages.some((message) => message.type === "catalog-imported"));
  const selected = messages.findLast((message) => message.type === "profile-selected");
  assert.equal(selected.payload.activeProfileId, "catalog:asset%3Astyle-key");
  assert.equal(selected.payload.profileConfirmed, true);
  assert.equal(storage.get("design-system-catalog-index")[0].name, "Acme Library");
  assert.equal(storage.get("design-system-catalog-index")[0].warningCount, 1);
  assert.equal(documentData.get("design-system-profile-id"), "catalog:asset%3Astyle-key");
  const instance = { id: "instance", type: "INSTANCE", name: "Card", parent: null, children: [] };
  const shape = { id: "shape", type: "RECTANGLE", name: "Background", parent: instance,
    fillStyleId: "", fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }] };
  instance.children.push(shape);
  figma.currentPage.selection = [instance];
  const settings = { profileId: selected.payload.activeProfileId, targetFamily: "Inter", scope: "selection",
    categories: { text: false, color: true, radius: false, spacing: false },
    visibleOnly: true, onlyUnbound: true, includeInstances: false, includeLowConfidence: false };
  await figma.ui.onmessage({ type: "scan", settings });
  let result = messages.findLast((message) => message.type === "scan-result").payload;
  assert.equal(result.matched, 0);
  assert.equal(result.diagnostics.available.color, 1);
  assert.equal(result.diagnostics.reasons.find((item) => item.code === "instance").count, 2);
  await figma.ui.onmessage({ type: "scan", settings: { ...settings, includeInstances: true } });
  result = messages.findLast((message) => message.type === "scan-result").payload;
  assert.equal(result.counts.color, 1);
  assert.equal(result.previews[0].confidence, "high");
  shape.fills[0].boundVariables = { color: { type: "VARIABLE_ALIAS", id: variable.id } };
  await figma.ui.onmessage({ type: "scan", settings: { ...settings, includeInstances: true } });
  result = messages.findLast((message) => message.type === "scan-result").payload;
  assert.equal(result.counts.color, 0);
  assert.equal(result.diagnostics.reasons.find((item) => item.code === "bound").count, 1);
});
