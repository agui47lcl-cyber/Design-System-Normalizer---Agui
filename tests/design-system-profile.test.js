/**
 * [INPUT]: 依赖 Node.js test/assert 与 src/design-system-profile.js 的纯配置发现接口
 * [OUTPUT]: 对外验证 JSON 规范包、VDesign 预设、团队库分组、推荐边界和当前文件回退
 * [POS]: tests 的目标设计系统配置回归套件，阻止候选来源混淆或“启用即自动确认”
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LOCAL_PROFILE_ID,
  VDESIGN_PROFILE_ID,
  buildProfileCandidates,
  stableLibraryId,
} = require("../src/design-system-profile.js");

test("VDesign 始终作为兼容预设存在但未启用时不伪装为可用团队库", () => {
  const profiles = buildProfileCandidates({});
  const vdesign = profiles.find((profile) => profile.id === VDESIGN_PROFILE_ID);
  assert.ok(vdesign);
  assert.equal(vdesign.kind, "preset");
  assert.equal(vdesign.enabled, false);
  assert.equal(vdesign.recommended, false);
});

test("同一团队库的多个变量集合合并为一个候选", () => {
  const collections = [
    { key: "color-key", name: "Color", libraryName: "Acme Design System" },
    { key: "size-key", name: "Size", libraryName: "Acme Design System" },
  ];
  const profiles = buildProfileCandidates({ libraryCollections: collections });
  const acme = profiles.find((profile) => profile.id === stableLibraryId("Acme Design System"));
  assert.deepEqual(acme.variableCollectionKeys, ["color-key", "size-key"]);
  assert.equal(acme.recommended, true);
});

test("多个已启用团队库只列候选而不擅自推荐目标", () => {
  const profiles = buildProfileCandidates({
    libraryCollections: [
      { key: "a", name: "Tokens", libraryName: "Alpha" },
      { key: "b", name: "Tokens", libraryName: "Beta" },
    ],
  });
  assert.equal(profiles.some((profile) => profile.recommended), false);
});

test("没有团队库时可推荐已有资产的当前文件规范", () => {
  const profiles = buildProfileCandidates({ localStyleCount: 7, localVariableCount: 12 });
  const local = profiles.find((profile) => profile.id === LOCAL_PROFILE_ID);
  assert.equal(local.enabled, true);
  assert.equal(local.recommended, true);
  assert.match(local.summary, /7 个本地 Text Styles/);
});

test("启用 VDesign 时合并预设目录和团队变量集合", () => {
  const profiles = buildProfileCandidates({
    libraryCollections: [
      { key: "vdesign-key", name: "vzan", libraryName: "VDesign Web System" },
    ],
  });
  const vdesign = profiles.find((profile) => profile.id === VDESIGN_PROFILE_ID);
  assert.equal(vdesign.enabled, true);
  assert.equal(vdesign.recommended, true);
  assert.deepEqual(vdesign.variableCollectionKeys, ["vdesign-key"]);
});

test("导入规范包独立成为可选目标，不冒充当前文件或团队库", () => {
  const profiles = buildProfileCandidates({
    importedCatalogs: [{
      id: "catalog:abc", name: "Acme", counts: { text: 5, variables: 8, components: 3 },
    }],
    localStyleCount: 2,
  });
  const imported = profiles.find((profile) => profile.id === "catalog:abc");
  assert.equal(imported.kind, "catalog");
  assert.equal(imported.enabled, true);
  assert.equal(imported.recommended, false);
  assert.match(imported.summary, /文字 5 · 变量 8 · 组件 3/);
});
