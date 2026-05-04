import { useState } from 'react'

interface Props {
  title: string
  jsonText: string
  onChange: (text: string) => void
  onApply: () => void
  error: string | null
  actorSelector?: {
    actors: { key: string; label: string }[]
    selected: string
    onSelect: (key: string) => void
  }
}

export default function ConfigPanel({
  title,
  jsonText,
  onChange,
  onApply,
  error,
  actorSelector,
}: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="w-[420px] shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-sm font-semibold">{title} - 数据配置</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          编辑下方 JSON 后点击"应用修改"生成图表
        </p>
      </div>

      {actorSelector && (
        <div className="px-4 py-2 border-b border-gray-200 bg-white">
          <label className="text-xs font-medium text-gray-600 mr-2">选择角色:</label>
          <select
            value={actorSelector.selected}
            onChange={(e) => actorSelector.onSelect(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            {actorSelector.actors.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex-1 p-4">
        <textarea
          value={jsonText}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-full font-mono text-xs p-3 border border-gray-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-black"
          spellCheck={false}
          placeholder="在此输入 JSON 数据..."
        />
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-200">
          JSON 解析错误: {error}
        </div>
      )}

      <div className="px-4 py-3 border-t border-gray-200 bg-white flex gap-2">
        <button
          onClick={onApply}
          className="flex-1 px-4 py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800 transition-colors"
        >
          应用修改
        </button>
        <button
          onClick={handleCopy}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
    </div>
  )
}
