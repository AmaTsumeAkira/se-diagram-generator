const PX_PER_INCH = 96

export function pxToInch(px: number): number {
  return px / PX_PER_INCH
}

export function toVisioY(px: number, pageHeight: number): number {
  return pageHeight - pxToInch(px)
}

export function toVisioX(px: number): number {
  return pxToInch(px)
}

export function centerToOrigin(cx: number, cy: number, w: number, h: number) {
  return {
    x: cx - w / 2,
    y: cy - h / 2,
  }
}

export function originToCenter(ox: number, oy: number, w: number, h: number) {
  return {
    x: ox + w / 2,
    y: oy + h / 2,
  }
}
