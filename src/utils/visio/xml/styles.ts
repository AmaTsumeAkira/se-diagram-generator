export function generateStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<StyleSheets xmlns="http://schemas.microsoft.com/office/visio/2012/main">
  <StyleSheet ID="0" Name="No Style">
    <Cell N="FillForegnd" V="#FFFFFF"/>
    <Cell N="LineColor" V="#000000"/>
  </StyleSheet>
  <StyleSheet ID="1" Name="Normal" BasedOn="0">
    <Cell N="FillForegnd" V="#FFFFFF"/>
    <Cell N="LineColor" V="#000000"/>
    <Cell N="Char.Font" V="1"/>
    <Cell N="Char.Size" V="12pt"/>
  </StyleSheet>
</StyleSheets>`
}
