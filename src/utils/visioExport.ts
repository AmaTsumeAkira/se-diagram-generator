import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData } from '../types/diagram'
import { rankOfFlow } from './layout'

type DNode = Node<DiagramNodeData>

/**
 * Visio 2013+ 绘图导出（.vsdx，OOXML/OPC 包）。
 *
 * 背景：旧实现把 VDX(2003) 风格的小写元素名（<shapes>/<shape>/<xform>）当 VSDX 写，
 * 而且 _rels/.rels 用了通用 officeDocument 关系类型、pages.xml 里的 <Page> 没有
 * <Rel r:id="rId1"/>。libvisio / Visio 都无法解析，LibreOffice 直接报
 * "source file could not be loaded"。
 *
 * 下列约束是 VSDX 能被第三方解析器（libvisio、Visio）加载的必要条件：
 *  1. 元素名大小写敏感：VisioDocument / Colors / FaceNames / StyleSheets / Pages / Page /
 *     PageSheet / Cell / Shapes / Shape / Section / Row / Text（小写是 VDX-2003 的写法）。
 *  2. _rels/.rels 必须指向 Visio 专有关系类型
 *     http://schemas.microsoft.com/visio/2010/relationships/document
 *     （写 officeDocument 关系类型会被 isOpcVisioDocument() 直接否掉）。
 *  3. visio/pages/pages.xml 的 <Page> 内必须有 <Rel r:id="rIdN"/>，并由
 *     visio/pages/_rels/pages.xml.rels 映射到 pageN.xml —— 缺了这一条，页面永远加载不到。
 *  4. <Cell> 的 V 属性必须是纯数值（颜色除外）。把公式直接写进 V（如 V="Width*0.5"）
 *     会让 libvisio 抛异常 → 整个文件被判为不可加载；公式要写在 F 属性里。
 *  5. 形状几何用 Section N="Geometry" + Row T="RelMoveTo|RelLineTo|MoveTo|LineTo"。
 *     Visio 的 Row T="Ellipse" 在 libvisio 的 VSDX 路径下不会渲染出椭圆，这里改用
 *     多边形逼近（RelLineTo 逼近，视觉上就是椭圆，且所有值都是纯数值）。
 */

const VSDX_NS = 'http://schemas.microsoft.com/office/visio/2012/main'
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types'
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

const REL_VISIO_DOCUMENT = 'http://schemas.microsoft.com/visio/2010/relationships/document'
const REL_VISIO_PAGES = 'http://schemas.microsoft.com/visio/2010/relationships/pages'
const REL_VISIO_PAGE = 'http://schemas.microsoft.com/visio/2010/relationships/page'
const REL_CORE_PROPS = 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties'
const REL_EXT_PROPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties'

const CT_DOCUMENT = 'application/vnd.ms-visio.drawing.main+xml'
const CT_PAGES = 'application/vnd.ms-visio.pages+xml'
const CT_PAGE = 'application/vnd.ms-visio.page+xml'
const CT_CORE = 'application/vnd.openxmlformats-package.core-properties+xml'
const CT_APP = 'application/vnd.openxmlformats-officedocument.extended-properties+xml'

const PX_PER_INCH = 96
const MARGIN_IN = 0.5
const DEFAULT_NODE_W = 120
const DEFAULT_NODE_H = 60
const MIN_PAGE_W = 11
const MIN_PAGE_H = 8.5
const ELLIPSE_SEGMENTS = 32
// 0.0104in ≈ 0.75pt，和 Visio 默认线宽一致
const LINE_WEIGHT = 0.0104166666666667

// ====== XML 基础工具 ======

