import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import * as pako from 'pako'
import type { Edge, Node } from '@xyflow/react'
import { erDrawio } from '../../utils/drawioExport'
import type { DiagramNodeData } from '../../types/diagram'

interface Props {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
}

function encodeDiagram(xml: string): string {
  const deflated = pako.deflateRaw(xml)
  let bin = ''
  deflated.forEach((b: number) => { bin += String.fromCharCode(b) })
  return encodeURIComponent(btoa(bin))
}

export default function ERDiagram({ nodes, edges }: Props) {
  const { t } = useTranslation()
  const xml = useMemo(() => erDrawio(nodes, edges), [nodes, edges])
  const src = useMemo(() => {
    const enc = encodeDiagram(xml)
    return `https://viewer.diagrams.net/?lightbox=1&layers=0&nav=0#R${enc}`
  }, [xml])

  return (
    <iframe
      src={src}
      style={{ width: '100%', height: '100%', border: 'none' }}
      title={t('app.er')}
    />
  )
}
