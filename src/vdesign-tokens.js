/**
 * [INPUT]: 依赖 VDesign Web System 已发布的间距、圆角变量 key 与已验证解析值
 * [OUTPUT]: 对外提供 VDesignTokens 只读目录和库身份，供插件按值匹配并按需导入变量
 * [POS]: src 的数值 Token 桥梁；颜色变量保持从当前启用的 VDesign 库动态发现，避免缓存过期
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(function registerVDesignTokens(root, factory) {
  const catalog = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = catalog;
  root.VDesignTokens = catalog;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTokenCatalog() {
  "use strict";

  const rowsToTokens = (rows, scope) => rows.map(([resolvedPx, name, key]) => ({
    resolvedPx,
    name,
    key,
    scope,
    source: "catalog",
  }));

  return {
    libraryName: "VDesign Web System",
    collectionName: "vzan",
    colorNamePattern: /^color\//i,
    radius: rowsToTokens([
      [0, "radius/None", "fc6b9e9fa338aa0ec0cd4ffaacbd474978e14126"],
      [2, "radius/radius 1", "b5942515521e7d4796163238114282a897001965"],
      [4, "radius/radius 2", "d58f4e5f5f776b9b5a034f5b5afca5354cc74fe9"],
      [6, "radius/radius 3", "f60c8ddeae2fddd19696f04af1ee481d66c27362"],
      [8, "radius/radius 4", "8b50b57d307ad2e2800e3ae9051c60602ec2fdaa"],
      [10, "radius/radius 5", "e6d9262c10cddce0d6afb5d3005f4cfb68475bc9"],
      [12, "radius/radius 6", "a01b6ca1102eb7c1ff7b06e08166d65be68c3542"],
      [16, "radius/radius 8", "3522580b10f64cbe6864cf9be3ccfc8dd969d204"],
      [20, "radius/radius 10", "9feea3831b96ad790c94f09ae0ce5fcfb4f2a39c"],
    ], "CORNER_RADIUS"),
    spacing: rowsToTokens([
      [2, "padding/padding 1", "3a400f14f3ea3c4c7b1f9060a26e067a381e1a03"],
      [4, "padding/padding 2", "d5c076053f5ff7f456320c607cf842f9e53b9fc0"],
      [6, "padding/padding 3", "6fa1c8cdca4a6da89ddfcc2f77c99fa7f7bef8a9"],
      [8, "padding/padding 4", "f10aa609c8a9342ede37216d2412dcdec8c35067"],
      [10, "padding/padding 5", "330342c9d23f59eb87545da707023643f3157b8d"],
      [12, "padding/padding 6", "d727bebe46b6e69d9307a4ab5b11c0bee71da0eb"],
      [16, "padding/padding 8", "4718f622ed5831b35031f908772d9e295721db42"],
      [20, "padding/padding 10", "2ec4a1093abe71ea4ff9c79d3d46ee067c56992b"],
      [24, "padding/padding 12", "93e576637fba54e172893a1df7963150d42c2857"],
      [32, "padding/padding 16", "5a0bb5cfe4b1e6af9afa98e3b6385c6acf82358a"],
      [40, "padding/padding 20", "0e2470addc030e13d8c901941463db5f152d3c19"],
    ], "GAP"),
  };
});
