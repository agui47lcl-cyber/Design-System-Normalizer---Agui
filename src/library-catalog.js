/**
 * [INPUT]: 依赖组件库源文件中可读取的样式、变量和组件描述，以及导入的 JSON 文本
 * [OUTPUT]: 对外提供规范包构造、兼容校验、采集缺项告警、统计与稳定来源 ID
 * [POS]: src 的跨文件资产清单契约；保留组件采集告警，真实资产仍由 Figma key 导入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(function registerLibraryCatalog(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LibraryCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLibraryCatalog() {
  "use strict";

  const FORMAT = "agui-design-system-catalog";
  const VERSION = 2;

  function asText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function profileId(sourceId) {
    return `catalog:${encodeURIComponent(sourceId)}`;
  }

  function snapshotHash(value) {
    let hash = 2166136261;
    for (const character of JSON.stringify(value)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function sourceId(input, fileKey) {
    if (fileKey) return fileKey;
    const groups = [
      input.styles?.text, input.styles?.paint, input.styles?.effect, input.styles?.grid,
      input.variables?.collections, input.variables?.items,
      input.components?.sets, input.components?.items,
    ];
    for (const group of groups) {
      const key = asArray(group).map((item) => asText(item?.key)).find(Boolean);
      if (key) return `asset:${key}`;
    }
    return `snapshot:${snapshotHash(input)}`;
  }

  function create(input) {
    const source = input?.source || {};
    const fileKey = asText(source.fileKey);
    return validate({
      format: FORMAT,
      version: VERSION,
      source: {
        id: sourceId(input, fileKey),
        fileKey: fileKey || null,
        name: asText(source.name) || "未命名组件库",
        exportedAt: asText(source.exportedAt) || new Date().toISOString(),
      },
      styles: input.styles,
      variables: input.variables,
      components: input.components,
      warnings: input.warnings,
    });
  }

  function validate(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("规范包必须是 JSON 对象。");
    }
    if (raw.format !== FORMAT || ![1, VERSION].includes(raw.version)) {
      throw new Error("不是本插件支持的规范包格式或版本。");
    }
    const fileKey = asText(raw.source?.fileKey);
    const id = asText(raw.source?.id) || fileKey;
    if (!id || (raw.version === 1 && !fileKey)) {
      throw new Error("规范包缺少可识别的来源 ID。");
    }
    const source = {
      id,
      fileKey: fileKey || null,
      name: asText(raw.source?.name) || "未命名组件库",
      exportedAt: asText(raw.source?.exportedAt),
    };
    const styles = {};
    for (const kind of ["text", "paint", "effect", "grid"]) {
      if (!Array.isArray(raw.styles?.[kind])) throw new Error(`规范包缺少 ${kind} 样式清单。`);
      styles[kind] = raw.styles[kind].filter((item) => item && typeof item === "object");
    }
    if (!Array.isArray(raw.variables?.collections) || !Array.isArray(raw.variables?.items)) {
      throw new Error("规范包缺少变量集合或变量清单。");
    }
    if (!Array.isArray(raw.components?.sets) || !Array.isArray(raw.components?.items)) {
      throw new Error("规范包缺少组件集或组件清单。");
    }
    const textStyles = styles.text;
    if (textStyles.some((item) => !asText(item.name) || !asText(item.fontFamily) ||
      !Number.isFinite(Number(item.fontSize)))) {
      throw new Error("规范包包含无效的文字样式描述。");
    }
    const variables = {
      collections: raw.variables.collections.filter((item) => item && typeof item === "object"),
      items: raw.variables.items.filter((item) => item && typeof item === "object"),
    };
    const components = {
      sets: raw.components.sets.filter((item) => item && typeof item === "object"),
      items: raw.components.items.filter((item) => item && typeof item === "object"),
    };
    const warnings = asArray(raw.warnings).filter((item) =>
      item && typeof item === "object" && asText(item.message),
    ).map((item) => ({
      kind: asText(item.kind),
      key: asText(item.key),
      name: asText(item.name),
      page: asText(item.page),
      message: asText(item.message),
    }));
    const assetCount = Object.values(styles).reduce((sum, items) => sum + items.length, 0) +
      variables.items.length + components.items.length + components.sets.length;
    if (assetCount === 0) throw new Error("规范包没有可用资产；请在组件库源文件中导出。");
    return { format: FORMAT, version: raw.version, source, styles, variables, components, warnings };
  }

  function parse(json) {
    if (typeof json !== "string") throw new Error("请选择 JSON 规范包文件。");
    try {
      return validate(JSON.parse(json));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("JSON 文件格式不正确，无法解析。");
      throw error;
    }
  }

  function counts(catalog) {
    return {
      text: catalog.styles.text.length,
      paint: catalog.styles.paint.length,
      effect: catalog.styles.effect.length,
      grid: catalog.styles.grid.length,
      variableCollections: catalog.variables.collections.length,
      variables: catalog.variables.items.length,
      componentSets: catalog.components.sets.length,
      components: catalog.components.items.length,
    };
  }

  function summary(catalog) {
    const total = counts(catalog);
    return {
      id: profileId(catalog.source.id),
      name: catalog.source.name,
      sourceFileKey: catalog.source.fileKey,
      counts: total,
      warningCount: catalog.warnings.length,
    };
  }

  return { FORMAT, VERSION, counts, create, parse, profileId, summary, validate };
});