/** 去掉 XML 1.0 不允许的控制字符（用户标签可能是任意文本/粘贴内容）。 */
function clean(s: unknown): string {
  return String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

function esc(s: unknown): string {
  return clean(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 数值写法：固定 4 位小数，避免指数写法（1e-7）和 -0 进入 V 属性。 */
function num(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const r = Math.round(n * 10000) / 10000
  return Object.is(r, -0) ? '0' : String(r)
}

function cell(n: string, v: string | number): string {
  return `<Cell N="${n}" V="${typeof v === 'number' ? num(v) : esc(v)}"/>`
}

function section(n: string, rows: string, ix = 0): string {
  return `<Section N="${n}" IX="${ix}">${rows}</Section>`
}

function row(t: string, ix: number, cells: string): string {
  return `<Row T="${t}" IX="${ix}">${cells}</Row>`
}

// ====== 几何 ======

/** 矩形：RelMoveTo/RelLineTo 的坐标是 Width/Height 的比例（0~1）。 */
function rectGeometry(): string {
  return section('Geometry', [
    cell('NoFill', 0),
    cell('NoLine', 0),
    row('RelMoveTo', 1, cell('X', 0) + cell('Y', 0)),
    row('RelLineTo', 2, cell('X', 1) + cell('Y', 0)),
    row('RelLineTo', 3, cell('X', 1) + cell('Y', 1)),
    row('RelLineTo', 4, cell('X', 0) + cell('Y', 1)),
    row('RelLineTo', 5, cell('X', 0) + cell('Y', 0)),
  ].join(''))
}

/**
 * 椭圆：用 32 段折线逼近（Visio 的 Row T="Ellipse" 在 libvisio 的 VSDX 解析路径下
 * 渲染不出椭圆，且其 X/Y/A/B 常用公式填充 —— 公式进 V 属性会让文件解析失败）。
 */
function ellipseGeometry(segments = ELLIPSE_SEGMENTS): string {
  const rows: string[] = [
    cell('NoFill', 0),
    cell('NoLine', 0),
    row('RelMoveTo', 1, cell('X', 1) + cell('Y', 0.5)),
  ]
  for (let i = 1; i <= segments; i++) {
    const a = (2 * Math.PI * i) / segments
    rows.push(row('RelLineTo', i + 1, cell('X', 0.5 + 0.5 * Math.cos(a)) + cell('Y', 0.5 + 0.5 * Math.sin(a))))
  }
  return section('Geometry', rows.join(''))
}

/** 直线：MoveTo/LineTo 用形状局部绝对坐标（原点在包围盒左下角，单位英寸）。 */
function lineGeometry(x1: number, y1: number, x2: number, y2: number): string {
  return section('Geometry', [
    cell('NoFill', 1),
    cell('NoLine', 0),
    row('MoveTo', 1, cell('X', x1) + cell('Y', y1)),
    row('LineTo', 2, cell('X', x2) + cell('Y', y2)),
  ].join(''))
}

/** 菱形（流程图的判断符号）：四点多边形，坐标全是 0~1 的纯数值。 */
function diamondGeometry(): string {
  return section('Geometry', [
    cell('NoFill', 0),
    cell('NoLine', 0),
    row('RelMoveTo', 1, cell('X', 0.5) + cell('Y', 0)),
    row('RelLineTo', 2, cell('X', 1) + cell('Y', 0.5)),
    row('RelLineTo', 3, cell('X', 0.5) + cell('Y', 1)),
    row('RelLineTo', 4, cell('X', 0) + cell('Y', 0.5)),
    row('RelLineTo', 5, cell('X', 0.5) + cell('Y', 0)),
  ].join(''))
}

/**
 * 胶囊（流程图的开始/结束符号）：矩形 + 两端半圆，折线逼近。
 *
 * 这里不用 Visio 的 Row T="RoundRect" / 圆角矩形模板：和椭圆一样，
 * 公式型几何会写进 V 属性导致 libvisio 解析失败；折线逼近则全是纯数值。
 * 半圆的绝对半径是 Height/2，换算成 RelX 就是 (Height/2)/Width = rxRel。
 */
function capsuleGeometry(rxRel: number, segments = 16): string {
  const rx = Math.max(0.02, Math.min(0.5, rxRel))
  const pts: [number, number][] = [
    [rx, 0],
    [1 - rx, 0],
  ]
  for (let i = 1; i <= segments; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / segments
    pts.push([1 - rx + rx * Math.cos(a), 0.5 + 0.5 * Math.sin(a)])
  }
  pts.push([rx, 1])
  for (let i = 1; i <= segments; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / segments
    pts.push([rx + rx * Math.cos(a), 0.5 + 0.5 * Math.sin(a)])
  }
  const rows = [cell('NoFill', 0), cell('NoLine', 0), row('RelMoveTo', 1, cell('X', pts[0][0]) + cell('Y', pts[0][1]))]
  pts.slice(1).forEach((p, i) => rows.push(row('RelLineTo', i + 2, cell('X', p[0]) + cell('Y', p[1]))))
  return section('Geometry', rows.join(''))
}


// ====== 包内容 ======

function contentTypesXml(): string {
  return XML_DECL + `<Types xmlns="${CT_NS}">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/visio/document.xml" ContentType="${CT_DOCUMENT}"/>` +
    `<Override PartName="/visio/pages/pages.xml" ContentType="${CT_PAGES}"/>` +
    `<Override PartName="/visio/pages/page1.xml" ContentType="${CT_PAGE}"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="${CT_CORE}"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="${CT_APP}"/>` +
    `</Types>`
}

function rootRelsXml(): string {
  return XML_DECL + `<Relationships xmlns="${REL_NS}">` +
    `<Relationship Id="rId1" Type="${REL_VISIO_DOCUMENT}" Target="visio/document.xml"/>` +
    `<Relationship Id="rId2" Type="${REL_CORE_PROPS}" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="${REL_EXT_PROPS}" Target="docProps/app.xml"/>` +
    `</Relationships>`
}

function documentRelsXml(): string {
  return XML_DECL + `<Relationships xmlns="${REL_NS}">` +
    `<Relationship Id="rId1" Type="${REL_VISIO_PAGES}" Target="pages/pages.xml"/>` +
    `</Relationships>`
}

function pagesRelsXml(): string {
  return XML_DECL + `<Relationships xmlns="${REL_NS}">` +
    `<Relationship Id="rId1" Type="${REL_VISIO_PAGE}" Target="page1.xml"/>` +
    `</Relationships>`
}

function coreXml(title: string): string {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  return XML_DECL + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"` +
    ` xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"` +
    ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(title)}</dc:title>` +
    `<dc:creator>SE Diagram Generator</dc:creator>` +
    `<cp:lastModifiedBy>SE Diagram Generator</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    `</cp:coreProperties>`
}

function appXml(): string {
  return XML_DECL + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"` +
    ` xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>SE Diagram Generator</Application>` +
    `<DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>` +
    `<HeadingPairs><vt:vector size="2" baseType="variant">` +
    `<vt:variant><vt:lpstr>Pages</vt:lpstr></vt:variant>` +
    `<vt:variant><vt:i4>1</vt:i4></vt:variant>` +
    `</vt:vector></HeadingPairs>` +
    `<TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Page-1</vt:lpstr></vt:vector></TitlesOfParts>` +
    `<Company></Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc>` +
    `<HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0</AppVersion>` +
    `</Properties>`
}

/** document.xml：VisioDocument 根（默认命名空间，元素名大写）。 */
function documentXml(): string {
  return XML_DECL +
    `<VisioDocument xmlns="${VSDX_NS}" xmlns:r="${R_NS}" xml:space="preserve">` +
    `<DocumentSettings TopPage="0" DefaultTextStyle="0" DefaultLineStyle="0" DefaultFillStyle="0" DefaultGuideStyle="0">` +
    `<GlueSettings>9</GlueSettings><SnapSettings>65847</SnapSettings><DynamicGridEnabled>1</DynamicGridEnabled>` +
    `</DocumentSettings>` +
    `<Colors>` +
    `<ColorEntry IX="0" RGB="#000000"/>` +
    `<ColorEntry IX="1" RGB="#FFFFFF"/>` +
    `<ColorEntry IX="2" RGB="#FF0000"/>` +
    `<ColorEntry IX="3" RGB="#00FF00"/>` +
    `<ColorEntry IX="4" RGB="#0000FF"/>` +
    `</Colors>` +
    // readFonts() 用 NameU 并按出现顺序分配字体序号（0 起），Char.Font 引用该序号
    `<FaceNames><FaceName NameU="SimSun" UnicodeRanges="0" CharSets="0" Panose="2 11 6 4 2 2 2 2 2 4" Flags="325"/></FaceNames>` +
    `<StyleSheets>` +
    `<StyleSheet ID="0" NameU="No Style" IsCustomNameU="1" Name="No Style" IsCustomName="1">` +
    cell('EnableLineProps', 1) + cell('EnableFillProps', 1) + cell('EnableTextProps', 1) +
    cell('LineWeight', LINE_WEIGHT) + cell('LineColor', 0) + cell('LinePattern', 1) + cell('Rounding', 0) +
    cell('EndArrow', 0) + cell('BeginArrow', 0) +
    cell('FillForegnd', 1) + cell('FillBkgnd', 0) + cell('FillPattern', 1) +
    cell('VerticalAlign', 1) +
    `</StyleSheet>` +
    `</StyleSheets>` +
    `</VisioDocument>`
}

/** pages.xml：<Page> 内必须带 <Rel r:id="rId1"/>，否则页不会被加载。 */
function pagesXml(pageW: number, pageH: number, pageName: string): string {
  return XML_DECL +
    `<Pages xmlns="${VSDX_NS}" xmlns:r="${R_NS}" xml:space="preserve">` +
    `<Page ID="0" NameU="${esc(pageName)}" Name="${esc(pageName)}" ViewScale="-1"` +
    ` ViewCenterX="${num(pageW / 2)}" ViewCenterY="${num(pageH / 2)}">` +
    `<PageSheet LineStyle="0" FillStyle="0" TextStyle="0">` +
    cell('PageWidth', pageW) + cell('PageHeight', pageH) +
    cell('ShdwOffsetX', 0.1) + cell('ShdwOffsetY', -0.1) +
    cell('PageScale', 1) + cell('DrawingScale', 1) +
    cell('DrawingSizeType', 0) + cell('DrawingScaleType', 0) +
    cell('InhibitSnap', 0) + cell('ShdwType', 0) + cell('ShdwScaleFactor', 1) +
    cell('PageLeftMargin', 0.25) + cell('PageRightMargin', 0.25) +
    cell('PageTopMargin', 0.25) + cell('PageBottomMargin', 0.25) +
    cell('PrintPageOrientation', 2) +
    `</PageSheet>` +
    `<Rel r:id="rId1"/>` +
    `</Page>` +
    `</Pages>`
}

/** page1.xml：根元素是 PageContents，形状全部放在 <Shapes> 里。 */
function pageXml(shapes: string[]): string {
  return XML_DECL +
    `<PageContents xmlns="${VSDX_NS}" xmlns:r="${R_NS}" xml:space="preserve">` +
    `<Shapes>${shapes.join('')}</Shapes>` +
    `</PageContents>`
}

// ====== 形状 ======

const NODE_STYLE_CELLS =
  cell('FillForegnd', '#FFFFFF') + cell('FillPattern', 1) +
  cell('LineColor', '#000000') + cell('LineWeight', LINE_WEIGHT) + cell('LinePattern', 1) +
  cell('Rounding', 0)

const LINE_STYLE_CELLS =
  cell('LineColor', '#000000') + cell('LineWeight', LINE_WEIGHT) + cell('LinePattern', 1)

const LINE_STYLE_CELLS_DASHED =
  cell('LineColor', '#808080') + cell('LineWeight', LINE_WEIGHT) + cell('LinePattern', 2)

/** 文本块 + 字符段（Size 单位英寸：0.1667in = 12pt）。 */
function textXml(label: string): string {
  const t = clean(label)
  if (!t.trim()) return ''
  return `<Text>${esc(t)}</Text>` +
    section('Character', `<Row IX="0">${cell('Size', 0.1666666666666667)}${cell('Color', '#000000')}${cell('Font', 0)}${cell('HorzAlign', 1)}${cell('VerticalAlign', 1)}</Row>`)
}

function shapeXml(
  id: number,
  name: string,
  pinX: number,
  pinY: number,
  width: number,
  height: number,
  geometry: string,
  text: string,
  styleCells: string,
): string {
  return `<Shape ID="${id}" NameU="${esc(name)}" Name="${esc(name)}" Type="Shape">` +
    cell('PinX', pinX) + cell('PinY', pinY) + cell('Width', width) + cell('Height', height) +
    styleCells + geometry + textXml(text) +
    `</Shape>`
}

// ====== 布局 ======

interface NodeBox {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  ellipse: boolean
  /**
   * 流程图专用几何（可选）：capsule=开始/结束胶囊、diamond=判断菱形。
   * 缺省时沿用椭圆/矩形，既有 8 类图的导出行为完全不变。
   */
  kind?: 'capsule' | 'diamond'
}

interface EdgeLine {
  id: string
  label: string
  x1: number
  y1: number
  x2: number
  y2: number
  dashed?: boolean
  /** 终点画实心箭头（流程图用；缺省与既有 8 类图一致：无箭头） */
  arrow?: boolean
}

const ELLIPSE_TYPES = new Set(['ellipse', 'usecase', 'erAttribute', 'start', 'end', 'decision', 'erDiamond'])

const H_GAP = 60
const V_GAP = 80

/** 粗略按字符宽度估文本尺寸（CJK 按 1em，ASCII 按 0.6em），和 drawio 导出的口径一致。 */
function textWidth(s: string, fs = 14): number {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) > 127 ? fs : fs * 0.6
  return w
}

/**
 * 配置里的节点没有 position（编辑器配置只存 id/type/label/业务字段），
 * 所以这里自己算尺寸并做分层布局，否则所有形状会叠在一个点上。
 */
function measureNode(n: DNode): { w: number; h: number; ellipse: boolean } {
  const data = (n.data ?? {}) as Record<string, unknown>
  const type = String(n.type ?? '')
  const lines = textOf(n).split('\n')
  const tw = Math.max(0, ...lines.map((l) => textWidth(l)))
  switch (type) {
    case 'class':
    case 'interface':
    case 'enum': {
      const attrs = (data.attributes as string[] | undefined) ?? []
      const methods = (data.methods as string[] | undefined) ?? []
      const w = Math.max(200, Math.min(420, tw + 40))
      const h = 26 + Math.max(24, attrs.length * 18 + 8) + Math.max(24, methods.length * 18 + 8)
      return { w, h: h + 8, ellipse: false }
    }
    case 'actor':
      return { w: 60, h: 96, ellipse: false }
    case 'usecase':
      return { w: Math.max(120, tw + 40), h: 60, ellipse: true }
    case 'erEntity':
      return { w: Math.max(110, Math.min(260, tw + 30)), h: 46, ellipse: false }
    case 'erDiamond':
      return { w: Math.max(80, tw + 24), h: 50, ellipse: true }
    case 'ellipse':
    case 'erAttribute':
      return { w: Math.max(100, Math.min(240, tw + 30)), h: 48, ellipse: true }
    case 'start':
    case 'end':
      return { w: 32, h: 32, ellipse: true }
    case 'decision':
      return { w: Math.max(120, tw + 40), h: 70, ellipse: true }
    case 'database':
      return { w: 120, h: 80, ellipse: false }
    case 'participant':
      return { w: 130, h: 54, ellipse: false }
    default:
      return { w: Math.max(110, Math.min(280, tw + 30)), h: 56, ellipse: false }
  }
}

/**
 * 形状显示文本：类/接口/枚举把成员也写进去（VSDX 的 <Text> 支持换行，
 * 实测 LibreOffice 会把换行渲染成多行），避免导出后成员信息丢失。
 */
function textOf(n: DNode): string {
  const data = (n.data ?? {}) as Record<string, unknown>
  const type = String(n.type ?? '')
  const label = String(data.label ?? '')
  if (type === 'class' || type === 'interface' || type === 'enum') {
    const stereotype =
      (typeof data.stereotype === 'string' && data.stereotype) ||
      (type === 'interface' ? 'interface' : type === 'enum' ? 'enumeration' : '')
    const head = stereotype ? `\u00ab${stereotype}\u00bb\n${label}` : label
    const attrs = ((data.attributes as string[] | undefined) ?? []).filter(Boolean)
    const methods = ((data.methods as string[] | undefined) ?? []).filter(Boolean)
    return [head, ...attrs, ...methods].join('\n')
  }
  const tech = typeof data.technology === 'string' ? data.technology : ''
  return tech ? `${label}\n${tech}` : label
}

/**
 * 分层布局：按有向边的 BFS 深度分层（无入边的节点在最上层），
 * 同层横向居中排列；孤立/环上的节点按出现顺序补齐层号，保证都能落位。
 */
function layoutNodes(nodes: DNode[], edges: Edge[]): NodeBox[] {
  const known = new Set(nodes.map((n) => n.id))
  const adj = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  nodes.forEach((n) => {
    adj.set(n.id, [])
    indeg.set(n.id, 0)
  })
  edges.forEach((e) => {
    if (!known.has(e.source) || !known.has(e.target) || e.source === e.target) return
    adj.get(e.source)!.push(e.target)
    // 反向也连上：仅用于连通性兜底
    adj.get(e.target)!.push(e.source)
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
  })

  const rank = new Map<string, number>()
  const queue: string[] = []
  nodes.forEach((n) => {
    if ((indeg.get(n.id) ?? 0) === 0) {
      rank.set(n.id, 0)
      queue.push(n.id)
    }
  })
  // 全是环（没有入度为 0 的节点）时，从第一个节点开始
  if (queue.length === 0 && nodes.length > 0) {
    rank.set(nodes[0].id, 0)
    queue.push(nodes[0].id)
  }
  while (queue.length > 0) {
    const id = queue.shift()!
    const r = rank.get(id) ?? 0
    for (const nb of adj.get(id) ?? []) {
      if (!rank.has(nb)) {
        rank.set(nb, r + 1)
        queue.push(nb)
      }
    }
  }
  // 未连通的节点（不属于任何入度为 0 的连通分量）放到最后一行之后
  let fallback = 0
  rank.forEach((r) => {
    fallback = Math.max(fallback, r + 1)
  })
  nodes.forEach((n) => {
    if (!rank.has(n.id)) rank.set(n.id, fallback)
  })

  const rows = new Map<number, DNode[]>()
  nodes.forEach((n) => {
    const r = rank.get(n.id) ?? 0
    const list = rows.get(r)
    if (list) list.push(n)
    else rows.set(r, [n])
  })

  const sizes = new Map<string, { w: number; h: number; ellipse: boolean }>()
  nodes.forEach((n) => sizes.set(n.id, measureNode(n)))

  const rowIds = [...rows.keys()].sort((a, b) => a - b)
  const rowWidth = (list: DNode[]) =>
    list.reduce((sum, n, i) => sum + (sizes.get(n.id)?.w ?? DEFAULT_NODE_W) + (i > 0 ? H_GAP : 0), 0)

  // 某一层节点太多时折行，否则整页会被拉成几十英寸宽（用例图尤其明显）
  const MAX_ROW_W = 1200
  const packedRows: DNode[][] = []
  rowIds.forEach((r) => {
    let chunk: DNode[] = []
    ;(rows.get(r) ?? []).forEach((n) => {
      const w = sizes.get(n.id)?.w ?? DEFAULT_NODE_W
      if (chunk.length > 0 && rowWidth(chunk) + w + H_GAP > MAX_ROW_W) {
        packedRows.push(chunk)
        chunk = []
      }
      chunk.push(n)
    })
    if (chunk.length > 0) packedRows.push(chunk)
  })

  const maxRowW = Math.max(1, ...packedRows.map((list) => rowWidth(list)))

  const boxes: NodeBox[] = []
  let y = 0
  packedRows.forEach((list) => {
    const rowH = Math.max(DEFAULT_NODE_H, ...list.map((n) => sizes.get(n.id)?.h ?? DEFAULT_NODE_H))
    let x = (maxRowW - rowWidth(list)) / 2
    list.forEach((n) => {
      const s = sizes.get(n.id) ?? { w: DEFAULT_NODE_W, h: DEFAULT_NODE_H, ellipse: false }
      boxes.push({
        id: n.id,
        label: textOf(n),
        x,
        y: y + (rowH - s.h) / 2,
        w: Math.max(20, s.w),
        h: Math.max(12, s.h),
        ellipse: s.ellipse || ELLIPSE_TYPES.has(String(n.type ?? '')),
      })
      x += s.w + H_GAP
    })
    y += rowH + V_GAP
  })

  // 保持与传入 nodes 相同的顺序，方便排查
  const byId = new Map(boxes.map((b) => [b.id, b]))
  return nodes.map((n) => byId.get(n.id)!).filter(Boolean)
}

function edgeLabel(e: Edge): string {
  const top = (e as { label?: string }).label
  const inData = (e.data as { label?: string } | undefined)?.label
  return String(top || inData || '')
}

// ====== 导出函数 ======

/**
 * 画布像素盒子 + 连线 → .vsdx 并触发下载（页面尺寸、坐标换算、OPC 打包的唯一实现）。
 *
 * 从 exportToVisio 里原样抽出来，供流程图复用：流程图的节点几何多了胶囊/菱形两态，
 * 但页面尺寸、Y 轴翻转、部件清单这些必须是同一份，避免两处实现走偏。
 */
async function emitVisio(
  boxes: NodeBox[],
  lines: EdgeLine[],
  diagramName: string,
  filename: string,
): Promise<void> {
  // 内容包围盒 → 页面尺寸（英寸，向上取到 0.5in 网格）
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  boxes.forEach((b) => {
    grow(b.x, b.y)
    grow(b.x + b.w, b.y + b.h)
  })
  lines.forEach((l) => {
    grow(l.x1, l.y1)
    grow(l.x2, l.y2)
  })
  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = 0
    maxY = 0
  }

  const ceilHalf = (v: number) => Math.ceil(v * 2) / 2
  const pageW = Math.max(MIN_PAGE_W, ceilHalf((maxX - minX) / PX_PER_INCH + MARGIN_IN * 2))
  const pageH = Math.max(MIN_PAGE_H, ceilHalf((maxY - minY) / PX_PER_INCH + MARGIN_IN * 2))

  // 画布像素 → Visio 英寸（Visio 原点在左下角，Y 轴向上）
  const vx = (px: number) => (px - minX) / PX_PER_INCH + MARGIN_IN
  const vy = (py: number) => pageH - ((py - minY) / PX_PER_INCH + MARGIN_IN)

  const shapes: string[] = []
  let shapeId = 1

  // 先画连线（后画的节点覆盖线头，避免线穿进框里）
  lines.forEach((l) => {
    const x1 = vx(l.x1)
    const y1 = vy(l.y1)
    const x2 = vx(l.x2)
    const y2 = vy(l.y2)
    const left = Math.min(x1, x2)
    const bottom = Math.min(y1, y2)
    const w = Math.abs(x2 - x1)
    const h = Math.abs(y2 - y1)
    shapes.push(
      shapeXml(
        shapeId++,
        `Connector${l.id}`,
        (x1 + x2) / 2,
        (y1 + y2) / 2,
        w,
        h,
        lineGeometry(x1 - left, y1 - bottom, x2 - left, y2 - bottom),
        l.label,
        l.dashed ? LINE_STYLE_CELLS_DASHED : l.arrow ? LINE_STYLE_CELLS_ARROW : LINE_STYLE_CELLS,
      ),
    )
  })

  // 再画节点
  boxes.forEach((b) => {
    shapes.push(
      shapeXml(
        shapeId++,
        `Node${b.id}`,
        vx(b.x + b.w / 2),
        vy(b.y + b.h / 2),
        b.w / PX_PER_INCH,
        b.h / PX_PER_INCH,
        b.kind === 'capsule'
          ? capsuleGeometry(b.h / 2 / Math.max(1, b.w))
          : b.kind === 'diamond'
            ? diamondGeometry()
            : b.ellipse
              ? ellipseGeometry()
              : rectGeometry(),
        b.label,
        NODE_STYLE_CELLS,
      ),
    )
  })

  const pageName = diagramName || 'Page-1'
  const zip = new JSZip()
  zip.file('[Content_Types].xml', contentTypesXml())
  zip.file('_rels/.rels', rootRelsXml())
  zip.file('docProps/core.xml', coreXml(pageName))
  zip.file('docProps/app.xml', appXml())
  zip.file('visio/document.xml', documentXml())
  zip.file('visio/_rels/document.xml.rels', documentRelsXml())
  zip.file('visio/pages/pages.xml', pagesXml(pageW, pageH, pageName))
  zip.file('visio/pages/_rels/pages.xml.rels', pagesRelsXml())
  zip.file('visio/pages/page1.xml', pageXml(shapes))

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.ms-visio.drawing',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  saveAs(blob, `${filename}.vsdx`)
}

