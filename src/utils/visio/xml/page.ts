import type { VisioPage, VisioShape, VisioConnector } from '../types'
import { DEFAULT_STYLE, DEFAULT_LINE_STYLE, COLORS } from '../constants'
import { escapeXml } from './xmlUtils'

export function generatePagesXml(pages: VisioPage[]): string {
  const pageEntries = pages.map((_, i) =>
    `  <Page ID="${i + 1}" Name="${escapeXml(pages[i].name)}">
    <Rel Id="rId${i + 1}" Target="page${i + 1}.xml" Type="http://schemas.microsoft.com/office/visio/2010/relationships/page"/>
  </Page>`
  ).join('\n')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pages xmlns="http://schemas.microsoft.com/office/visio/2012/main">
${pageEntries}
</pages>`
}

export function generatePageXml(page: VisioPage, pageIndex: number): string {
  const shapesXml = page.shapes.map(s => generateShapeXml(s, 4)).join('\n')
  const connectorsXml = page.connectors.map(c => generateConnectorXml(c, 4)).join('\n')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Page xmlns="http://schemas.microsoft.com/office/visio/2012/main"
      ID="${pageIndex + 1}" Name="${escapeXml(page.name)}">
  <PageSheet>
    <Cell N="PageWidth" V="${page.width}"/>
    <Cell N="PageHeight" V="${page.height}"/>
    <Cell N="ShdwOffsetX" V="0.0196850393700787"/>
    <Cell N="ShdwOffsetY" V="-0.0196850393700787"/>
  </PageSheet>
  <Shapes>
${shapesXml}
${connectorsXml}
  </Shapes>
</Page>`
}

function cell(n: string, v: string | number): string {
  return `<Cell N="${n}" V="${v}"/>`
}

