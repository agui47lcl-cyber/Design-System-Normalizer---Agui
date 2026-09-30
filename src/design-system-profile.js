/**
 * [INPUT]: 依赖 Figma 主线程提供的本地资产、已启用团队变量集合、导入规范包摘要与 VDesign 预设身份
 * [OUTPUT]: 对外提供 DesignSystemProfiles，用确定性规则生成、排序和查找目标设计系统配置
 * [POS]: src 的设计系统配置领域层，统一源文件规范包与运行时候选，供主线程和测试共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(function registerDesignSystemProfiles(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DesignSystemProfiles = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createDesignSystemProfiles() {
  "use strict";

  const LOCAL_PROFILE_ID = "current-file";
  const VDESIGN_PROFILE_ID = "preset:vdesign";

  function stableLibraryId(libraryName) {
    return `library:${encodeURIComponent(String(libraryName).trim().toLocaleLowerCase())}`;
  }

  function isVDesignCollection(collection, preset) {
    return collection.libraryName === preset.libraryName || collection.name === preset.collectionName;
  }

  function groupLibraryCollections(collections) {
    const groups = new Map();
    for (const collection of collections) {
      const libraryName = collection.libraryName || "未命名团队库";
      if (!groups.has(libraryName)) groups.set(libraryName, []);
      groups.get(libraryName).push(collection);
    }
    return groups;
  }

  function buildProfileCandidates(input) {
    const {
      libraryCollections = [],
      localStyleCount = 0,
      localVariableCount = 0,
      importedCatalogs = [],
      vdesignPreset = {},
    } = input || {};
    const preset = {
      libraryName: "VDesign Web System",
      collectionName: "vzan",
      targetFamily: "PingFang SC",
      ...vdesignPreset,
    };
    const groups = groupLibraryCollections(libraryCollections);
    const enabledProfiles = [];
    let vdesignCollections = [];

    for (const [libraryName, collections] of groups) {
      if (collections.some((collection) => isVDesignCollection(collection, preset))) {
        vdesignCollections = collections.filter((collection) => isVDesignCollection(collection, preset));
        enabledProfiles.push(VDESIGN_PROFILE_ID);
        continue;
      }
      const id = stableLibraryId(libraryName);
      enabledProfiles.push(id);
    }

    const recommendedId = enabledProfiles.length === 1
      ? enabledProfiles[0]
      : enabledProfiles.length === 0 && localStyleCount + localVariableCount > 0
        ? LOCAL_PROFILE_ID
        : null;
    const profiles = [];

    for (const catalog of importedCatalogs) {
      if (!catalog || typeof catalog.id !== "string" || typeof catalog.name !== "string") continue;
      const counts = catalog.counts || {};
      profiles.push({
        id: catalog.id,
        name: `${catalog.name}（规范包）`,
        kind: "catalog",
        catalog: "imported",
        targetFamily: null,
        variableCollectionKeys: [],
        enabled: true,
        recommended: false,
        summary: `文字 ${counts.text || 0} · 变量 ${counts.variables || 0} · 组件 ${counts.components || 0}；绑定资产仍需团队库访问权限`,
      });
    }

    profiles.push({
      id: VDESIGN_PROFILE_ID,
      name: preset.libraryName,
      kind: "preset",
      catalog: "vdesign",
      targetFamily: preset.targetFamily,
      variableCollectionKeys: vdesignCollections.map((collection) => collection.key),
      enabled: vdesignCollections.length > 0,
      recommended: recommendedId === VDESIGN_PROFILE_ID,
      summary: vdesignCollections.length > 0
        ? `已启用 ${vdesignCollections.length} 个变量集合，包含内置文字、圆角与间距目录`
        : "内置兼容预设；颜色变量需要先在当前文件启用对应团队库",
    });

    for (const [libraryName, collections] of groups) {
      if (collections.some((collection) => isVDesignCollection(collection, preset))) continue;
      const id = stableLibraryId(libraryName);
      profiles.push({
        id,
        name: libraryName,
        kind: "library",
        catalog: null,
        targetFamily: null,
        variableCollectionKeys: collections.map((collection) => collection.key),
        enabled: true,
        recommended: recommendedId === id,
        summary: `当前文件已启用 ${collections.length} 个变量集合；文字使用文件中可见的 Text Styles`,
      });
    }

    profiles.push({
      id: LOCAL_PROFILE_ID,
      name: "当前文件本地规范",
      kind: "local",
      catalog: null,
      targetFamily: null,
      variableCollectionKeys: [],
      enabled: localStyleCount + localVariableCount > 0,
      recommended: recommendedId === LOCAL_PROFILE_ID,
      summary: `${localStyleCount} 个本地 Text Styles · ${localVariableCount} 个本地 Variables`,
    });

    return profiles.sort((left, right) => {
      if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
      if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
      if (left.kind !== right.kind) {
        const order = { catalog: 0, library: 1, local: 2, preset: 3 };
        return order[left.kind] - order[right.kind];
      }
      return left.name.localeCompare(right.name, "zh-Hans-CN");
    });
  }

  function findProfile(profiles, profileId) {
    return profiles.find((profile) => profile.id === profileId) || null;
  }

  return {
    LOCAL_PROFILE_ID,
    VDESIGN_PROFILE_ID,
    buildProfileCandidates,
    findProfile,
    stableLibraryId,
  };
});
