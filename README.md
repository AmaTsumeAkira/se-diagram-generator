# 软件工程图生成器 · SE Diagram Generator

在线软件工程图表绘制工具，支持**用例图、功能结构图、实体属性图、总体 ER 图、时序图、类图、活动图、部署图、程序流程图**九类图，可视化编辑，一键导出 PNG / SVG / draw.io / Visio。支持中英文切换。

## 在线访问

- **[lct.fromakira.cn](https://lct.fromakira.cn/)** （腾讯云 Pages）
- **[amatsumeakira.github.io/se-diagram-generator](https://amatsumeakira.github.io/se-diagram-generator/)** （GitHub Pages 备用）

## 功能特性

- **用例图** — 多角色火柴人 + 椭圆用例，正方形网格布局，箭头精准连接，椭圆按文字动态宽度
- **功能结构图** — 树状直角层级结构，根/模块/功能三色标签，模块外框包裹，竖排文字防溢出
- **实体属性图** — 椭圆极坐标系放射布局，多实体网格排列，等角度间距环绕
- **可视化编辑** — 双击编辑、拖拽排序、Tab 快速新建、Delete 快捷删除
- **撤销/重做** — Ctrl+Z / Ctrl+Y 编辑器全链路同步
- **快速导入** — 空格分隔文本，一行一个角色/实体，批量创建
- **导出图片** — 全图/分图裁剪导出，复制模式适配论文插图
- **导入/导出数据** — JSON 完整配置 + Markdown 快速格式，一键导入导出
- **本地持久化** — localStorage 自动保存，刷新不丢失
- **国际化** — 中文 / English 切换
- **MCP 本地服务** — 外部 AI（Claude Desktop / Cursor / Claude Code 等）通过 MCP 工具生成图并实时推送到编辑器，也能读回当前图、导出 SVG / Visio；详见 [mcp/README.md](mcp/README.md)

## 本地运行

```bash
npm install
npm run dev
```

可选：启动本地 MCP 服务（另开一个终端，编辑器工具栏点 MCP 徽标即可连接）：

```bash
npm run mcp
```

## 技术栈

React 19 + TypeScript + Vite + @xyflow/react + dagre + Tailwind CSS + i18next

## 许可证

MIT