export async function exportToVisio(
  nodes: DNode[],
  edges: Edge[],
  diagramName: string,
  filename: string,
): Promise<void> {
  // 时序图不是层级图：参与者并排一行，消息按先后画成水平线，生命线用虚线垂下
  const isSequence = nodes.length > 0 && nodes.every((n) => String(n.type ?? '') === 'participant')

  let boxes: NodeBox[]
  const lines: EdgeLine[] = []

  if (isSequence) {
    const sizes = nodes.map((n) => measureNode(n))
    const colW = Math.max(140, ...sizes.map((s) => s.w)) + 80
    boxes = nodes.map((n, i) => {
      const s = sizes[i]
      return {
        id: n.id,
        label: textOf(n),
        x: i * colW + (colW - s.w) / 2,
        y: 0,
        w: Math.max(20, s.w),
        h: Math.max(12, s.h),
        ellipse: s.ellipse,
      }
    })
    const byId = new Map(boxes.map((b) => [b.id, b]))
    const headerH = Math.max(DEFAULT_NODE_H, ...sizes.map((s) => s.h))
    const msgTop = headerH + 60
    const msgGap = 60
    const bottom = msgTop + Math.max(1, edges.length) * msgGap + 30
    boxes.forEach((b) => {
      lines.push({ id: `life-${b.id}`, label: '', x1: b.x + b.w / 2, y1: b.y + b.h, x2: b.x + b.w / 2, y2: bottom, dashed: true })
    })
    edges.forEach((e, i) => {
      const src = byId.get(e.source)
      const tgt = byId.get(e.target)
      if (!src || !tgt) return
      const y = msgTop + i * msgGap
      lines.push({ id: `m${i}`, label: edgeLabel(e), x1: src.x + src.w / 2, y1: y, x2: tgt.x + tgt.w / 2, y2: y })
    })
  } else {
    boxes = layoutNodes(nodes, edges)
    const byId = new Map(boxes.map((b) => [b.id, b]))
    edges.forEach((e, i) => {
      const src = byId.get(e.source)
      const tgt = byId.get(e.target)
      if (!src || !tgt) return
      lines.push({
        id: `e${i}`,
        label: edgeLabel(e),
        x1: src.x + src.w / 2,
        y1: src.y + src.h / 2,
        x2: tgt.x + tgt.w / 2,
        y2: tgt.y + tgt.h / 2,
      })
    })
  }

  await emitVisio(boxes, lines, diagramName || 'Page-1', filename)
}

