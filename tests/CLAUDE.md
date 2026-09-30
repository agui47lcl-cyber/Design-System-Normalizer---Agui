# tests/
> L2 | 父级: ../CLAUDE.md

成员清单
catalog-flow.test.js: 用 Figma 替身验证容错导出、目标存储、实例保护及 Paint 绑定保留，同时校验高度消息数值边界
design-system-profile.test.js: 校验导入规范包候选、VDesign 预设、团队库分组及推荐不代替用户决策
library-catalog.test.js: 校验 JSON 往返、组件采集告警、无文件 key 来源识别、旧版兼容及错误格式拒绝
matcher.test.js: 校验 35 个 VDesign PingFang 样式 key，并覆盖标题、正文、标签、相同字号保护和目标字体缺失等匹配边界
plugin-config.test.js: 以 UI 替身验证选择、加载锁定、预览失效、导出退出/复制回退和高度拖动取消；校验布局与安全默认值
scan-diagnostics.test.js: 校验节点去重、祖先保护与跳过原因聚合，不把已保留绑定误称为合规或把读取失败误称为未匹配
token-matcher.test.js: 校验颜色精度先于语义、透明度与近似保护，验证间距/圆角 resolvedPx 精确映射

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
