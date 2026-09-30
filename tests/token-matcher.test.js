/**
 * [INPUT]: 依赖 Node.js test/assert、src/token-matcher.js 与 VDesign 数值 Token 目录
 * [OUTPUT]: 对外验证颜色语义消歧、近似保护、间距与圆角精确匹配及目录唯一性
 * [POS]: tests 的变量匹配回归套件，与 matcher.test.js 分别守护 Token 和文字样式决策
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { matchColorToken, matchNumberToken } = require("../src/token-matcher.js");
const tokens = require("../src/vdesign-tokens.js");

const black = { r: 0.125, g: 0.129, b: 0.141, a: 1 };
const colorCandidates = [
  { name: "color/base/black/800", value: black },
  { name: "color/text/text-default", value: black },
  { name: "color/border/border-default", value: black },
];

test("文字颜色在相同值候选中优先匹配 text 语义变量", () => {
  const result = matchColorToken(
    { property: "fills", nodeType: "TEXT", nodeName: "正文", color: black },
    colorCandidates,
  );
  assert.equal(result.matched, true);
  assert.equal(result.token.name, "color/text/text-default");
});

test("描边颜色在相同值候选中优先匹配 border 语义变量", () => {
  const result = matchColorToken(
    { property: "strokes", nodeType: "FRAME", nodeName: "卡片", color: black },
    colorCandidates,
  );
  assert.equal(result.token.name, "color/border/border-default");
});

test("默认拒绝近似但不相同的颜色", () => {
  const result = matchColorToken(
    { property: "fills", nodeType: "TEXT", nodeName: "正文", color: { ...black, r: 0.16 } },
    colorCandidates,
  );
  assert.equal(result.matched, false);
});

test("显式开启低置信度后允许阈值内的近似颜色", () => {
  const result = matchColorToken(
    { property: "fills", nodeType: "TEXT", nodeName: "正文", color: { ...black, r: 0.16 } },
    colorCandidates,
    { allowApproximate: true },
  );
  assert.equal(result.matched, true);
  assert.equal(result.confidence, "low");
});

test("间距使用 resolvedPx 精确匹配而不是变量名称数字", () => {
  const result = matchNumberToken(16, tokens.spacing);
  assert.equal(result.matched, true);
  assert.equal(result.token.name, "padding/padding 8");
});

test("目录包含唯一的 9 个圆角与 11 个间距变量 key", () => {
  assert.equal(tokens.radius.length, 9);
  assert.equal(tokens.spacing.length, 11);
  const keys = [...tokens.radius, ...tokens.spacing].map((token) => token.key);
  assert.equal(new Set(keys).size, 20);
  for (const key of keys) assert.match(key, /^[a-f0-9]{40}$/);
});