// ====== 程序流程图 ======

/** 流程图连线样式：在基础线样式上补一个实心终点箭头（仅流程图使用，不影响其它图）。 */
const LINE_STYLE_CELLS_ARROW = LINE_STYLE_CELLS + cell('EndArrow', 4)

/**
 * 程序流程图 → .vsdx。
 *
 * 不复用 exportToVisio 的默认形状表：那张表里 decision 走的是椭圆、start/end 是 32×32 的
 * 圆点（文字装不下），而流程图需要「判断=菱形、开始/结束=胶囊」。所以这里自己算盒子，
 * 再交给同一份 emitVisio 打包（页面尺寸 / Y 轴翻转 / OPC 部件清单完全共用）。
 * 布局用与 drawio 相同的 rankOfFlow：从 start 出发分层、自顶向下、层内居中。
 */
export async function flowchartVisio(nodes: DNode[], edges: Edge[]): Promise<void> {
  const H_GAP = 60
  const V_GAP = 70
  const rank = rankOfFlow(nodes, edges)

  const sizeOf = (n: DNode) => {
    const label = String(n.data?.label ?? '')
    const tw = textWidth(label)
    switch (String(n.type ?? '')) {
      case 'start':
      case 'end':
        return { w: Math.max(100, Math.round(tw) + 44), h: 40, kind: 'capsule' as const }
      case 'decision': {
        const w = Math.max(120, Math.round(tw * 2) + 20)
        return { w, h: Math.max(64, Math.round(w * 0.6)), kind: 'diamond' as const }
      }
      default:
        return { w: Math.max(120, Math.round(tw) + 40), h: 50, kind: undefined }
    }
  }

  const sizes = new Map<string, { w: number; h: number; kind?: 'capsule' | 'diamond' }>()
  nodes.forEach((n) => sizes.set(n.id, sizeOf(n)))

  const byRank = new Map<number, string[]>()
  nodes.forEach((n) => {
    const r = rank.get(n.id) ?? 0
    const list = byRank.get(r)
    if (list) list.push(n.id)
    else byRank.set(r, [n.id])
  })
  const ranks = [...byRank.keys()].sort((a, b) => a - b)

  const rowInfo = new Map<number, { y: number; h: number; w: number }>()
  let cursorY = 0
  for (const r of ranks) {
    const ids = byRank.get(r)!
    const h = Math.max(30, ...ids.map((id) => sizes.get(id)!.h))
    const w = ids.reduce((sum, id) => sum + sizes.get(id)!.w, 0) + (ids.length - 1) * H_GAP
    rowInfo.set(r, { y: cursorY, h, w })
    cursorY += h + V_GAP
  }
  const maxRowW = Math.max(1, ...[...rowInfo.values()].map((i) => i.w))

  const boxes: NodeBox[] = []
  for (const r of ranks) {
    const ids = byRank.get(r)!
    const info = rowInfo.get(r)!
    let x = (maxRowW - info.w) / 2
    ids.forEach((id) => {
      const s = sizes.get(id)!
      const n = nodes.find((nd) => nd.id === id)!
      boxes.push({
        id,
        label: String(n.data?.label ?? ''),
        x,
        y: info.y + (info.h - s.h) / 2,
        w: s.w,
        h: s.h,
        ellipse: false,
        kind: s.kind,
      })
      x += s.w + H_GAP
    })
  }

  // 正交折线：向下走时「底出 → 中间横线 → 顶入」，条件文字挂在中间横线上（不会被竖线压扁）；
  // 回边 / 同层分支按左右侧出侧入。
  const boxById = new Map(boxes.map((b) => [b.id, b]))
  const lines: EdgeLine[] = []
  edges.forEach((e, i) => {
    const s = boxById.get(e.source)
    const t = boxById.get(e.target)
    if (!s || !t) return
    const label = edgeLabel(e)
    const scx = s.x + s.w / 2
    const tcx = t.x + t.w / 2
    const scy = s.y + s.h / 2
    const tcy = t.y + t.h / 2
    if (tcy > scy + 1) {
      const y1 = s.y + s.h
      const y2 = t.y
      if (Math.abs(tcx - scx) < 1) {
        lines.push({ id: `e${i}`, arrow: true, label, x1: scx, y1, x2: scx, y2 })
      } else {
        const midY = (y1 + y2) / 2
        lines.push({ id: `e${i}a`, label: '', x1: scx, y1, x2: scx, y2: midY })
        lines.push({ id: `e${i}b`, label, x1: scx, y1: midY, x2: tcx, y2: midY })
        lines.push({ id: `e${i}c`, label: '', arrow: true, x1: tcx, y1: midY, x2: tcx, y2 })
      }
    } else if (tcx >= scx) {
      lines.push({ id: `e${i}`, arrow: true, label, x1: s.x + s.w, y1: scy, x2: t.x, y2: tcy })
    } else {
      lines.push({ id: `e${i}`, arrow: true, label, x1: s.x, y1: scy, x2: t.x + t.w, y2: tcy })
    }
  })

  await emitVisio(boxes, lines, '程序流程图', '程序流程图')
}

