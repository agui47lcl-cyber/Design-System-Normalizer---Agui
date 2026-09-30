/**
 * [INPUT]: 依赖 Figma Plugin API、规范包/设计系统配置、ScanDiagnostics、匹配器与 VDesign 预设
 * [OUTPUT]: 对外提供规范包、目标选择、可解释扫描及四类绑定，校验 UI 高度请求并固定窗口宽度
 * [POS]: src 的插件主线程，编排跨文件资产清单、用户目标、匹配计划与文档写入，UI 只消费结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
"use strict";

const WINDOW_SIZE = { width: 440, height: 760, minHeight: 480, maxHeight: 1040 };
figma.showUI(__html__, { width: WINDOW_SIZE.width, height: WINDOW_SIZE.height, themeColors: true });
figma.skipInvisibleInstanceChildren = false;

const TOKEN_KINDS = ["text", "color", "radius", "spacing"];
const SPACING_FIELDS = [
  "itemSpacing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "counterAxisSpacing",
];
const CORNER_FIELDS = [
  "topLeftRadius",
  "topRightRadius",
  "bottomRightRadius",
  "bottomLeftRadius",
];

const PROFILE_STORAGE_KEY = "design-system-profile-id";
const CATALOG_INDEX_STORAGE_KEY = "design-system-catalog-index";
const CATALOG_STORAGE_PREFIX = "design-system-catalog:";
let discoveryContextPromise;
let activeProfileId = null;
const profileContextPromises = new Map();
const profileVariablesPromises = new Map();

function serializeLineHeight(value) {
  if (!value || value === figma.mixed) return null;
  if (value.unit === "AUTO") return { unit: "AUTO" };
  return { unit: value.unit, value: value.value };
}

function describeTextNode(node) {
  const fontName = node.fontName === figma.mixed ? null : node.fontName;
  return {
    id: node.id,
    name: node.name,
    text: node.characters.slice(0, 80),
    fontFamily: fontName ? fontName.family : null,
    fontStyle: fontName ? fontName.style : null,
    fontSize: node.fontSize === figma.mixed ? null : node.fontSize,
    fontWeight: node.fontWeight === figma.mixed ? null : node.fontWeight,
    lineHeight: serializeLineHeight(node.lineHeight),
  };
}

function describeTextStyle(style) {
  return {
    id: style.id,
    key: style.key,
    name: style.name,
    fontFamily: style.fontName.family,
    fontStyle: style.fontName.style,
    fontSize: style.fontSize,
    lineHeight: serializeLineHeight(style.lineHeight),
    source: "local",
  };
}

function styleIdentity(style) {
  return `${style.fontFamily}::${style.name}::${style.fontStyle}::${style.fontSize}`;
}

function mergeStyleCatalog(localStyles) {
  const merged = new Map();
  for (const style of globalThis.VDesignTextStyles || []) {
    merged.set(styleIdentity(style), style);
  }
  for (const style of localStyles.map(describeTextStyle)) {
    merged.set(styleIdentity(style), style);
  }
  return [...merged.values()];
}

function catalogStorageKey(profileId) {
  return `${CATALOG_STORAGE_PREFIX}${profileId}`;
}

function serializable(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

async function captureLibraryCatalog() {
  const [textStyles, paintStyles, effectStyles, gridStyles, collections, variables] = await Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync(),
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);
  await figma.loadAllPagesAsync();
  const components = globalThis.ComponentCatalog.capture(figma.root.children);
  const localVariables = variables.filter((variable) => !variable.remote);
  const keysById = new Map(localVariables.map((variable) => [variable.id, variable.key]));
  const normalizeModeValue = (value) => value?.type === "VARIABLE_ALIAS"
    ? { type: "VARIABLE_ALIAS", key: keysById.get(value.id) || "" }
    : serializable(value);
  const catalog = globalThis.LibraryCatalog.create({
    source: { fileKey: figma.fileKey, name: figma.root.name },
    styles: {
      text: textStyles.filter((style) => !style.remote).map((style) => ({
        ...describeTextStyle(style),
        description: style.description || "",
        letterSpacing: serializable(style.letterSpacing),
        paragraphSpacing: style.paragraphSpacing,
        textCase: style.textCase,
        textDecoration: style.textDecoration,
      })),
      paint: paintStyles.filter((style) => !style.remote).map((style) => ({
        key: style.key || "", name: style.name, description: style.description || "",
        paints: serializable(style.paints),
      })),
      effect: effectStyles.filter((style) => !style.remote).map((style) => ({
        key: style.key || "", name: style.name, description: style.description || "",
        effects: serializable(style.effects),
      })),
      grid: gridStyles.filter((style) => !style.remote).map((style) => ({
        key: style.key || "", name: style.name, description: style.description || "",
        layoutGrids: serializable(style.layoutGrids),
      })),
    },
    variables: {
      collections: collections.filter((collection) => !collection.remote).map((collection) => ({
        key: collection.key || "", name: collection.name,
        modes: collection.modes.map((mode) => ({ id: mode.modeId, name: mode.name })),
        defaultModeId: collection.defaultModeId,
      })),
      items: localVariables.map((variable) => ({
        key: variable.key || "", name: variable.name,
        description: variable.description || "",
        collectionKey: collections.find((collection) =>
          collection.id === variable.variableCollectionId)?.key || "",
        resolvedType: variable.resolvedType,
        scopes: [...(variable.scopes || [])],
        valuesByMode: Object.fromEntries(Object.entries(variable.valuesByMode || {}).map(
          ([modeId, value]) => [modeId, normalizeModeValue(value)],
        )),
      })),
    },
    components: { sets: components.sets, items: components.items },
    warnings: components.warnings,
  });
  figma.ui.postMessage({
    type: "catalog-exported",
    payload: {
      json: JSON.stringify(catalog, null, 2),
      summary: globalThis.LibraryCatalog.summary(catalog),
      warnings: catalog.warnings,
    },
  });
}

async function loadDiscoveryContext() {
  if (discoveryContextPromise) return discoveryContextPromise;
  discoveryContextPromise = (async () => {
    const [fonts, localStyles, localVariables, localCollections, libraryCollections, importedCatalogs] = await Promise.all([
      figma.listAvailableFontsAsync(),
      figma.getLocalTextStylesAsync(),
      figma.variables.getLocalVariablesAsync(),
      figma.variables.getLocalVariableCollectionsAsync(),
      figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync(),
      figma.clientStorage.getAsync(CATALOG_INDEX_STORAGE_KEY),
    ]);
    const collectionsById = new Map(localCollections.map((collection) => [collection.id, collection]));
    const localOnlyVariables = localVariables.filter((variable) => {
      const collection = collectionsById.get(variable.variableCollectionId);
      return collection && !collection.remote;
    });
    const profiles = globalThis.DesignSystemProfiles.buildProfileCandidates({
      libraryCollections,
      localStyleCount: localStyles.filter((style) => !style.remote).length,
      localVariableCount: localOnlyVariables.length,
      vdesignPreset: globalThis.VDesignTokens,
      importedCatalogs: Array.isArray(importedCatalogs) ? importedCatalogs : [],
    });
    return {
      fonts,
      fontKeys: new Set(fonts.map((font) => `${font.fontName.family}::${font.fontName.style}`)),
      localStyles,
      localVariables,
      localCollections,
      libraryCollections,
      collectionsById,
      profiles,
    };
  })();
  return discoveryContextPromise;
}

async function loadProfileContext(profileId) {
  if (profileContextPromises.has(profileId)) return profileContextPromises.get(profileId);
  const promise = (async () => {
    const discovery = await loadDiscoveryContext();
    const profile = globalThis.DesignSystemProfiles.findProfile(discovery.profiles, profileId);
    if (!profile) throw new Error("目标设计系统不存在，请重新选择。");
    const importedCatalog = profile.kind === "catalog"
      ? await figma.clientStorage.getAsync(catalogStorageKey(profile.id))
      : null;
    if (profile.kind === "catalog" && !importedCatalog) {
      throw new Error("规范包缓存已丢失，请重新导入 JSON 文件。");
    }
    const libraryLists = await Promise.all(
      profile.variableCollectionKeys.map((key) =>
        figma.teamLibrary.getVariablesInLibraryCollectionAsync(key),
      ),
    );
    const libraryVariables = importedCatalog
      ? importedCatalog.variables.items.filter((variable) => variable.key)
      : libraryLists.flat();
    const libraryKeys = new Set(libraryVariables.map((variable) => variable.key));
    const tokenCatalog = globalThis.VDesignTokens;
    const localProfileVariables = discovery.localVariables.filter((variable) => {
      const collection = discovery.collectionsById.get(variable.variableCollectionId);
      if (profile.kind === "local") return collection && !collection.remote;
      if (profile.kind === "catalog") return libraryKeys.has(variable.key);
      if (libraryKeys.has(variable.key)) return true;
      return profile.catalog === "vdesign" && (
        collection?.name === tokenCatalog.collectionName ||
        tokenCatalog.colorNamePattern.test(variable.name)
      );
    });
    const rawStyles = importedCatalog
      ? importedCatalog.styles.text.filter((style) => style.key).map((style) => ({
        ...style, source: "catalog",
      }))
      : profile.catalog === "vdesign"
      ? mergeStyleCatalog(discovery.localStyles)
      : discovery.localStyles
        .filter((style) => profile.kind !== "local" || !style.remote)
        .map(describeTextStyle);
    const families = [...new Set(rawStyles.map((style) => style.fontFamily))].sort((left, right) =>
      left.localeCompare(right, "zh-Hans-CN"),
    );
    return {
      ...discovery,
      profile,
      importedCatalog,
      styles: rawStyles,
      families,
      libraryVariables,
      localProfileVariables,
    };
  })();
  profileContextPromises.set(profileId, promise);
  return promise;
}

async function loadProfileVariables(context) {
  if (profileVariablesPromises.has(context.profile.id)) {
    return profileVariablesPromises.get(context.profile.id);
  }
  const promise = (async () => {
    const localKeys = new Set(context.localProfileVariables.map((variable) => variable.key).filter(Boolean));
    const descriptors = context.libraryVariables.filter((variable) =>
      ["COLOR", "FLOAT"].includes(variable.resolvedType) && !localKeys.has(variable.key),
    );
    const results = await Promise.all(descriptors.map(async (descriptor) => {
      try {
        return { variable: await figma.variables.importVariableByKeyAsync(descriptor.key) };
      } catch (error) {
        return { error: `${descriptor.name}: ${error instanceof Error ? error.message : String(error)}` };
      }
    }));
    return {
      variables: [...context.localProfileVariables, ...results.map((result) => result.variable).filter(Boolean)],
      failures: results.map((result) => result.error).filter(Boolean),
    };
  })();
  profileVariablesPromises.set(context.profile.id, promise);
  return promise;
}

function hasBoundVariable(node, field, index) {
  const binding = node.boundVariables?.[field];
  if (index === undefined) return Boolean(binding);
  return Boolean(Array.isArray(binding) && binding[index]);
}

function scopeAllowsColor(variable, property, nodeType) {
  const scopes = variable.scopes || [];
  if (scopes.length === 0 || scopes.includes("ALL_SCOPES") || scopes.includes("ALL_FILLS")) {
    return true;
  }
  if (property === "strokes") return scopes.includes("STROKE_COLOR");
  if (nodeType === "TEXT") return scopes.includes("TEXT_FILL");
  if (nodeType === "FRAME" || nodeType === "INSTANCE" || nodeType === "COMPONENT") {
    return scopes.includes("FRAME_FILL") || scopes.includes("SHAPE_FILL");
  }
  return scopes.includes("SHAPE_FILL") || scopes.includes("FRAME_FILL");
}

function resolveColorCandidates(variables, node, property, skipped) {
  const candidates = [];
  for (const variable of variables) {
    if (variable.resolvedType !== "COLOR" || !scopeAllowsColor(variable, property, node.type)) continue;
    try {
      const resolved = variable.resolveForConsumer(node);
      if (resolved.resolvedType !== "COLOR") continue;
      candidates.push({
        id: variable.id,
        key: variable.key,
        name: variable.name,
        scopes: variable.scopes,
        value: resolved.value,
        variable,
      });
    } catch {
      globalThis.ScanDiagnostics.record(skipped, "color", node, "unresolved", "颜色变量在当前节点模式下解析失败");
    }
  }
  return candidates;
}

function buildTextMatches(nodes, context, settings, skipped) {
  if (!settings.categories.text) return [];
  const targetStyles = context.styles.filter((style) => style.fontFamily === settings.targetFamily);
  const matches = [];
  for (const node of nodes.filter((candidate) => candidate.type === "TEXT")) {
    if (settings.onlyUnbound && (node.textStyleId === figma.mixed || node.textStyleId)) {
      globalThis.ScanDiagnostics.record(skipped, "text", node, "bound", "已有文字样式绑定已保留");
      continue;
    }
    if (node.fontName === figma.mixed || node.fontSize === figma.mixed) {
      skipped.push({ kind: "text", id: node.id, reason: "混合字体或字号" });
      continue;
    }
    const descriptor = describeTextNode(node);
    const result = globalThis.FontStyleMatcher.matchTextNode(descriptor, targetStyles, {
      targetFamily: settings.targetFamily,
      exactSize: settings.exactSize,
    });
    if (!result.matched || (!settings.includeLowConfidence && result.confidence === "low")) {
      skipped.push({ kind: "text", id: node.id, reason: result.reason || "低置信度匹配" });
      continue;
    }
    matches.push({ kind: "text", node, descriptor, style: result.style, confidence: result.confidence });
  }
  return matches;
}

function buildColorMatches(nodes, variables, settings, skipped) {
  if (!settings.categories.color) return [];
  const matches = [];
  for (const node of nodes) {
    for (const property of ["fills", "strokes"]) {
      if (!(property in node)) continue;
      const styleField = property === "fills" ? "fillStyleId" : "strokeStyleId";
      if (
        settings.onlyUnbound &&
        styleField in node &&
        node[styleField] !== figma.mixed &&
        node[styleField]
      ) {
        globalThis.ScanDiagnostics.record(skipped, "color", node, "bound", "已有颜色样式绑定已保留");
        continue;
      }
      const paints = node[property];
      if (!Array.isArray(paints)) continue;
      if (!paints.some((paint) => paint.type === "SOLID" && paint.visible !== false)) continue;
      let candidates;
      for (let index = 0; index < paints.length; index += 1) {
        const paint = paints[index];
        if (paint.type !== "SOLID" || paint.visible === false) continue;
        if (settings.onlyUnbound && (hasBoundVariable(node, property, index) || paint.boundVariables?.color)) {
          globalThis.ScanDiagnostics.record(skipped, "color", node, "bound", "已有颜色变量绑定已保留");
          continue;
        }
        candidates ||= resolveColorCandidates(variables, node, property, skipped);
        const descriptor = {
          property,
          nodeType: node.type,
          nodeName: node.name,
          text: node.type === "TEXT" ? node.characters.slice(0, 80) : "",
          color: { ...paint.color, a: paint.opacity ?? 1 },
        };
        const result = globalThis.VDesignTokenMatcher.matchColorToken(descriptor, candidates, {
          allowApproximate: settings.includeLowConfidence,
        });
        if (!result.matched || (!settings.includeLowConfidence && result.confidence === "low")) {
          skipped.push({ kind: "color", id: node.id, reason: result.reason || "低置信度匹配" });
          continue;
        }
        matches.push({
          kind: "color",
          node,
          property,
          index,
          paint,
          token: result.token,
          confidence: result.confidence,
        });
      }
    }
  }
  return matches;
}

function scopeAllowsNumber(variable, kind) {
  const scopes = variable.scopes || [];
  if (scopes.length === 0 || scopes.includes("ALL_SCOPES")) return true;
  if (kind === "radius") return scopes.includes("CORNER_RADIUS");
  return scopes.includes("GAP");
}

function resolveNumberCandidates(variables, node, kind, skipped) {
  const candidates = [];
  for (const variable of variables) {
    if (variable.resolvedType !== "FLOAT" || !scopeAllowsNumber(variable, kind)) continue;
    try {
      const resolved = variable.resolveForConsumer(node);
      if (resolved.resolvedType !== "FLOAT" || !Number.isFinite(Number(resolved.value))) continue;
      candidates.push({
        id: variable.id,
        key: variable.key,
        name: variable.name,
        resolvedPx: Number(resolved.value),
        variable,
        source: variable.remote ? "library" : "local",
      });
    } catch {
      globalThis.ScanDiagnostics.record(skipped, kind, node, "unresolved", "数值变量在当前节点模式下解析失败");
    }
  }
  return candidates;
}

function numericCatalog(context, variables, node, kind, skipped) {
  if (context.profile.catalog === "vdesign") return globalThis.VDesignTokens[kind];
  return resolveNumberCandidates(variables, node, kind, skipped);
}

function buildRadiusMatches(nodes, variables, context, settings, skipped) {
  if (!settings.categories.radius) return [];
  const matches = [];
  for (const node of nodes) {
    if (!("cornerRadius" in node)) continue;
    const fields = node.cornerRadius === figma.mixed ? CORNER_FIELDS : ["cornerRadius"];
    for (const field of fields) {
      const value = node[field];
      if (!Number.isFinite(Number(value)) || Number(value) === 0) continue;
      const alreadyBound = field === "cornerRadius"
        ? CORNER_FIELDS.some((corner) => hasBoundVariable(node, corner)) || hasBoundVariable(node, field)
        : hasBoundVariable(node, field);
      if (settings.onlyUnbound && alreadyBound) {
        globalThis.ScanDiagnostics.record(skipped, "radius", node, "bound", "已有圆角变量绑定已保留");
        continue;
      }
      const result = globalThis.VDesignTokenMatcher.matchNumberToken(
        value,
        numericCatalog(context, variables, node, "radius", skipped),
      );
      if (!result.matched) {
        skipped.push({ kind: "radius", id: node.id, reason: result.reason });
        continue;
      }
      matches.push({ kind: "radius", node, field, value, token: result.token, confidence: "high" });
    }
  }
  return matches;
}

function buildSpacingMatches(nodes, variables, context, settings, skipped) {
  if (!settings.categories.spacing) return [];
  const matches = [];
  for (const node of nodes) {
    if (!("layoutMode" in node) || node.layoutMode === "NONE") {
      continue;
    }
    for (const field of SPACING_FIELDS) {
      if (!(field in node)) continue;
      const value = node[field];
      if (!Number.isFinite(Number(value)) || Number(value) === 0) continue;
      if (settings.onlyUnbound && hasBoundVariable(node, field)) {
        globalThis.ScanDiagnostics.record(skipped, "spacing", node, "bound", "已有间距变量绑定已保留");
        continue;
      }
      const result = globalThis.VDesignTokenMatcher.matchNumberToken(
        value,
        numericCatalog(context, variables, node, "spacing", skipped),
      );
      if (!result.matched) {
        skipped.push({ kind: "spacing", id: node.id, reason: result.reason });
        continue;
      }
      matches.push({ kind: "spacing", node, field, value, token: result.token, confidence: "high" });
    }
  }
  return matches;
}

async function buildPlan(settings) {
  if (!activeProfileId || settings.profileId !== activeProfileId) {
    throw new Error("请先选择目标设计系统，等待载入完成后再扫描。");
  }
  const context = await loadProfileContext(activeProfileId);
  const nodes = globalThis.ScanDiagnostics.collectSceneNodes(settings.scope, figma);
  const skipped = [];
  const eligible = globalThis.ScanDiagnostics.filterNodes(nodes, settings, skipped);
  const needsVariables = settings.categories.color ||
    (context.profile.catalog !== "vdesign" && (settings.categories.radius || settings.categories.spacing));
  const variableContext = needsVariables
    ? await loadProfileVariables(context)
    : { variables: [], failures: [] };
  const matches = {
    text: buildTextMatches(eligible, context, settings, skipped),
    color: buildColorMatches(eligible, variableContext.variables, settings, skipped),
    radius: buildRadiusMatches(eligible, variableContext.variables, context, settings, skipped),
    spacing: buildSpacingMatches(eligible, variableContext.variables, context, settings, skipped),
  };
  const variables = variableContext.variables;
  const available = {
    text: context.styles.filter((style) => style.fontFamily === settings.targetFamily).length,
    color: variables.filter((variable) => variable.resolvedType === "COLOR").length,
    radius: context.profile.catalog === "vdesign" ? globalThis.VDesignTokens.radius.length
      : variables.filter((variable) => variable.resolvedType === "FLOAT" && scopeAllowsNumber(variable, "radius")).length,
    spacing: context.profile.catalog === "vdesign" ? globalThis.VDesignTokens.spacing.length
      : variables.filter((variable) => variable.resolvedType === "FLOAT" && scopeAllowsNumber(variable, "spacing")).length,
  };
  return { context, nodes, matches, skipped, settings, available, variableFailures: variableContext.failures };
}

function planForUi(plan) {
  const counts = Object.fromEntries(TOKEN_KINDS.map((kind) => [kind, plan.matches[kind].length]));
  const previews = [];
  for (const kind of TOKEN_KINDS) {
    for (const match of plan.matches[kind]) {
      const source = kind === "text"
        ? `${match.descriptor.fontFamily || "Mixed"} ${match.descriptor.fontSize || "?"}px`
        : kind === "color"
          ? `${match.node.name} · ${match.property}`
          : `${match.field} · ${match.value}px`;
      const target = kind === "text" ? match.style.name : match.token.name;
      previews.push({ kind, source, target, confidence: match.confidence });
    }
  }
  return {
    totalNodes: plan.nodes.length,
    matched: Object.values(counts).reduce((sum, value) => sum + value, 0),
    counts,
    skipped: plan.skipped.length,
    previews: previews.slice(0, 120),
    warnings: plan.variableFailures.slice(0, 5),
    diagnostics: globalThis.ScanDiagnostics.summarize(
      plan.skipped, plan.matches, plan.available, plan.variableFailures, plan.settings.categories,
    ),
    profileName: plan.context.profile.name,
    fontAvailable: plan.context.fonts.some(
      (font) => font.fontName.family === plan.settings.targetFamily,
    ),
  };
}

async function importVariablesByKey(keys) {
  const unique = [...new Set(keys)];
  const variables = await Promise.all(unique.map((key) => figma.variables.importVariableByKeyAsync(key)));
  return new Map(variables.map((variable) => [variable.key, variable]));
}

async function applyTextMatches(plan) {
  const keys = plan.matches.text
    .filter((match) => match.style.source === "catalog")
    .map((match) => match.style.key);
  const imported = new Map(
    (await Promise.all([...new Set(keys)].map((key) => figma.importStyleByKeyAsync(key))))
      .map((style) => [style.key, style]),
  );
  const resolved = plan.matches.text.map((match) => {
    const style = match.style.source === "catalog"
      ? imported.get(match.style.key)
      : plan.context.localStyles.find((candidate) => candidate.id === match.style.id);
    if (!style || style.type !== "TEXT") throw new Error(`无法导入文字样式：${match.style.name}`);
    return { ...match, resolvedStyle: style };
  });
  const fonts = [...new Map(resolved.map(({ resolvedStyle }) => [
    JSON.stringify(resolvedStyle.fontName),
    resolvedStyle.fontName,
  ])).values()];
  await Promise.all(fonts
    .filter((font) => plan.context.fontKeys.has(`${font.family}::${font.style}`))
    .map((font) => figma.loadFontAsync(font)));
  await Promise.all(resolved.map(({ node, resolvedStyle }) => node.setTextStyleIdAsync(resolvedStyle.id)));
}

function applyColorMatches(matches) {
  const groups = new Map();
  for (const match of matches) {
    const key = `${match.node.id}::${match.property}`;
    if (!groups.has(key)) groups.set(key, { node: match.node, property: match.property, matches: [] });
    groups.get(key).matches.push(match);
  }
  for (const group of groups.values()) {
    const paints = [...group.node[group.property]];
    for (const match of group.matches) {
      paints[match.index] = figma.variables.setBoundVariableForPaint(
        paints[match.index],
        "color",
        match.token.variable,
      );
    }
    group.node[group.property] = paints;
  }
}

async function apply(settings) {
  const plan = await buildPlan(settings);
  const summary = planForUi(plan);
  if (summary.matched === 0) {
    figma.ui.postMessage({ type: "apply-result", payload: { ...summary, message: "没有可安全应用的规范项。" } });
    return;
  }
  const numericMatches = [...plan.matches.radius, ...plan.matches.spacing];
  const numericKeys = numericMatches
    .filter((match) => !match.token.variable)
    .map((match) => match.token.key)
    .filter(Boolean);
  const numericVariables = await importVariablesByKey(numericKeys);
  await applyTextMatches(plan);
  applyColorMatches(plan.matches.color);
  for (const match of numericMatches) {
    const variable = match.token.variable || numericVariables.get(match.token.key);
    if (!variable) throw new Error(`无法导入变量：${match.token.name}`);
    match.node.setBoundVariable(match.field, variable);
  }
  figma.commitUndo();
  figma.ui.postMessage({
    type: "apply-result",
    payload: {
      ...summary,
      message: `已应用 ${summary.matched} 项「${plan.context.profile.name}」规范，可在 Figma 中一次撤销。`,
    },
  });
}

function profilePayload(context, confirmed) {
  const profile = context.profile;
  const floatVariables = (profile.kind === "catalog"
    ? context.libraryVariables
    : context.localProfileVariables).filter((variable) => variable.resolvedType === "FLOAT");
  const radiusTokenCount = profile.catalog === "vdesign"
    ? globalThis.VDesignTokens.radius.length
    : floatVariables.filter((variable) => scopeAllowsNumber(variable, "radius")).length;
  const spacingTokenCount = profile.catalog === "vdesign"
    ? globalThis.VDesignTokens.spacing.length
    : floatVariables.filter((variable) => scopeAllowsNumber(variable, "spacing")).length;
  const targetFamily = profile.targetFamily && context.families.includes(profile.targetFamily)
    ? profile.targetFamily
    : context.families[0] || profile.targetFamily || "";
  return {
    profiles: context.profiles,
    activeProfileId: profile.id,
    profileConfirmed: confirmed,
    families: context.families,
    defaultFamily: targetFamily,
    profileName: profile.name,
    profileSummary: profile.summary,
    fontAvailable: targetFamily
      ? context.fonts.some((font) => font.fontName.family === targetFamily)
      : false,
    textStyleCount: context.styles.length,
    localVariableCount: context.localProfileVariables.length,
    libraryVariableCount: context.libraryVariables.length,
    radiusTokenCount,
    spacingTokenCount,
    libraryEnabled: profile.kind === "local" || profile.kind === "catalog" ||
      profile.variableCollectionKeys.length > 0,
  };
}

async function importLibraryCatalog(json) {
  const catalog = globalThis.LibraryCatalog.parse(json);
  const entry = globalThis.LibraryCatalog.summary(catalog);
  await figma.clientStorage.setAsync(catalogStorageKey(entry.id), catalog);
  const existing = await figma.clientStorage.getAsync(CATALOG_INDEX_STORAGE_KEY);
  const index = Array.isArray(existing) ? existing.filter((item) => item.id !== entry.id) : [];
  index.push(entry);
  await figma.clientStorage.setAsync(CATALOG_INDEX_STORAGE_KEY, index);
  discoveryContextPromise = undefined;
  profileContextPromises.clear();
  profileVariablesPromises.clear();
  await selectProfile(entry.id);
  figma.ui.postMessage({ type: "catalog-imported", payload: entry });
}

async function selectProfile(profileId) {
  const context = await loadProfileContext(profileId);
  activeProfileId = profileId;
  figma.root.setPluginData(PROFILE_STORAGE_KEY, profileId);
  await figma.clientStorage.setAsync(PROFILE_STORAGE_KEY, profileId);
  figma.ui.postMessage({ type: "profile-selected", payload: profilePayload(context, true) });
}

async function initialize() {
  const discovery = await loadDiscoveryContext();
  const [documentProfileId, userProfileId] = await Promise.all([
    Promise.resolve(figma.root.getPluginData(PROFILE_STORAGE_KEY)),
    figma.clientStorage.getAsync(PROFILE_STORAGE_KEY),
  ]);
  const savedProfile = [documentProfileId, userProfileId]
    .map((profileId) => globalThis.DesignSystemProfiles.findProfile(discovery.profiles, profileId))
    .find(Boolean);
  const suggestedProfile = savedProfile ||
    discovery.profiles.find((profile) => profile.recommended) ||
    discovery.profiles.find((profile) => profile.enabled) ||
    discovery.profiles[0];
  if (!suggestedProfile) throw new Error("当前文件没有可配置的设计系统来源。");
  activeProfileId = savedProfile ? savedProfile.id : null;
  const context = await loadProfileContext(suggestedProfile.id);
  figma.ui.postMessage({
    type: "init",
    payload: {
      ...profilePayload(context, Boolean(savedProfile)),
      selectionCount: figma.currentPage.selection.length,
    },
  });
}

figma.ui.onmessage = async (message) => {
  try {
    if (message.type === "scan") {
      const plan = await buildPlan(message.settings);
      figma.ui.postMessage({ type: "scan-result", payload: planForUi(plan) });
    }
    if (message.type === "apply") await apply(message.settings);
    if (message.type === "select-profile") await selectProfile(message.profileId);
    if (message.type === "export-catalog") await captureLibraryCatalog();
    if (message.type === "import-catalog") await importLibraryCatalog(message.json);
    if (message.type === "resize" && Number.isFinite(message.height)) {
      const height = Math.round(Math.max(WINDOW_SIZE.minHeight, Math.min(WINDOW_SIZE.maxHeight, message.height)));
      figma.ui.resize(WINDOW_SIZE.width, height);
    }
    if (message.type === "close") figma.closePlugin();
  } catch (error) {
    figma.ui.postMessage({
      type: "error",
      payload: { message: error instanceof Error ? error.message : String(error) },
    });
  }
};

initialize().catch((error) => {
  figma.ui.postMessage({
    type: "error",
    payload: { message: error instanceof Error ? error.message : String(error) },
  });
});
