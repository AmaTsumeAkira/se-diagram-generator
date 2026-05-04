# 软件工程图生成器

在线软件工程图表绘制工具，支持**用例图**、**系统功能结构图**、**E-R 实体属性图**三种类型，可视化编辑，一键导出 PNG。

## 在线访问

🔗 **[amatumeakira.github.io/se-diagram-generator](https://amatumeakira.github.io/se-diagram-generator/)**

## 功能特性

- **用例图** — 多角色火柴人 + 椭圆用例，网格布局，箭头精准连接
- **功能结构图** — 树状直角层级结构，根/模块/功能三色标签，模块外框包裹
- **实体属性图** — 椭圆极坐标系放射布局，多实体网格排列
- **可视化编辑** — 双击编辑、拖拽排序、Tab 快速新建、Delete 快捷删除
- **撤销/重做** — Ctrl+Z / Ctrl+Y 全链路同步
- **快速导入** — 空格分隔文本，一行一个角色/实体，批量创建
- **导出图片** — 全图/分图裁剪导出，复制模式适配论文插图
- **导入/导出数据** — JSON 完整配置 + Markdown 快速格式
- **本地持久化** — localStorage 自动保存，刷新不丢失

## 本地运行

```bash
npm install
npm run dev
```

## 技术栈

React 19 + TypeScript + Vite + @xyflow/react + dagre + Tailwind CSS

## 许可证

MIT
