import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData } from '../types/diagram'

type DNode = Node<DiagramNodeData>

// ====== Visio XML 模板 ======

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// 坐标转换：像素 → 英寸 (1英寸 = 96像素)
function pxToInch(px: number): string {
  return (px / 96).toFixed(4)
}

// ====== Content Types ======
const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>
  <Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>
</Types>`

// ====== Relationships ======
const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2006/relationships/officeDocument" Target="visio/document.xml"/>
</Relationships>`

const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>
</Relationships>`

const pagesRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>
</Relationships>`

// ====== Document XML ======
const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<visio:VisioDocument xmlns:visio="http://schemas.microsoft.com/office/visio/2012/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <visio:DocumentSettings>
    <visio:GlueSettings>8</visio:GlueSettings>
    <visio:SnapSettings>393215</visio:SnapSettings>
  </visio:DocumentSettings>
  <visio:Colors>
    <visio:ColorEntry IX="0" RGB="#000000"/>
    <visio:ColorEntry IX="1" RGB="#FFFFFF"/>
    <visio:ColorEntry IX="2" RGB="#FF0000"/>
    <visio:ColorEntry IX="3" RGB="#00FF00"/>
    <visio:ColorEntry IX="4" RGB="#0000FF"/>
  </visio:Colors>
  <visio:StyleSheets/>
  <visio:DocumentProperties>
    <visio:Title>软件工程图</visio:Title>
    <visio:Creator>SE Diagram Generator</visio:Creator>
  </visio:DocumentProperties>
  <visio:Pages>
    <visio:Page ID="1" Name="Page-1">
      <visio:PageSheet>
        <visio:PageProps PageWidth="11" PageHeight="8.5" PageScale="1" DrawingScale="1"/>
      </visio:PageSheet>
      <visio:Shapes/>
    </visio:Page>
  </visio:Pages>
</visio:VisioDocument>`

// ====== Pages XML ======
function pagesXml(pageId: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pages xmlns="http://schemas.microsoft.com/office/visio/2012/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <page id="${pageId}" name="Page-1">
    <pageSheet>
      <pageProps pageWidth="11" pageHeight="8.5" pageScale="1" drawingScale="1"/>
    </pageSheet>
    <shapes/>
  </page>
</pages>`
}

// ====== 形状生成 ======

interface VisioShape {
  id: string
  type: 'rectangle' | 'ellipse' | 'line'
  x: number
  y: number
  width: number
  height: number
  label?: string
  style?: string
}

function generateShapeXml(shape: VisioShape): string {
  const x = pxToInch(shape.x)
  const y = pxToInch(shape.y)
  const w = pxToInch(shape.width)
  const h = pxToInch(shape.height)

  let geometryXml = ''
  let textXml = ''

  if (shape.type === 'ellipse') {
    // 正确的 Visio 椭圆几何体：使用 Ellipse Row 定义中心点和半轴
    geometryXml = `<Section N="Geometry" IX="0">
      <Row N="Ellipse">
        <Cell N="X" V="Width*0.5"/>
        <Cell N="Y" V="Height*0.5"/>
        <Cell N="A" V="Width*0.5"/>
        <Cell N="B" V="Height*0.5"/>
      </Row>
    </Section>`
  } else {
    geometryXml = `<geom IX="0">
      <moveTo>
        <x>0</x>
        <y>0</y>
      </moveTo>
      <lineTo>
        <x>1</x>
        <y>0</y>
      </lineTo>
      <lineTo>
        <x>1</x>
        <y>1</y>
      </lineTo>
      <lineTo>
        <x>0</x>
        <y>1</y>
      </lineTo>
      <lineTo>
        <x>0</x>
        <y>0</y>
      </lineTo>
    </geom>`
  }

  if (shape.label) {
    textXml = `<pp IX="0" N="Char" F="Inh"/><cp IX="0" N="Char.Size" F="12pt"/>
    <pp IX="1" N="Para" F="Inh"/><cp IX="0" N="Para.HorzAlign" F="1"/>
    <txt>${escapeXml(shape.label)}</txt>`
  }

  return `<shape id="${shape.id}" name="Shape ${shape.id}">
    <xform>
      <pinX>${x}</pinX>
      <pinY>${y}</pinY>
      <width>${w}</width>
      <height>${h}</height>
    </xform>
    ${geometryXml}
    <textBlock>
      ${textXml}
    </textBlock>
  </shape>`
}

