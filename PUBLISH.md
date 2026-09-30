# 发布到 Figma Community 简易教程

针对本插件（manifest 名 `Design System Normalizer - Agui`）的最小发布路径。发布只能在 **macOS / Windows 版 Figma 桌面客户端**里操作，网页版不行。

**已定决策**：当前仍走 **Organization 私有发布**；listing 名称用 `Design System Normalizer - Agui`。插件已支持用户选择目标规范，VDesign 仅作为兼容预设。

---

## 第 0 步：先做三个判断（决定能不能公开发到 Community）

### 1. 插件已经泛化，但公开发布仍需外部文件验证

- 插件会列出当前文件本地规范、已启用的团队变量库与 VDesign 兼容预设。
- 候选只负责推荐，用户必须点击“设为目标规范”后才能扫描和应用。
- 通用团队库的文字样式仅限当前文件已经可见的 Text Styles；也可由用户在源文件导出 JSON 规范包、在目标文件导入，但真实绑定仍需源库权限及已发布 key。Plugin API 不能枚举或启用任意未启用组件库。

Figma 审核指南明确写着：Community 面向所有用户，**不适用于仅供内部团队使用的插件**。所以先选一条路线：

| 路线 | 做法 | 适用 |
| --- | --- | --- |
| A. 公开库 | 把 VDesign Web System（样式 + 变量）作为可共享文件发布，listing 里写明"需先启用该库" | 想把规范开源给外部用 |
| B. 泛化插件 | 当前实现：运行时发现当前文件/已启用变量库，VDesign 仅作兼容预设 | 面向通用用户 |
| C. 私有发布 | Organization / Enterprise 计划可 **Publish → Organization**，Figma 不审核，也不需要满足社区可用性 | 只给内部同学用（最省事） |

### 2. `teamlibrary` 权限的边界

`manifest.json` 声明了 `permissions: ["teamlibrary"]`（`figma.teamLibrary` 必须声明，否则调用报错）。注意：

- 该 API **只能读用户在文件里手动启用的库**，插件无法用代码启用库。
- 发布页会展示这个权限，**描述里要写清楚**为什么需要它、会读什么。

### 3. 名称与主体

首次发布时 listing 名称默认取 `manifest.json` 的 `name`。想叫别的名字就在发布表单里改；同时准备一个**支持联系方式**（邮箱/帮助页），审核要求开发者自己提供用户支持。

---

## 第 1 步：本地产物核对

```bash
npm run check      # = npm run build + npm test
```

- [ ] 生成 `dist/code.js`、`dist/ui.html`（发布上传的就是这两个文件，别手改 `dist/`）
- [ ] `manifest.json`：`documentAccess: "dynamic-page"` 已有（新插件必填）
- [ ] `manifest.json`：`networkAccess.allowedDomains: ["none"]` 已有 → listing 会打上 **No access to network** 标签，是加分项
- [ ] `manifest.json`：**不要**出现 `enableProposedApi`（已发布插件中不生效）
- [x] 保留 `manifest.json` 中现有插件 `id`，后续更新必须继续沿用
- [ ] 清掉调试 `console.log`、临时文案、测试画板

**桌面端自测**：导入本项目后，分别用“当前文件本地规范”、一个通用团队变量库和 VDesign 预设完成确认、扫描、应用流程；再在组件库源文件导出 JSON，在另一文件导入，验证清单数量与有权限/无权限时的绑定反馈。组件目前只进入清单。

---

## 第 2 步：素材（已备好，均在 `assets/` 下）

| 表单项 | 文件 | 状态 |
| --- | --- | --- |
| 图标 Icon（128×128） | `assets/icon-128.png`（另有 512px 母版） | 已备好 |
| 缩略图 Thumbnail（1920×1080） | `assets/cover-1920x1080.png` | 已备好 |
| 轮播图（最多 9 个） | `assets/slide-02-workflow.png`、`slide-03-rules.png`、`slide-04-prereq.png` | 已备 3 张 |
| Playground 试用文件 | — | 私有发布可跳过 |
| 支持联系方式 | 填在 `assets/listing-copy.md` 的占位处 | 待补邮箱 |
| 隐私政策 | 不采集、不上传数据，描述里已声明；私有发布可跳过 Data security 问卷 | 已声明 |

素材源文件是 `assets/*.html` + `asset.css`，改完跑 `node scripts/render-assets.mjs` 重新出图。表单里每一项填什么直接抄 `assets/listing-copy.md`。

---

## 第 3 步：在 Figma 桌面端提交

1. 账号开启 **two-factor authentication**（未开启无法发布）。
2. 打开任意设计文件 → 左上角 **Figma 图标 → Plugins → Manage plugins**。
3. 在插件条目右侧 `...` 里点 **Publish**（若列表里还没有本插件，先按第 1 步用 "Import plugin from manifest..." 导入）。
4. **Describe your resource**：名称、一句话 tagline、详细描述（目标规范确认机制 + 团队库需手动启用 + 操作步骤 + 权限说明）、分类（如 Design tools）。
5. **Choose some images**：上传 icon、thumbnail，按需加轮播与 playground。
6. **Data security**（可选）：填安全披露问卷，Figma 审核最长可能两周。
7. **Add the final details**：发布目标选 **Organization**（仅 Organization / Enterprise 计划可选；Figma 不审核组织内私有共享）、发布主体选组织、支持联系方式、网络访问标签、额外贡献者。
8. 点 **Publish**，组织内成员立即可用。

---

## 第 4 步：上线（私有发布无审核）

- Community 公开发布才会进入 **In review** 流程；选 Organization 时 Figma **不审核**，发布即对组织内成员生效。
- 分享链接形如 `https://www.figma.com/community/plugin/<id>/<name>`，只有组织内成员能打开。
- 若将来想改公开上 Community，再走第 3 步的 Community 目标提交审核即可。

---

## 第 5 步：后续更新

```bash
# 改 src/ → 构建 → 自测
npm run check
```

桌面端 `Manage plugins → ... → Publish update`，填写版本号与 changelog。

- 发布后 Figma 会把 `id` 写入 `manifest.json`，**记得提交这个变更**；以后更新必须沿用同一 `id`。
- 只改文案/图片不必发新版本，可直接编辑 listing。
- 核心功能发生重大变化时，官方要求**新建一个独立插件**，而不是在原插件上更新。
- 免费插件无需 Stripe；一旦发布为付费就不能再改回免费（本插件建议保持免费）。

---

## 提交前检查清单

- [ ] `npm run check` 通过
- [ ] `dist/` 是最新构建、与 `src/` 一致
- [ ] manifest 使用既有插件 `id`、无 `enableProposedApi`、`documentAccess` 为 `dynamic-page`
- [ ] 桌面端四类规范全流程自测通过，无崩溃
- [x] icon 128×128、thumbnail 1920×1080 已备好（`assets/`）
- [x] 描述里写清了库依赖前提、权限用途、不支持场景（`assets/listing-copy.md`）
- [x] 发布目标已定为 Organization 私有发布（路线 C）
- [ ] `assets/listing-copy.md` 里的支持联系方式已替换成真实邮箱
