# Design System Normalizer - Agui - 用户可配置的 Figma 设计规范绑定器
Vanilla JavaScript + Figma Plugin API + Node.js 内置测试

<directory>
src/ - 插件源码、JSON 规范包契约、单步目标选择、扫描诊断、匹配算法与拆分 UI（12 文件）
scripts/ - 无依赖构建与素材渲染流程（2 文件：build.mjs、render-assets.mjs）
tests/ - JSON 消息链路、扫描诊断、设计系统配置、匹配器、插件权限与 UI 状态回归（7 文件）
assets/ - 发布素材的 HTML 源文件、渲染脚本产物 PNG、品牌矢量与 listing 文案（见 assets/CLAUDE.md）
dist/ - 构建生成的 Figma 可运行产物，不手工修改
</directory>

<config>
manifest.json - Design System Normalizer 的 Figma Desktop 开发入口，声明 teamlibrary 读库权限且不访问网络
package.json - 构建、测试与完整检查命令
.gitignore - 排除本地依赖、系统文件和环境凭证，保留可直接运行的 dist 产物
README.md - 规范包导入导出、插件安装、扫描和应用四类规范的操作说明
PUBLISH.md - 发布到 Figma Community 的简易教程、发布前判断与提交检查清单
assets/listing-copy.md - 私有发布表单用的名称、tagline、描述文案与素材对照
</config>

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
