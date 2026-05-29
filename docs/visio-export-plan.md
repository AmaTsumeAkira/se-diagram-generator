# Visio (.vsdx) 导出功能实现方案

> 项目：SE Diagram Generator | 技术栈：React 19 + TypeScript + Vite

---

## 一、Visio文件格式技术原理

### 1.1 VSDX文件结构（OPC规范）

VSDX基于 **OPC（Open Packaging Convention）** 格式，本质是一个ZIP压缩包：

```
diagram.vsdx (ZIP)
├── [Content_Types].xml          # MIME类型注册表
├── _rels/
│   └── .rels                    # 根关系（指向docProps和visio）
├── docProps/
│   ├── app.xml                  # 应用属性
│   └── core.xml                 # 核心元数据（标题/作者/时间）
├── visio/
│   ├── document.xml             # 文档主入口
│   ├── _rels/
│   │   └── document.xml.rels    # 文档关系（指向pages/masters/styles）
│   ├── pages/
│   │   ├── pages.xml            # 页面列表
│   │   ├── page1.xml            # 页面1的形状数据
│   │   └── _rels/
│   │       └── pages.xml.rels   # 页面关系
│   ├── masters/
│   │   ├── masters.xml          # 主控形状列表
│   │   └── master1.xml          # 主控形状定义
│   ├── styles/
│   │   └── styles.xml           # 样式表
│   └── medi/                    # 嵌入资源（图片等）
```

### 1.2 核心XML结构

**页面XML (visio/pages/page1.xml)：**
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Page xmlns="http://schemas.microsoft.com/office/visio/2012/main"
      ID="1" Name="Page-1">
  <PageSheet>
    <Cell N="PageWidth" V="8.5"/>   <!-- 页面宽（英寸） -->
    <Cell N="PageHeight" V="11"/>   <!-- 页面高（英寸） -->
  </PageSheet>
  <Shapes>
    <Shape ID="1" Name="Rectangle" Type="Shape">
      <Cell N="PinX" V="4.25"/>     <!-- 中心X -->
      <Cell N="PinY" V="5.5"/>      <!-- 中心Y -->
      <Cell N="Width" V="2"/>       <!-- 宽（英寸） -->
      <Cell N="Height" V="1"/>      <!-- 高（英寸） -->
      <Cell N="FillForegnd" V="#FFFFFF"/>
      <Cell N="LineColor" V="#000000"/>
      <Cell N="LineWeight" V="0.01"/>
      <Cell N="Char.Size" V="12pt"/>
      <Text>Hello World</Text>
    </Shape>
    <Shape ID="2" Name="Connector" Type="Shape">
      <Cell N="BeginX" V="5.25"/>
      <Cell N="BeginY" V="5"/>
      <Cell N="EndX" V="8"/>
      <Cell N="EndY" V="5"/>
      <Cell N="EndArrow" V="4"/>
    </Shape>
  </Shapes>
</Page>
```

### 1.3 ShapeSheet单元格说明

| 单元格 | 说明 | 示例 |
|--------|------|------|
| PinX / PinY | 形状中心坐标（英寸） | 4.25, 5.5 |
| Width / Height | 形状尺寸（英寸） | 2.0, 1.0 |
| FillForegnd | 填充色 | #FFFFFF |
| LineColor | 边框色 | #000000 |
| LineWeight | 线宽（英寸） | 0.01 |
| Char.Size | 字号 | 12pt |
| Char.Font | 字体 | SimSun |
| BeginX/Y, EndX/Y | 连接器起止点 | - |
| EndArrow | 箭头类型 | 4=实心箭头 |
| Geometry section | 自定义几何路径 | 椭圆/菱形等 |

---

## 二、与Drawio格式异同分析

### 2.1 格式对比

| 维度 | Drawio (.drawio) | Visio (.vsdx) |
|------|------------------|---------------|
| **文件结构** | 单XML文件 | ZIP压缩包（OPC） |
| **坐标原点** | 左上角（像素） | 左下角（英寸） |
| **单位** | 像素 (px) | 英寸 (in) |
| **形状定义** | mxCell + style字符串 | Shape + ShapeSheet Cell |
| **连线方式** | source/target属性引用 | BeginX/Y, EndX/Y 坐标 或 Connect元素 |
| **样式系统** | CSS-like分号分隔字符串 | 结构化Cell属性 |
| **文本** | value属性（HTML转义） | Text子元素 |
| **主控形状** | 无（每次完整定义） | Masters系统（复用模板） |
| **字体嵌入** | 不支持 | 支持 |

### 2.2 坐标转换公式

```
1英寸 = 96像素（标准屏幕DPI）

