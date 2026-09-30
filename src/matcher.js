/**
 * [INPUT]: 依赖插件主线程提供的文字节点描述与本地 Text Style 描述
 * [OUTPUT]: 对外提供 FontStyleMatcher，完成语义角色、字重、字号与行高的确定性匹配
 * [POS]: src 的纯算法核心，不依赖 Figma 全局对象，可由 Node.js 回归测试直接验证
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(function registerFontStyleMatcher(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.FontStyleMatcher = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMatcher() {
  "use strict";

  const ROLE_PATTERNS = {
    heading: /标题|title|heading|headline|header|section|模块/i,
    label: /标签|label|button|按钮|tab|菜单|menu|操作|action|字段名/i,
    body: /正文|body|content|description|描述|说明|提示|文本/i,
  };

  function normalizeWeight(value) {
    const text = String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
    if (/black|heavy|extrabold|bold|semibold|demibold/.test(text)) return "Semibold";
    if (/medium|500/.test(text)) return "Medium";
    return "Regular";
  }

  function inferRole(node) {
    const haystack = `${node.name || ""} ${node.text || ""}`;
    if (ROLE_PATTERNS.heading.test(haystack)) return "heading";
    if (ROLE_PATTERNS.label.test(haystack)) return "label";
    if (ROLE_PATTERNS.body.test(haystack)) return "body";
    if (Number(node.fontSize) >= 16) return "heading";
    return "body";
  }

  function inferDesiredWeight(node, role) {
    const explicit = normalizeWeight(`${node.fontStyle || ""} ${node.fontWeight || ""}`);
    if (explicit !== "Regular") return explicit;
    if (role === "heading" || role === "label") return "Medium";
    return "Regular";
  }

  function styleRole(style) {
    const name = style.name || "";
    if (ROLE_PATTERNS.heading.test(name)) return "heading";
    if (ROLE_PATTERNS.label.test(name)) return "label";
    if (ROLE_PATTERNS.body.test(name)) return "body";
    return "unknown";
  }

  function lineHeightValue(lineHeight) {
    if (!lineHeight || lineHeight.unit === "AUTO") return null;
    return Number.isFinite(Number(lineHeight.value)) ? Number(lineHeight.value) : null;
  }

  function weightPenalty(desired, actual) {
    if (desired === actual) return 0;
    const penalties = {
      "Regular:Medium": 10,
      "Regular:Semibold": 26,
      "Medium:Regular": 8,
      "Medium:Semibold": 9,
      "Semibold:Medium": 7,
      "Semibold:Regular": 22,
    };
    return penalties[`${desired}:${actual}`] ?? 18;
  }

  function rolePenalty(desired, actual) {
    if (desired === actual) return 0;
    if (actual === "unknown") return 8;
    if (desired === "label" && actual === "body") return 7;
    return 24;
  }

  function matchTextNode(node, styles, options) {
    const settings = {
      targetFamily: "PingFang SC",
      exactSize: true,
      sizeTolerance: 0.25,
      ...options,
    };
    const fontSize = Number(node.fontSize);
    if (!Number.isFinite(fontSize)) {
      return { matched: false, reason: "混合字号或字号不可读" };
    }

    const familyStyles = styles.filter(
      (style) => style.fontFamily === settings.targetFamily && Number.isFinite(Number(style.fontSize)),
    );
    if (familyStyles.length === 0) {
      return { matched: false, reason: `没有 ${settings.targetFamily} 本地文字样式` };
    }

    const eligible = settings.exactSize
      ? familyStyles.filter(
          (style) => Math.abs(Number(style.fontSize) - fontSize) <= settings.sizeTolerance,
        )
      : familyStyles;
    if (eligible.length === 0) {
      return { matched: false, reason: `没有 ${fontSize}px 的目标文字样式` };
    }

    const role = inferRole(node);
    const desiredWeight = inferDesiredWeight(node, role);
    const sourceLineHeight = lineHeightValue(node.lineHeight);
    const scored = eligible.map((style) => {
      const sizeDelta = Math.abs(Number(style.fontSize) - fontSize);
      const targetLineHeight = lineHeightValue(style.lineHeight);
      const lineDelta =
        sourceLineHeight === null || targetLineHeight === null
          ? 2
          : Math.abs(sourceLineHeight - targetLineHeight);
      const actualWeight = normalizeWeight(style.fontStyle);
      const score =
        sizeDelta * 100 +
        lineDelta * 2 +
        weightPenalty(desiredWeight, actualWeight) +
        rolePenalty(role, styleRole(style));
      return { style, score, actualWeight, targetLineHeight };
    });

    scored.sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      return left.style.name.localeCompare(right.style.name, "zh-Hans-CN");
    });
    const winner = scored[0];
    const exactWeight = winner.actualWeight === desiredWeight;
    const exactRole = styleRole(winner.style) === role;
    return {
      matched: true,
      style: winner.style,
      score: winner.score,
      confidence: exactWeight && exactRole ? "high" : winner.score <= 18 ? "medium" : "low",
      rationale: {
        role,
        desiredWeight,
        sourceFontSize: fontSize,
        sourceLineHeight,
        targetLineHeight: winner.targetLineHeight,
      },
    };
  }

  return {
    inferRole,
    normalizeWeight,
    matchTextNode,
  };
});
