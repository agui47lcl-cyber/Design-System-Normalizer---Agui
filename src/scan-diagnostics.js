/**
 * [INPUT]: 依赖主线程提供的节点树、扫描配置、匹配记录、候选数量与变量导入失败信息
 * [OUTPUT]: 对外提供 ScanDiagnostics，统一节点保护筛选、跳过记录与面向 UI 的原因聚合
 * [POS]: src 的扫描解释边界；不导入资产或写入节点，防止保护规则和空结果说明各自演化
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(function registerScanDiagnostics(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ScanDiagnostics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createScanDiagnostics() {
  "use strict";

  function collectSceneNodes(scope, figma) {
    const roots = scope === "page" ? [figma.currentPage] : [...figma.currentPage.selection];
    if (scope === "selection" && roots.length === 0) {
      throw new Error("请先选择一个或多个画板，或者切换到“当前页面”范围。");
    }
    const nodes = new Map();
    function visit(node) {
      if (node.type !== "PAGE" && node.type !== "DOCUMENT") nodes.set(node.id, node);
      if ("children" in node) for (const child of node.children) visit(child);
    }
    for (const root of roots) visit(root);
    return [...nodes.values()];
  }

  function protectionReason(node, settings) {
    let hidden = false;
    let instance = false;
    for (let current = node; current && !["PAGE", "DOCUMENT"].includes(current.type); current = current.parent) {
      hidden ||= current.visible === false;
      instance ||= current.type === "INSTANCE";
    }
    if (settings.visibleOnly && hidden) return { code: "hidden", reason: "不可见节点已跳过" };
    if (!settings.includeInstances && instance) return { code: "instance", reason: "实例保护，内部属性未参与扫描" };
    return null;
  }

  function record(skipped, kind, node, code, reason) {
    skipped.push({ kind, id: node.id, code, reason });
  }

  function filterNodes(nodes, settings, skipped) {
    return nodes.filter((node) => {
      const reason = protectionReason(node, settings);
      if (!reason) return true;
      record(skipped, "node", node, reason.code, reason.reason);
      return false;
    });
  }

  function summarize(skipped, matches, available, failures, categories) {
    const groups = new Map();
    for (const item of skipped) {
      const unit = item.kind === "node" ? "节点" : item.code === "unresolved" ? "次" : "属性";
      const key = `${unit}:${item.code || "unmatched"}:${item.reason}`;
      if (!groups.has(key)) groups.set(key, { code: item.code || "unmatched", reason: item.reason, count: 0, unit });
      groups.get(key).count += 1;
    }
    const reasons = [...groups.values()];
    const labels = { text: "文字样式", color: "颜色变量", radius: "圆角变量", spacing: "间距变量" };
    for (const kind of Object.keys(labels)) {
      if (categories[kind] && available[kind] === 0) {
        reasons.push({ code: "missing", reason: `目标规范没有可用${labels[kind]}`, count: 0, unit: "候选" });
      }
    }
    if (failures.length) reasons.push({
      code: "read-failure", reason: "变量导入失败，请检查源库访问权限", count: failures.length, unit: "变量",
    });
    const lowConfidence = Object.values(matches).flat().filter((item) => item.confidence === "low").length;
    if (lowConfidence) reasons.push({
      code: "approximate", reason: "近似或低置信度候选，应用前请检查预览", count: lowConfidence, unit: "属性",
    });
    let emptyTitle = "没有新增可绑定项";
    let hint = "请查看扫描说明；没有新增绑定不代表画稿中没有规范颜色。";
    if (reasons.some((item) => ["read-failure", "unresolved", "missing"].includes(item.code))) {
      emptyTitle = "规范候选缺失或读取失败";
      hint = "检查所选规范、变量模式及源库访问权限，不需要先开启近似匹配。";
    } else if (reasons.some((item) => item.code === "instance")) {
      emptyTitle = "没有新增绑定，部分节点受实例保护";
      hint = "如需处理实例内部属性，可在安全规则中勾选对应选项后重新扫描。";
    } else if (reasons.length && reasons.every((item) => item.code === "bound")) {
      emptyTitle = "已有绑定已保留，无需重复应用";
      hint = "已有绑定未检查是否属于当前目标规范；这里只说明保留规则生效。";
    }
    return { available, reasons, lowConfidence, variableFailures: failures.length, emptyTitle, hint };
  }

  return { collectSceneNodes, filterNodes, record, summarize };
});
