/**
 * [INPUT]: 依赖 Node.js test/assert 与 ScanDiagnostics 的节点筛选和聚合接口
 * [OUTPUT]: 对外验证节点去重、祖先保护、已有绑定与规范读取失败的解释边界
 * [POS]: tests 的扫描诊断回归套件，避免把受保护节点误称为不符合规范或已经合规
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const diagnostics = require("../src/scan-diagnostics.js");

const available = { text: 35, color: 72, radius: 9, spacing: 11 };
const categories = { text: true, color: true, radius: true, spacing: true };
const matches = { text: [], color: [], radius: [], spacing: [] };

test("父子同时选中只扫描一次，未选择节点时拒绝选择范围扫描", () => {
  const child = { id: "child", type: "TEXT" };
  const parent = { id: "parent", type: "FRAME", children: [child] };
  const figma = { currentPage: { selection: [parent, child] } };
  assert.equal(diagnostics.collectSceneNodes("selection", figma).length, 2);
  figma.currentPage.selection = [];
  assert.throws(() => diagnostics.collectSceneNodes("selection", figma), /请先选择/);
});

test("祖先不可见与实例保护按节点计数，开启实例权限不放宽颜色精度", () => {
  const instance = { id: "instance", type: "INSTANCE" };
  const child = { id: "child", type: "TEXT", parent: instance };
  const skipped = [];
  assert.equal(diagnostics.filterNodes([instance, child], { visibleOnly: true }, skipped).length, 0);
  let summary = diagnostics.summarize(skipped, matches, available, [], categories);
  assert.equal(summary.reasons[0].count, 2);
  assert.equal(summary.reasons[0].unit, "节点");
  assert.match(summary.emptyTitle, /实例保护/);
  assert.equal(diagnostics.filterNodes([instance, child], { includeInstances: true }, []).length, 2);
  instance.visible = false;
  const hidden = [];
  diagnostics.filterNodes([child], { visibleOnly: true, includeInstances: true }, hidden);
  assert.equal(hidden[0].code, "hidden");
});

test("保留已有绑定不等于通过目标规范验收", () => {
  const skipped = [{ kind: "color", code: "bound", reason: "已有颜色绑定已保留" }];
  const summary = diagnostics.summarize(skipped, matches, available, [], categories);
  assert.match(summary.emptyTitle, /已有绑定已保留/);
  assert.match(summary.hint, /未检查是否属于当前目标规范/);
});

test("候选缺失和读取失败不能混同于没有颜色匹配", () => {
  const summary = diagnostics.summarize([], matches, { ...available, color: 0 }, ["导入失败"], categories);
  assert.equal(summary.variableFailures, 1);
  assert.equal(summary.reasons.find((item) => item.code === "missing").count, 0);
  assert.match(summary.emptyTitle, /读取失败/);
  assert.match(summary.hint, /不需要先开启近似匹配/);
});

test("解析异常和近似候选都进入扫描说明", () => {
  const skipped = [{ kind: "color", code: "unresolved", reason: "当前模式解析失败" }];
  const summary = diagnostics.summarize(skipped, { ...matches, color: [{ confidence: "low" }] }, available, [], categories);
  assert.equal(summary.reasons[0].unit, "次");
  assert.equal(summary.lowConfidence, 1);
  assert.equal(summary.reasons.find((item) => item.code === "approximate").count, 1);
});
