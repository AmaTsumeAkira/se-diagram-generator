export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function indent(level: number, content: string): string {
  const pad = '  '.repeat(level)
  return content.split('\n').map(line => pad + line).join('\n')
}
