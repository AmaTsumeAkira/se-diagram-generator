# 项目自查 Bug 修复与测试报告

项目：se-diagram-generator（React 19 + TS + Vite + @xyflow/react）
本次共修复自查发现的 15 项缺陷（P0×3、P1×5、P2×7）。

## 测试结果总览

| 检查项 | 命令 | 结果 |
|--------|------|------|
| 类型检查 + 生产构建 | `npm run build`（`tsc -b && vite build`） | ✅ 通过，529 模块转换成功 |
| 静态检查（Lint） | `npm run lint` | ✅ 修复前 87 problems / 修复后 87 problems（**新增 0**） |
| 开发服务运行时 | `npm run dev` + 逐模块请求 | ✅ 首页及 6 个改动模块均返回 200（无转换错误） |
| 生产预览 | `vite preview` | ✅ 首页 200、构建产物 JS 200 |

> 说明：项目未内置单元测试框架，本次以「类型检查 + 构建 + Lint 基线对比 + 运行时模块加载」作为自动化验证；交互行为建议通过 `npm run dev` 在浏览器中复验。

---

## P0 — 崩溃 / 数据丢失

### 1. 导入 Markdown 数据导致白屏崩溃 ✅ 已修复
- 改动：`src/App.tsx`（MD 导入分支）
- 修复：`newConfigs` 初始化全部 8 个 `DiagramType` 键，不再产生 `undefined` 配置。
- 验证：`configToERState` / `configToSequenceState` 等 memo 不再接收 `undefined`；构建与模块加载通过。

### 2. 类图/活动图/部署图编辑器状态丢失、可误清空图表 ✅ 已修复
- 改动：`src/App.tsx`（新增 `configToClassState` / `configToActivityState` / `configToDeploymentState` 及 memo、传参）+ `src/components/panels/NodeEditor.tsx`（三个编辑器接收 `state` 初始值）
- 修复：Apply 后的重挂载会从最新配置回灌状态，不再归零；类图关系（relations）也一并回灌。
- 验证：类型检查通过；三处编辑器 props 已接通（App.tsx:581-583）。

### 3. 「导出全部数据」JSON 丢失图元细节 ✅ 已修复
- 改动：`src/components/panels/ExportDataModal.tsx`
- 修复：导出补齐 `attributes / methods / isAbstract / stereotype / participantType / technology / nodeType / conditions / fontSize / fontFamily / spacing / nodeH / nodeW / row / col` 及 `edge.data`，实现与导入端完整回环。

---

## P1 — 功能错误

### 4. 撤销后首次编辑无法撤销、重做状态错乱 ✅ 已修复
- 改动：`src/hooks/useUndoRedo.ts`
- 修复：移除 `skipRef` 分支，`push` 始终入栈并清空 redo 栈。

### 5. ER 关系 id 每次应用递归追加 `dia_` 前缀 ✅ 已修复
- 改动：`src/App.tsx`（`configToERState`）
- 修复：回灌时 `id: dia.id.replace(/^(dia_)+/, '')`，兼容已被污染的旧数据。

### 6. 时序图导出 PNG/SVG 消息文字丢失 ✅ 已修复
- 改动：`src/utils/svgExport.ts`（`sequenceSvg`）

### 7. 部署图连线标签导出丢失（潜在）✅ 已修复
- 改动：`src/utils/svgExport.ts`（`deploymentSvg`）

### 8. 英文界面 MD 回环丢失 entity 段 ✅ 已修复
- 改动：`src/App.tsx`（`mdSectionMap` 增加 `'E-R Diagram': 'entity'`）

---

## P2 — 健壮性 / 体验

| # | 位置 | 修复 |
|---|------|------|
| 9 | `NodeEditor.tsx` | `uid()` 改为 `crypto.randomUUID()`（降级为时间戳+随机），避免跨会话 id 冲突 |
| 10 | `useUndoRedo.ts` | 输入框/文本域/可编辑元素内放行原生撤销，并支持 `Ctrl+Shift+Z` 重做 |
| 11 | `App.tsx` | `?` 快捷键改为按 `tagName`/`isContentEditable` 判断，排除 textarea |
| 12 | `ExportModal.tsx` + `visioExport.ts` | 新增 `erVisio` 并接入 ER 图的 Visio 导出 |
| 13 | `ExportModal.tsx` | 分图导出仅对 usecase/entity 展示，其余类型不再出现「下载分图 (0)」 |
| 14 | `SettingsModal.tsx` | 默认 API 地址统一为 `opencode.ai/zen/go/v1/chat/completions`，与 `aiService` 一致 |
| 15 | `NodeEditor.tsx` | `parseMermaidClass` 可见性前缀改为可选，支持 `String name` 形式属性 |

---

## 改动文件清单

```
src/App.tsx
src/hooks/useUndoRedo.ts
src/components/panels/NodeEditor.tsx
src/components/panels/ExportModal.tsx
src/components/panels/ExportDataModal.tsx
src/components/panels/SettingsModal.tsx
src/utils/svgExport.ts
src/utils/visioExport.ts
```

## 复验建议

1. 类图/活动图/部署图：添加节点 → 应用 → 确认左侧列表不消失 → 再应用 → 确认图形未被清空。
2. 「导出全部数据」下载 JSON → 重新导入 → 确认各图元细节（方法/属性/消息类型/技术栈/布局）保留。
3. 「导出全部数据」下载 .md → 导入 → 确认不再崩溃（原 P0 #1）。
4. 时序图：添加消息 → 导出 PNG/SVG → 确认连线带消息文字。
5. 通用：连续编辑后 Ctrl+Z / Ctrl+Y，确认每一步都能正确撤销/重做。