Drawio (px, 左上原点) → VSDX (in, 左下原点):
  vsdx_x = drawio_x / 96
  vsdx_y = pageHeight - (drawio_y / 96)
```

### 2.3 元素映射关系

| 图表元素 | Drawio | VSDX |
|---------|--------|------|
| 矩形 | `<mxCell style="whiteSpace=wrap;...">` | `<Shape Type="Shape"> + <Cell N="Geometry">` |
| 椭圆 | `<mxCell style="ellipse;...">` | `<Shape> + <Section N="Geometry"><Row N="Ellipse">` |
| 菱形 | `<mxCell style="rhombus;...">` | `<Shape> + Geometry Section 定义4个顶点 |
| 连线 | `<mxCell edge="1" source="A" target="B">` | `<Shape> + BeginX/Y + EndX/Y + EndArrow` |
| 文本 | `value="&lt;b&gt;标签&lt;/b&gt;"` | `<Text>标签</Text>` 或内联格式 |

---

## 三、技术方案选择分析

### 方案A：使用ts-visio库

| 项目 | 评估 |
|------|------|
| 库名 | ts-visio (npm) |
| 状态 | 开发中（Warning: Under Construction） |
| 语言 | TypeScript (MIT) |
| 功能 | 创建/读取/修改vsdx，支持形状、连接、样式、主控、泳道、图层 |
| 优势 | API完善，功能丰富（矩形/椭圆/菱形/圆角/三角/平行四边形） |
| 劣势 | 主要面向Node.js，浏览器兼容需额外适配；仍在开发中 |
| 月下载 | 254 |

### 方案B：基于OPC/XML手工构建

| 项目 | 评估 |
|------|------|
| 依赖 | jszip（OPC打包） + 手写XML模板 |
| 优势 | 完全可控，无第三方库风险，精确匹配需求 |
| 劣势 | 开发工作量大，需深入理解VSDX规范 |
| 适用 | 对格式有精确要求、有充足开发时间 |

### 方案C：Drawio → VSDX格式转换

| 项目 | 评估 |
|------|------|
| 思路 | 复用现有drawio导出 → 解析XML → 映射为VSDX结构 |
| 优势 | 逻辑复用，两套导出共享数据转换层 |
| 劣势 | 需处理坐标/单位/样式差异；无现成转换库 |
| 适用 | 快速原型 |

### 方案D：SVG嵌入VSDX

| 项目 | 评估 |
|------|------|
| 思路 | 生成SVG → 作为图片嵌入vsdx |
| 优势 | 实现简单，复用现有SVG导出 |
| 劣势 | **生成的Visio不可编辑**，不符合需求 |
| 适用 | 仅需视觉展示 |

### 推荐：方案B（手工OPC/XML构建）

**理由：**
1. 项目图表类型明确（7种），形状种类有限，手工构建可控
2. `ts-visio` 仍在开发中，浏览器兼容性存疑
3. jszip是成熟的浏览器端ZIP库，可直接处理OPC打包
4. 与现有drawioExport.ts架构一致，维护成本低
5. 黑白配色需求简单，无需复杂样式系统

---

## 四、推荐实现方案

### 4.1 需要安装的npm包

```bash
npm install jszip file-saver
npm install -D @types/file-saver
```

| 包名 | 用途 | 说明 |
|------|------|------|
| jszip | 创建ZIP/OPC包 | 浏览器端ZIP操作，26KB gzip |
| file-saver | 触发文件下载 | `saveAs(blob, filename)` |

### 4.2 项目文件结构

```
src/utils/
├── drawioExport.ts        # 现有
├── svgExport.ts           # 现有
├── visioExport.ts         # 新增：入口 + 图表专用函数
└── visio/
    ├── types.ts           # 类型定义
    ├── constants.ts       # 黑白配色/字体常量
    ├── coordinate.ts      # 坐标转换工具
    ├── opc.ts             # OPC打包（jszip封装）
    └── xml/
        ├── contentTypes.ts  # [Content_Types].xml
        ├── rels.ts          # _rels/*.xml
        ├── core.ts          # docProps/core.xml
        ├── document.ts      # visio/document.xml
        └── page.ts          # visio/pages/pageN.xml + pages.xml
```

### 4.3 关键实现代码

详见 `src/utils/visio/` 目录。核心文件说明：

