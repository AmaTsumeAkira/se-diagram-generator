import type { VisioStyle, VisioLineStyle } from './types'

export const COLORS = {
  fill: '#FFFFFF',
  stroke: '#000000',
  text: '#000000',
} as const

export const DEFAULT_STYLE: Required<VisioStyle> = {
  fillColor: COLORS.fill,
  lineColor: COLORS.stroke,
  lineWeight: 0.01,
  fontSize: 12,
  fontFamily: 'SimSun',
  bold: false,
  horzAlign: 'center',
  verticalAlign: 'middle',
}

export const DEFAULT_LINE_STYLE: Required<VisioLineStyle> = {
  color: COLORS.stroke,
  weight: 0.01,
  pattern: 1,
  endArrow: 4,
  beginArrow: 0,
  rounding: 0,
}

export const PAGE_SIZES = {
  A4_LANDSCAPE: { width: 11.693, height: 8.268 },
  A4_PORTRAIT: { width: 8.268, height: 11.693 },
  LETTER_LANDSCAPE: { width: 11, height: 8.5 },
} as const

export const NS = 'http://schemas.microsoft.com/office/visio/2012/main'
