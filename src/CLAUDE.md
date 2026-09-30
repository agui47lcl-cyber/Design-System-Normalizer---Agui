# src/
> L2 | 父级: ../CLAUDE.md

成员清单
code.js: 插件主线程，编排规范包、目标切换和四类绑定；聚合扫描诊断，并校验高度请求为 480–1040px、固定宽度 440px
component-catalog.js: 组件采集边界，读取组件集/独立组件定义、保留变体关联，并把损坏组件集 getter 异常转为可见缺项告警
design-system-profile.js: 目标设计系统配置领域层，把导入规范包、当前文件、已启用团队库与 VDesign 预设整理为用户可确认的候选
library-catalog.js: 跨文件 JSON 规范包契约，优先用文件 key、否则用资产 key 标识来源，保留采集告警并兼容旧版格式
matcher.js: 纯函数匹配引擎，以字号为硬约束并结合语义角色、字重和行高评分
token-matcher.js: 纯函数 Token 匹配引擎，先筛选精度合格颜色再做语义消歧，开启近似也不会覆盖已有精确候选
scan-diagnostics.js: 只读扫描解释边界，统一节点遍历、祖先保护筛选和跳过原因聚合，区分节点数/属性数与读取失败
vdesign-styles.js: VDesign 已发布 PingFang Text Style 兼容预设，为无本地样式的既有用户提供跨文件导入 key
vdesign-tokens.js: VDesign 间距与圆角兼容预设，保存发布 key 和真实 resolvedPx；颜色从用户选定的已启用库动态发现
ui.html: 插件 UI 结构模板，标题与 JSON 工具栏并排；导出结果提供完成入口，底部高度手柄与固定操作区相邻
ui.css: 零圆角语义 Token，统一标题间距、类别对齐、双列截断与折叠层级；高度缩小时正文滚动、底部操作保留
ui.js: UI 状态边界，目标选择即载入、配置变更使预览失效；导出完成恢复最近主流程提示，指针与键盘发送有界高度请求

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
