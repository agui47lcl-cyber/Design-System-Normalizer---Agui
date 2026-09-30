/**
 * [INPUT]: 依赖插件主线程提供的节点属性描述与已解析 VDesign 变量候选
 * [OUTPUT]: 对外提供 VDesignTokenMatcher，先筛选颜色精度再做语义消歧，并精确匹配数值 Token
 * [POS]: src 的纯 Token 匹配核心，不依赖 Figma 全局对象，与 matcher.js 分别处理变量和文字样式
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(function registerVDesignTokenMatcher(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.VDesignTokenMatcher = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTokenMatcher() {
  "use strict";

  function normalizeColor(value) {
    if (!value || !["number", "undefined"].includes(typeof value.a)) return null;
    const channels = [value.r, value.g, value.b];
    if (channels.some((channel) => !Number.isFinite(Number(channel)))) return null;
    return {
      r: Number(value.r),
      g: Number(value.g),
      b: Number(value.b),
      a: value.a === undefined ? 1 : Number(value.a),
    };
  }

  function colorDistance(left, right) {
    const a = normalizeColor(left);
    const b = normalizeColor(right);
    if (!a || !b) return Number.POSITIVE_INFINITY;
    return Math.sqrt(
      (a.r - b.r) ** 2 +
      (a.g - b.g) ** 2 +
      (a.b - b.b) ** 2 +
      (a.a - b.a) ** 2,
    );
  }

  function inferColorRole(descriptor) {
    if (descriptor.property === "strokes") return "stroke";
    if (descriptor.nodeType === "TEXT") return "text";
    const haystack = `${descriptor.nodeName || ""} ${descriptor.text || ""}`;
    if (/文字|文本|text|label|title|标题|正文|说明|提示/i.test(haystack)) return "text";
    if (/边框|分割|描边|border|stroke|divider/i.test(haystack)) return "stroke";
    if (/按钮|button|primary|brand|状态|status/i.test(haystack)) return "action";
    return "surface";
  }

  function semanticPenalty(role, name) {
    const normalized = String(name || "").toLowerCase();
    const isBase = /(^|\/)base(\/|$)/.test(normalized);
    if (role === "text") {
      if (/text|文字|标题|正文|辅助|注释/.test(normalized)) return 0;
      return isBase ? 7 : 14;
    }
    if (role === "stroke") {
      if (/border|stroke|divider|line|边框|分割/.test(normalized)) return 0;
      return isBase ? 6 : 13;
    }
    if (role === "action") {
      if (/brand|primary|blue|success|warning|danger|品牌|主色|蓝/.test(normalized)) return 0;
      return isBase ? 5 : 12;
    }
    if (/background|surface|container|layer|bg|背景|底色/.test(normalized)) return 0;
    if (/text|文字/.test(normalized)) return 22;
    return isBase ? 5 : 11;
  }

  function matchColorToken(descriptor, candidates, options) {
    const settings = {
      exactTolerance: 0.004,
      approximateTolerance: 0.08,
      allowApproximate: false,
      ...options,
    };
    const source = normalizeColor(descriptor.color);
    if (!source) return { matched: false, reason: "颜色值不可读" };
    const role = inferColorRole(descriptor);
    const scored = candidates
      .map((candidate) => {
        const distance = colorDistance(source, candidate.value);
        return {
          candidate,
          distance,
          score: distance * 1000 + semanticPenalty(role, candidate.name),
        };
      })
      .filter(({ distance }) => Number.isFinite(distance));
    const exact = scored.filter(({ distance }) => distance <= settings.exactTolerance);
    const eligible = exact.length ? exact : settings.allowApproximate
      ? scored.filter(({ distance }) => distance <= settings.approximateTolerance)
      : [];
    eligible.sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      return String(left.candidate.name).localeCompare(String(right.candidate.name), "zh-Hans-CN");
    });
    const winner = eligible[0];
    if (!winner) {
      return { matched: false, reason: "没有颜色值相符的目标变量" };
    }
    return {
      matched: true,
      token: winner.candidate,
      confidence: winner.distance <= settings.exactTolerance ? "high" : "low",
      rationale: { role, distance: winner.distance },
    };
  }

  function matchNumberToken(value, candidates, options) {
    const settings = { tolerance: 0.01, ...options };
    const source = Number(value);
    if (!Number.isFinite(source)) return { matched: false, reason: "数值不可读" };
    const scored = candidates
      .map((candidate) => ({
        candidate,
        delta: Math.abs(Number(candidate.resolvedPx) - source),
      }))
      .filter(({ delta }) => Number.isFinite(delta))
      .sort((left, right) => left.delta - right.delta);
    const winner = scored[0];
    if (!winner || winner.delta > settings.tolerance) {
      return { matched: false, reason: `没有 ${source}px 的目标变量` };
    }
    return { matched: true, token: winner.candidate, confidence: "high" };
  }

  return { colorDistance, inferColorRole, matchColorToken, matchNumberToken, normalizeColor };
});
