/**
 * [INPUT]: 依赖 Node.js test/assert、src/matcher.js 的纯匹配接口与 VDesign 样式目录
 * [OUTPUT]: 对外验证 VDesign 目录完整性以及文字角色、字重、字号保护的确定性行为
 * [POS]: tests 的匹配与目录回归套件，阻止样式桥梁或自动替换策略在演进中失真
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { matchTextNode } = require("../src/matcher.js");
const vdesignStyles = require("../src/vdesign-styles.js");

const styles = [
  {
    id: "body-14-regular",
    name: "正文/14/14·Regular",
    fontFamily: "PingFang SC",
    fontStyle: "Regular",
    fontSize: 14,
    lineHeight: { unit: "PIXELS", value: 22 },
  },
  {
    id: "body-14-medium",
    name: "正文/14/14·Medium",
    fontFamily: "PingFang SC",
    fontStyle: "Medium",
    fontSize: 14,
    lineHeight: { unit: "PIXELS", value: 22 },
  },
  {
    id: "heading-20-medium",
    name: "标题/20/20·Medium",
    fontFamily: "PingFang SC",
    fontStyle: "Medium",
    fontSize: 20,
    lineHeight: { unit: "PIXELS", value: 28 },
  },
  {
    id: "label-11-medium",
    name: "标签/11/11·Medium",
    fontFamily: "PingFang SC",
    fontStyle: "Medium",
    fontSize: 11,
    lineHeight: { unit: "PIXELS", value: 18 },
  },
];

test("VDesign 目录包含 35 个可导入的 PingFang SC 样式", () => {
  assert.equal(vdesignStyles.length, 35);
  assert.equal(new Set(vdesignStyles.map((style) => style.key)).size, 35);
  for (const style of vdesignStyles) {
    assert.equal(style.fontFamily, "PingFang SC");
    assert.equal(style.source, "catalog");
    assert.match(style.key, /^[a-f0-9]{40}$/);
  }
});

test("页面标题优先匹配相同字号的标题 Medium 样式", () => {
  const result = matchTextNode(
    {
      name: "页面标题",
      text: "创建商品",
      fontStyle: "Regular",
      fontSize: 20,
      lineHeight: { unit: "PIXELS", value: 28 },
    },
    styles,
  );
  assert.equal(result.matched, true);
  assert.equal(result.style.id, "heading-20-medium");
});

test("正文保留 Regular 语义", () => {
  const result = matchTextNode(
    {
      name: "描述",
      text: "这里是一段商品说明",
      fontStyle: "Regular",
      fontSize: 14,
      lineHeight: { unit: "PIXELS", value: 22 },
    },
    styles,
  );
  assert.equal(result.style.id, "body-14-regular");
});

test("标签文字优先匹配标签 Medium 样式", () => {
  const result = matchTextNode(
    {
      name: "标签文字",
      text: "基础信息",
      fontStyle: "Regular",
      fontSize: 11,
      lineHeight: { unit: "PIXELS", value: 18 },
    },
    styles,
  );
  assert.equal(result.style.id, "label-11-medium");
});

test("默认不把 15px 文字近似替换成 14px", () => {
  const result = matchTextNode(
    {
      name: "正文",
      text: "保持原字号",
      fontStyle: "Regular",
      fontSize: 15,
      lineHeight: { unit: "PIXELS", value: 22 },
    },
    styles,
  );
  assert.equal(result.matched, false);
  assert.match(result.reason, /没有 15px/);
});

test("目标字体没有文字样式时明确返回未匹配", () => {
  const result = matchTextNode(
    {
      name: "正文",
      text: "示例",
      fontStyle: "Regular",
      fontSize: 14,
      lineHeight: { unit: "PIXELS", value: 22 },
    },
    styles,
    { targetFamily: "Unknown Font" },
  );
  assert.equal(result.matched, false);
  assert.match(result.reason, /没有 Unknown Font/);
});
