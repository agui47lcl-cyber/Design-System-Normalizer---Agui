/**
 * [INPUT]: 依赖 VDesign Web System 已发布的 PingFang SC Text Style keys 与排版属性
 * [OUTPUT]: 对外提供 VDesignTextStyles 只读目录，供任意设计文件在应用阶段按需导入样式
 * [POS]: src 的跨文件设计系统桥梁，解决当前文件没有本地 Text Styles 时无法匹配的问题
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(function registerVDesignTextStyles(root, factory) {
  const catalog = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = catalog;
  root.VDesignTextStyles = catalog;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCatalog() {
  "use strict";

  const rows = [
    ["1ece1ed6bc5d0ba4465fbe86b0889fae4b396153", "正文/14/14·Regular", "Regular", 14, 22],
    ["b33f8984e6a74baf0a97ae496a16be0c5e4a0031", "标签/11/11·Reagular", "Regular", 11, 18],
    ["e0346a26904d9f9db7697b8f33f7e51493eedb53", "标签/11/11·Medium", "Medium", 11, 18],
    ["e05e3ed82fae1c89590b73c9135c76b19517c737", "标签/11/11·bold", "Semibold", 11, 18],
    ["cd1dcf6a3217db82b1d924ac4c8c5562d41df6c2", "标签/10/10·Reagular", "Regular", 10, 18],
    ["b2d3e0838b2c2103b9cb4eb423c6e7a9a1d8b5f3", "标签/10/10·Medium", "Medium", 10, 18],
    ["fe66ea7c18628c226615574aa590979bbb170a9a", "标签/10/10·bold", "Semibold", 10, 18],
    ["585fdb0317a76c1e06c13c8f7c1466f10a1dee4a", "标题/16/16·bold", "Semibold", 16, 24],
    ["73f188c4ae1b75522276bf3b35f08844b68471b2", "标题/16/16·Medium", "Medium", 16, 24],
    ["541dc58c9ce440a99f56c18c9ba93f0635f2a621", "标题/18/18·Reagular", "Regular", 18, 26],
    ["b2963576e37afed8f17a5adedbb4715210ea9edc", "标题/18/18·Medium", "Medium", 18, 26],
    ["491ed76e3bdd15425c675aaea9feac3d2048ae0b", "标题/20/20·bold", "Semibold", 20, 28],
    ["b901cd16a6ac6038d726fc6264dbe7bd8b3f78d7", "标题/20/20·Medium", "Medium", 20, 28],
    ["beaeb44cd171fcc8a0e3aa81a0fb82711d4ab4fa", "标题/24/24·bold", "Semibold", 24, 32],
    ["2b0ac8e5bb78991931ecea0bce2e362fd6c43dcf", "标题/24/24·Medium", "Medium", 24, 32],
    ["dda58f94e059cdd0183b6d2304586f8dcb838d82", "标题/28/28·Medium", "Medium", 18, 26],
    ["c22dfdb9d71e3b40dae4f1db4f75cc136d2fe57d", "标题/28/28·bold", "Semibold", 28, 36],
    ["9e0c3b5d9152760b634306e7ffcbd0a017a7e6a0", "标题/32/32·Medium", "Medium", 32, 40],
    ["be3da65184703da4ed8014cca21f15a86a7fb813", "标题/32/32·bold", "Semibold", 32, 40],
    ["53c6225d5dad03e6aee7be8956cc3cbde34960b2", "标题/36/36·bold", "Semibold", 36, 44],
    ["4d62bc4137fe90561bf6546682d4a376de069a74", "标题/36/36·Medium", "Medium", 36, 44],
    ["fd10ea0c0b6c0a5ea19015a78aea45f02ac457fd", "标题/40/40·Medium", "Medium", 40, 48],
    ["a797d643213363d6891a4230945d9e57a1423a42", "标题/40/40·bold", "Semibold", 40, 48],
    ["d2a6d74a5311fede21578a3b56d1a7bfeadb5891", "标题/48/48·bold", "Semibold", 48, 56],
    ["5a0f5c561a8c284b856801b0f752ceb25675f594", "标题/48/48·Medium", "Medium", 48, 56],
    ["457f1d38c81656f20829655d23d5fefbaef56035", "标题/56/56·bold", "Semibold", 56, 64],
    ["5eed44d1d33a28091db644ac30722813aa165cea", "标题/56/56·Medium", "Medium", 56, 66],
    ["526be3d4b7918921f39af7664994d35b80e1dd98", "正文/14/14·Medium", "Medium", 14, 22],
    ["592efb59abd65917f50ee5a7498da274a5e144b0", "正文/14/14·bold", "Semibold", 14, 22],
    ["9b08f6624ab91df5d8627ce05cdfe47fe684ae4a", "正文/13/13·Regular", "Regular", 13, 20],
    ["6214b9fd577ddef99fdb66e7d80c90221fc1e44c", "正文/13/13·Medium", "Medium", 13, 20],
    ["e90ce005e2ea53d109fee368fca2dcc213824fee", "正文/13/13·bold", "Semibold", 13, 20],
    ["a76c6f52e42b9b27e5061a7c95ea949248bb518f", "正文/12/12·Regular", "Regular", 12, 20],
    ["c8fee2c5fda22010f36d7cdff76cd9e7e72e3fe3", "正文/12/12·Medium", "Medium", 12, 20],
    ["6727571298ca7ada1d150e673922bbf77c1eb8cb", "正文/12/12·bold", "Semibold", 12, 20],
  ];

  return rows.map(([key, name, fontStyle, fontSize, lineHeight]) => ({
    key,
    name,
    fontFamily: "PingFang SC",
    fontStyle,
    fontSize,
    lineHeight: { unit: "PIXELS", value: lineHeight },
    source: "catalog",
  }));
});
