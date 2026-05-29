export interface VisioStyle {
  fillColor?: string
  lineColor?: string
  lineWeight?: number
  fontSize?: number
  fontFamily?: string
  bold?: boolean
  horzAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
}

export interface VisioLineStyle {
  color?: string
  weight?: number
  pattern?: number
  endArrow?: number
  beginArrow?: number
  rounding?: number
}

export interface VisioShape {
  id: number
  name: string
  type: 'Shape' | 'Group'
  x: number
  y: number
  width: number
  height: number
  text?: string
  style?: VisioStyle
  geometry?: 'rectangle' | 'ellipse' | 'diamond' | 'rounded'
  cornerRadius?: number
  children?: VisioShape[]
  angle?: number
}

export interface VisioConnector {
  id: number
  beginX: number
  beginY: number
  endX: number
  endY: number
  style?: VisioLineStyle
  text?: string
}

export interface VisioPage {
  name: string
  width: number
  height: number
  shapes: VisioShape[]
  connectors: VisioConnector[]
}

export interface VisioDocument {
  title: string
  author: string
  pages: VisioPage[]
}