// ====== 快捷导出函数 ======

export async function useCaseVisio(nodes: DNode[], edges: Edge[]): Promise<void> {
  await exportToVisio(nodes, edges, '用例图', '用例图')
}

export async function structureVisio(nodes: DNode[], edges: Edge[]): Promise<void> {
  await exportToVisio(nodes, edges, '功能结构图', '功能结构图')
}

export async function entityVisio(nodes: DNode[], edges: Edge[]): Promise<void> {
  await exportToVisio(nodes, edges, '实体属性图', '实体属性图')
}

export async function erVisio(nodes: DNode[], edges: Edge[]): Promise<void> {
  await exportToVisio(nodes, edges, '总体ER图', '总体ER图')
}

export async function sequenceVisio(nodes: DNode[], edges: Edge[]): Promise<void> {
  await exportToVisio(nodes, edges, '时序图', '时序图')
}

export async function classVisio(nodes: DNode[], edges: Edge[]): Promise<void> {
  await exportToVisio(nodes, edges, '类图', '类图')
}

export async function activityVisio(nodes: DNode[], edges: Edge[]): Promise<void> {
  await exportToVisio(nodes, edges, '活动图', '活动图')
}

export async function deploymentVisio(nodes: DNode[], edges: Edge[]): Promise<void> {
  await exportToVisio(nodes, edges, '部署图', '部署图')
}