function generateLineXml(id: string, x1: number, y1: number, x2: number, y2: number): string {
  return `<shape id="${id}" name="Connector ${id}">
    <xform>
      <pinX>${pxToInch((x1 + x2) / 2)}</pinX>
      <pinY>${pxToInch((y1 + y2) / 2)}</pinY>
      <width>${pxToInch(Math.abs(x2 - x1))}</width>
      <height>${pxToInch(Math.abs(y2 - y1))}</height>
    </xform>
    <geom IX="0">
      <moveTo>
        <x>${pxToInch(x1 - (x1 + x2) / 2 + Math.abs(x2 - x1) / 2)}</x>
        <y>${pxToInch(y1 - (y1 + y2) / 2 + Math.abs(y2 - y1) / 2)}</y>
      </moveTo>
      <lineTo>
        <x>${pxToInch(x2 - (x1 + x2) / 2 + Math.abs(x2 - x1) / 2)}</x>
        <y>${pxToInch(y2 - (y1 + y2) / 2 + Math.abs(y2 - y1) / 2)}</y>
      </lineTo>
    </geom>
  </shape>`
}

// ====== 页面生成 ======

function generatePageXml(shapes: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<page xmlns="http://schemas.microsoft.com/office/visio/2012/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  id="1" name="Page-1">
  <pageSheet>
    <pageProps pageWidth="11" pageHeight="8.5" pageScale="1" drawingScale="1"/>
  </pageSheet>
  <shapes>
    ${shapes.join('\n')}
  </shapes>
</page>`
}

// ====== 布局计算 ======

function calculateLayout(nodes: DNode[], _edges: Edge[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const spacing = 200
  const startX = 100
  const startY = 100

  nodes.forEach((node, i) => {
    positions.set(node.id, {
      x: startX + (i % cols) * spacing,
      y: startY + Math.floor(i / cols) * 150
    })
  })

  return positions
}

// ====== 导出函数 ======

export async function exportToVisio(
  nodes: DNode[],
  _edges: Edge[],
  _diagramName: string,
  filename: string
): Promise<void> {
  const zip = new JSZip()
  const positions = calculateLayout(nodes, _edges)

  // 生成形状
  let shapeId = 1
  const shapes: string[] = []
  const nodeIdToShapeId = new Map<string, number>()

  // 节点形状
  nodes.forEach(node => {
    const pos = positions.get(node.id)
    if (!pos) return

    const sid = shapeId++
    nodeIdToShapeId.set(node.id, sid)

    const shape: VisioShape = {
      id: String(sid),
      type: node.type === 'ellipse' ? 'ellipse' : 'rectangle',
      x: pos.x,
      y: pos.y,
      width: 120,
      height: 60,
      label: String(node.data.label || '')
    }

    shapes.push(generateShapeXml(shape))
  })

  // 连接线
  _edges.forEach(edge => {
    const srcPos = positions.get(edge.source)
    const tgtPos = positions.get(edge.target)
    if (!srcPos || !tgtPos) return

    const sid = shapeId++
    shapes.push(generateLineXml(
      String(sid),
      srcPos.x + 60,
      srcPos.y + 30,
      tgtPos.x + 60,
      tgtPos.y + 30
    ))
  })

  // 生成页面XML
  const pageXml = generatePageXml(shapes)

  // 创建ZIP结构
  zip.file('[Content_Types].xml', contentTypesXml)
  zip.file('_rels/.rels', relsXml)
  zip.file('visio/document.xml', documentXml)
  zip.file('visio/_rels/document.xml.rels', documentRelsXml)
  zip.file('visio/pages/pages.xml', pagesXml('1'))
  zip.file('visio/pages/_rels/pages.xml.rels', pagesRelsXml)
  zip.file('visio/pages/page1.xml', pageXml)

  // 生成并下载
  const blob = await zip.generateAsync({ type: 'blob' })
  saveAs(blob, `${filename}.vsdx`)
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