function generateShapeXml(shape: VisioShape, indent: number): string {
  const pad = '  '.repeat(indent)
  const s = { ...DEFAULT_STYLE, ...shape.style }

  const lines: string[] = []
  lines.push(`${pad}<Shape ID="${shape.id}" Name="${escapeXml(shape.name)}" Type="${shape.type}">`)
  lines.push(`${pad}  ${cell('PinX', shape.x)}`)
  lines.push(`${pad}  ${cell('PinY', shape.y)}`)
  lines.push(`${pad}  ${cell('Width', shape.width)}`)
  lines.push(`${pad}  ${cell('Height', shape.height)}`)

  if (shape.angle) {
    lines.push(`${pad}  ${cell('Angle', shape.angle)}`)
  }

  lines.push(`${pad}  ${cell('FillForegnd', s.fillColor)}`)
  lines.push(`${pad}  ${cell('LineColor', s.lineColor)}`)
  lines.push(`${pad}  ${cell('LineWeight', s.lineWeight)}`)
  lines.push(`${pad}  ${cell('LinePattern', 1)}`)
  lines.push(`${pad}  ${cell('Rounding', shape.cornerRadius ?? 0)}`)

  if (shape.type === 'Group') {
    lines.push(`${pad}  ${cell('ObjType', 3)}`)
    lines.push(`${pad}  <Shapes>`)
    if (shape.children) {
      for (const child of shape.children) {
        lines.push(generateShapeXml(child, indent + 3))
      }
    }
    lines.push(`${pad}  </Shapes>`)
  }

  if (shape.geometry === 'ellipse') {
    lines.push(`${pad}  <Section N="Geometry" IX="0">`)
    lines.push(`${pad}    <Row N="Ellipse">`)
    lines.push(`${pad}      <Cell N="X" V="Width*0.5"/>`)
    lines.push(`${pad}      <Cell N="Y" V="Height*0.5"/>`)
    lines.push(`${pad}      <Cell N="A" V="Width*0.5"/>`)
    lines.push(`${pad}      <Cell N="B" V="Height*0.5"/>`)
    lines.push(`${pad}    </Row>`)
    lines.push(`${pad}  </Section>`)
  } else if (shape.geometry === 'diamond') {
    lines.push(`${pad}  <Section N="Geometry" IX="0">`)
    lines.push(`${pad}    <Row N="MoveTo" T="MoveTo">`)
    lines.push(`${pad}      <Cell N="X" V="Width*0.5"/>`)
    lines.push(`${pad}      <Cell N="Y" V="Height"/>`)
    lines.push(`${pad}    </Row>`)
    lines.push(`${pad}    <Row N="LineTo" T="LineTo">`)
    lines.push(`${pad}      <Cell N="X" V="Width"/>`)
    lines.push(`${pad}      <Cell N="Y" V="Height*0.5"/>`)
    lines.push(`${pad}    </Row>`)
    lines.push(`${pad}    <Row N="LineTo" T="LineTo">`)
    lines.push(`${pad}      <Cell N="X" V="Width*0.5"/>`)
    lines.push(`${pad}      <Cell N="Y" V="0"/>`)
    lines.push(`${pad}    </Row>`)
    lines.push(`${pad}    <Row N="LineTo" T="LineTo">`)
    lines.push(`${pad}      <Cell N="X" V="0"/>`)
    lines.push(`${pad}      <Cell N="Y" V="Height*0.5"/>`)
    lines.push(`${pad}    </Row>`)
    lines.push(`${pad}    <Row N="LineTo" T="LineTo">`)
    lines.push(`${pad}      <Cell N="X" V="Width*0.5"/>`)
    lines.push(`${pad}      <Cell N="Y" V="Height"/>`)
    lines.push(`${pad}    </Row>`)
    lines.push(`${pad}  </Section>`)
  }

  if (shape.text !== undefined) {
    lines.push(`${pad}  <Text>${escapeXml(shape.text)}</Text>`)
    lines.push(`${pad}  <Cell N="Char.Size" V="${s.fontSize}pt"/>`)
    lines.push(`${pad}  <Cell N="Char.Font" V="${s.fontFamily}"/>`)
    lines.push(`${pad}  <Cell N="Char.Color" V="${COLORS.text}"/>`)
    if (s.bold) lines.push(`${pad}  <Cell N="Char.Style" V="1"/>`)
    lines.push(`${pad}  <Cell N="Para.HorzAlign" V="${alignToNum(s.horzAlign)}"/>`)
    lines.push(`${pad}  <Cell N="VerticalAlign" V="${valignToNum(s.verticalAlign)}"/>`)
  }

  lines.push(`${pad}</Shape>`)
  return lines.join('\n')
}

function generateConnectorXml(conn: VisioConnector, indent: number): string {
  const pad = '  '.repeat(indent)
  const s = { ...DEFAULT_LINE_STYLE, ...conn.style }

  const lines: string[] = []
  lines.push(`${pad}<Shape ID="${conn.id}" Name="Connector_${conn.id}" Type="Shape">`)
  lines.push(`${pad}  ${cell('BeginX', conn.beginX)}`)
  lines.push(`${pad}  ${cell('BeginY', conn.beginY)}`)
  lines.push(`${pad}  ${cell('EndX', conn.endX)}`)
  lines.push(`${pad}  ${cell('EndY', conn.endY)}`)
  lines.push(`${pad}  ${cell('LineColor', s.color)}`)
  lines.push(`${pad}  ${cell('LineWeight', s.weight)}`)
  lines.push(`${pad}  ${cell('LinePattern', s.pattern)}`)
  lines.push(`${pad}  ${cell('EndArrow', s.endArrow)}`)
  lines.push(`${pad}  ${cell('BeginArrow', s.beginArrow)}`)
  lines.push(`${pad}  ${cell('Rounding', s.rounding)}`)
  if (conn.text) {
    lines.push(`${pad}  <Text>${escapeXml(conn.text)}</Text>`)
  }
  lines.push(`${pad}</Shape>`)
  return lines.join('\n')
}

function alignToNum(align: string): number {
  switch (align) {
    case 'left': return 0
    case 'center': return 1
    case 'right': return 2
    default: return 1
  }
}

function valignToNum(align: string): number {
  switch (align) {
    case 'bottom': return 0
    case 'middle': return 1
    case 'top': return 2
    default: return 1
  }
}
