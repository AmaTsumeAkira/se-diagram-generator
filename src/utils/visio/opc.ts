import JSZip from 'jszip'
import type { VisioDocument } from './types'
import { generateContentTypes } from './xml/contentTypes'
import { generateRootRels, generateDocumentRels, generatePagesRels } from './xml/rels'
import { generateCoreXml, generateAppXml } from './xml/core'
import { generatePagesXml, generatePageXml } from './xml/page'
import { generateStylesXml } from './xml/styles'

function generateDocumentXml(doc: VisioDocument): string {
  const pageRefs = doc.pages.map((_, i) =>
    `    <Page ID="${i + 1}" Name="${doc.pages[i].name}">
      <Rel Id="rId${i + 1}" Target="pages/page${i + 1}.xml" Type="http://schemas.microsoft.com/office/visio/2010/relationships/page"/>
    </Page>`
  ).join('\n')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <DocumentSettings>
    <Cell N="DefaultPageWidth" V="${doc.pages[0]?.width ?? 11}"/>
    <Cell N="DefaultPageHeight" V="${doc.pages[0]?.height ?? 8.5}"/>
  </DocumentSettings>
  <Pages>
${pageRefs}
  </Pages>
</VisioDocument>`
}

export async function buildVisioBlob(doc: VisioDocument): Promise<Blob> {
  const zip = new JSZip()
  const pageCount = doc.pages.length

  zip.file('[Content_Types].xml', generateContentTypes(pageCount))

  zip.file('_rels/.rels', generateRootRels())

  zip.file('docProps/core.xml', generateCoreXml(doc))
  zip.file('docProps/app.xml', generateAppXml())

  zip.file('visio/document.xml', generateDocumentXml(doc))
  zip.file('visio/_rels/document.xml.rels', generateDocumentRels())

  zip.file('visio/pages/pages.xml', generatePagesXml(doc.pages))
  zip.file('visio/pages/_rels/pages.xml.rels', generatePagesRels(pageCount))

  for (let i = 0; i < pageCount; i++) {
    zip.file(`visio/pages/page${i + 1}.xml`, generatePageXml(doc.pages[i], i))
  }

  zip.file('visio/styles/styles.xml', generateStylesXml())

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.ms-visio.drawing',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}
