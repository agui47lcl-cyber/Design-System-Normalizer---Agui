/**
 * [INPUT]: 依赖 Node.js test/assert 与 src/library-catalog.js 的纯 JSON 规范包契约
 * [OUTPUT]: 对外验证无文件 key 来源、旧版兼容、采集告警与资产往返及错误格式拒绝
 * [POS]: tests 的跨文件规范包回归套件，不依赖 Figma 运行环境
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const catalog = require("../src/library-catalog.js");

function fixture() {
  return {
    source: { fileKey: "abc/123", name: "Acme Design" },
    styles: {
      text: [{ key: "text-key", name: "Body", fontFamily: "Inter", fontStyle: "Regular", fontSize: 14 }],
      paint: [{ key: "paint-key", name: "Brand", paints: [{ type: "SOLID" }] }],
      effect: [{ key: "effect-key", name: "Shadow", effects: [] }],
      grid: [{ key: "grid-key", name: "Columns", layoutGrids: [] }],
    },
    variables: {
      collections: [{ key: "collection-key", name: "Color", modes: [{ id: "mode-1", name: "Light" }] }],
      items: [{ key: "variable-key", name: "Brand", collectionKey: "collection-key", resolvedType: "COLOR", valuesByMode: { "mode-1": { r: 1, g: 0, b: 0 } } }],
    },
    components: {
      sets: [{ key: "set-key", name: "Button", properties: { Size: { type: "VARIANT" } } }],
      items: [{ key: "component-key", name: "Button / Primary", componentSetKey: "set-key" }],
    },
  };
}

test("规范包往返保留四类样式、变量模式和组件关系", () => {
  const created = catalog.create(fixture());
  const parsed = catalog.parse(JSON.stringify(created));
  assert.deepEqual(parsed, created);
  assert.equal(parsed.format, catalog.FORMAT);
  assert.equal(parsed.version, catalog.VERSION);
  assert.equal(parsed.variables.items[0].valuesByMode["mode-1"].r, 1);
  assert.equal(parsed.components.items[0].componentSetKey, "set-key");
  assert.deepEqual(catalog.counts(parsed), {
    text: 1, paint: 1, effect: 1, grid: 1,
    variableCollections: 1, variables: 1, componentSets: 1, components: 1,
  });
  assert.equal(catalog.summary(parsed).id, "catalog:abc%2F123");
});

test("缺少 Figma 文件 key 时用资产 key 识别来源，并兼容旧版 JSON", () => {
  const withoutFileKey = fixture();
  delete withoutFileKey.source.fileKey;
  const created = catalog.create(withoutFileKey);
  assert.equal(created.source.id, "asset:text-key");
  assert.equal(created.source.fileKey, null);
  assert.equal(catalog.summary(created).id, "catalog:asset%3Atext-key");
  const legacy = catalog.create(fixture());
  legacy.version = 1;
  delete legacy.source.id;
  assert.equal(catalog.summary(catalog.parse(JSON.stringify(legacy))).id, "catalog:abc%2F123");
});

test("组件属性采集告警随 JSON 往返保留", () => {
  const input = fixture();
  input.warnings = [{
    kind: "component-property-definitions", key: "set-key", name: "Button",
    page: "Components", message: "Component set has existing errors",
  }];
  const parsed = catalog.parse(JSON.stringify(catalog.create(input)));
  assert.equal(parsed.warnings[0].name, "Button");
  assert.equal(catalog.summary(parsed).warningCount, 1);
});

test("拒绝损坏、异版、空资产及缺少文字元数据的 JSON", () => {
  assert.throws(() => catalog.parse("{"), /JSON 文件格式不正确/);
  assert.throws(() => catalog.parse(JSON.stringify({ ...catalog.create(fixture()), version: 3 })), /格式或版本/);
  const missingSource = catalog.create(fixture());
  delete missingSource.source.id;
  missingSource.source.fileKey = null;
  assert.throws(() => catalog.parse(JSON.stringify(missingSource)), /来源 ID/);
  const empty = fixture();
  empty.styles = { text: [], paint: [], effect: [], grid: [] };
  empty.variables = { collections: [], items: [] };
  empty.components = { sets: [], items: [] };
  assert.throws(() => catalog.create(empty), /没有可用资产/);
  const invalid = fixture();
  invalid.styles.text[0].fontFamily = "";
  assert.throws(() => catalog.create(invalid), /无效的文字样式/);
});