- `types.ts` — VisioShape、VisioConnector、VisioDocument等接口定义
- `constants.ts` — COLORS（黑白）、DEFAULT_STYLE、PAGE_SIZE
- `coordinate.ts` — pxToInch()、toVisioY() 坐标转换
- `opc.ts` — buildVisioBlob(doc) 将Document对象打包为VSDX Blob
- `xml/*.ts` — 各XML部件的模板生成函数

### 4.4 对外API设计

```typescript
// 统一导出入口，与drawioExport结构一致
export async function useCaseVisio(nodes: DNode[], edges: Edge[]): Promise<Blob>
export async function structureVisio(nodes: DNode[], edges: Edge[]): Promise<Blob>
export async function entityVisio(nodes: DNode[], edges: Edge[]): Promise<Blob>
export async function sequenceVisio(nodes: DNode[], edges: Edge[]): Promise<Blob>
export async function classVisio(nodes: DNode[], edges: Edge[]): Promise<Blob>
export async function activityVisio(nodes: DNode[], edges: Edge[]): Promise<Blob>
export async function deploymentVisio(nodes: DNode[], edges: Edge[]): Promise<Blob>

// 下载辅助
export function downloadVisio(blob: Blob, filename: string): void
```

---

## 五、测试验证方案

### 5.1 文件结构验证

- 用7-Zip打开.vsd文件，验证目录结构符合OPC规范
- 检查 `[Content_Types].xml` 包含所有必需的Override
- 检查 `_rels/.rels` 正确引用docProps和visio

### 5.2 XML格式验证

- 验证所有XML是well-formed（无语法错误）
- 验证Shape ID唯一且连续
- 验证坐标值在页面范围内
- 验证Connect引用的Shape ID存在

### 5.3 Visio软件验证

- 使用Microsoft Visio打开生成的.vsd文件
- 验证形状正确显示（矩形/椭圆/连线）
- 验证文本内容和字体正确
- 验证形状可选中、可拖拽、可编辑
- 验证黑白配色符合论文打印要求

### 5.4 兼容性验证

- LibreOffice Draw 打开测试
- WPS Office 打开测试
- 在线Visio查看器（Office Online）测试

### 5.5 自动化测试

```typescript
import JSZip from 'jszip';

// 验证生成的VSDX包含必需文件
async function validateVsdx(blob: Blob) {
  const zip = await JSZip.loadAsync(blob);

  // 必需文件检查
  const required = [
    '[Content_Types].xml',
    '_rels/.rels',
    'docProps/core.xml',
    'visio/document.xml',
    'visio/pages/pages.xml',
    'visio/pages/page1.xml',
  ];

  for (const f of required) {
    const file = zip.file(f);
    if (!file) throw new Error(`Missing: ${f}`);

    const content = await file.async('text');
    if (f.endsWith('.xml')) {
      // 验证XML well-formed
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'application/xml');
      const errors = doc.getElementsByTagName('parsererror');
      if (errors.length > 0) throw new Error(`Invalid XML: ${f}`);
    }
  }

  return true;
}
```

---

## 六、新增图表类型支持

对于时序图、类图、活动图、部署图，需扩展 `DiagramNodeData` 类型：

```typescript
// 新增节点类型
type NodeType = 'actor' | 'usecase' | 'rectangle' | 'ellipse'
  | 'lifeline'      // 时序图生命线
  | 'activation'    // 时序图激活条
  | 'classbox'      // 类图类框
  | 'activity'      // 活动图节点
  | 'swimlane'      // 泳道
  | 'node3d'        // 部署图3D节点
  | 'component'     // 组件
```

每种新图表需实现：
1. `xxxDrawio()` — Drawio XML导出（已有模式）
2. `xxxSvg()` — SVG导出（已有模式）
3. `xxxVisio()` — Visio VSDX导出（新增）

---

## 七、实施步骤

| 步骤 | 内容 | 预估工时 |
|------|------|----------|
| 1 | 安装依赖（jszip, file-saver） | 5min |
| 2 | 创建 `src/utils/visio/` 目录结构 | 15min |
| 3 | 实现类型定义（types.ts） | 30min |
| 4 | 实现坐标转换工具（coordinate.ts） | 15min |
| 5 | 实现XML生成器（5个xml文件） | 2h |
| 6 | 实现OPC打包（opc.ts） | 30min |
| 7 | 实现3种现有图表的Visio导出 | 1.5h |
| 8 | 单元测试 + 验证 | 1h |
| 9 | 实现4种新增图表的Visio导出 | 2h |
| 10 | 集成测试 + 文档 | 1h |
| **总计** | | **~9h** |
