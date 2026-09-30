# src/
> L2 | 父级: ../CLAUDE.md

成员清单
code.js: 插件主线程，编排组件容错采集、样式/变量导出、JSON 导入记忆、目标发现及四类规范绑定
component-catalog.js: 组件采集边界，读取组件集/独立组件定义、保留变体关联，并把损坏组件集 getter 异常转为可见缺项告警
design-system-profile.js: 目标设计系统配置领域层，把导入规范包、当前文件、已启用团队库与 VDesign 预设整理为用户可确认的候选
library-catalog.js: 跨文件 JSON 规范包契约，优先用文件 key、否则用资产 key 标识来源，保留采集告警并兼容旧版格式
matcher.js: 纯函数匹配引擎，以字号为硬约束并结合语义角色、字重和行高评分
token-matcher.js: 纯函数 Token 匹配引擎，以实际值为硬约束并对颜色候选做属性语义消歧
vdesign-styles.js: VDesign 已发布 PingFang Text Style 兼容预设，为无本地样式的既有用户提供跨文件导入 key
vdesign-tokens.js: VDesign 间距与圆角兼容预设，保存发布 key 和真实 resolvedPx；颜色从用户选定的已启用库动态发现
ui.html: 插件 UI 结构模板，设计系统与字体并排，未确认时显示下方摘要和确认入口，顶部提供导入/导出操作
ui.css: 零圆角的 shadcn 语义 Token、双列目标控件与长名称截断、顶部工具栏和导出结果层级，支持明暗模式
ui.js: 顶部按钮触发 JSON 消息与下载/复制回退，确认后隐藏重复摘要和按钮，就绪状态省略数量明细但保留警告

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
