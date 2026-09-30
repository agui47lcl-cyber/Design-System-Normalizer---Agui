/**
 * [INPUT]: 依赖已载入页面的 Figma Component/Component Set 节点及其可读取的属性定义
 * [OUTPUT]: 对外提供组件与组件集清单，并报告损坏组件集导致的属性定义缺项
 * [POS]: src 的组件采集边界；隔离 Figma getter 异常，避免一个坏组件阻断样式和变量导出
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(function registerComponentCatalog(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ComponentCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createComponentCatalog() {
  "use strict";

  function capture(pages) {
    const sets = [];
    const items = [];
    const warnings = [];
    for (const page of pages) {
      for (const node of page.findAll((item) =>
        item.type === "COMPONENT" || item.type === "COMPONENT_SET")) {
        if (node.remote) continue;
        const variant = node.type === "COMPONENT" && node.parent?.type === "COMPONENT_SET";
        let properties = {};
        let definitionsStatus = variant ? "inherited" : "available";
        if (!variant) {
          try {
            properties = JSON.parse(JSON.stringify(node.componentPropertyDefinitions || {}));
          } catch (error) {
            definitionsStatus = "error";
            warnings.push({
              kind: "component-property-definitions",
              key: node.key || "",
              name: node.name,
              page: page.name,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
        const entry = {
          key: node.key || "",
          name: node.name,
          description: node.description || "",
          page: page.name,
          properties,
          definitionsStatus,
        };
        if (node.type === "COMPONENT_SET") sets.push(entry);
        else items.push({
          ...entry,
          componentSetKey: variant ? node.parent.key || "" : "",
        });
      }
    }
    return { sets, items, warnings };
  }

  return { capture };
});
