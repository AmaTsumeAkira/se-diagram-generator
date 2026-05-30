import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  onClose: () => void
}

export const API_KEY_LS_KEY = 'diagram-ai-api-key'
export const API_URL_LS_KEY = 'diagram-ai-api-url'
export const MODEL_LS_KEY = 'diagram-ai-model'
export const THINKING_LS_KEY = 'diagram-ai-thinking'

const DEFAULT_API_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-v4-pro'

export function getApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_LS_KEY) || ''
  } catch (e) {
    return ''
  }
}

export function getApiUrl(): string {
  try {
    return localStorage.getItem(API_URL_LS_KEY) || DEFAULT_API_URL
  } catch (e) {
    return DEFAULT_API_URL
  }
}

export function getAiModel(): string {
  try {
    return localStorage.getItem(MODEL_LS_KEY) || DEFAULT_MODEL
  } catch (e) {
    return DEFAULT_MODEL
  }
}

export function getAiThinking(): boolean {
  try {
    const val = localStorage.getItem(THINKING_LS_KEY)
    return val === null ? true : val === 'true'
  } catch (e) {
    return true
  }
}

export default function SettingsModal({ onClose }: Props) {
  const { t } = useTranslation()
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [model, setModel] = useState('')
  const [thinking, setThinking] = useState(true)
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    setApiKey(getApiKey())
    setApiUrl(getApiUrl())
    setModel(getAiModel())
    setThinking(getAiThinking())
  }, [])

  const handleSave = () => {
    try {
      localStorage.setItem(API_KEY_LS_KEY, apiKey.trim())
      localStorage.setItem(API_URL_LS_KEY, apiUrl.trim() || DEFAULT_API_URL)
      localStorage.setItem(MODEL_LS_KEY, model || DEFAULT_MODEL)
      localStorage.setItem(THINKING_LS_KEY, String(thinking))
      setShowSaved(true)
      setTimeout(() => setShowSaved(false), 2000)
    } catch (e) {
      console.error('Failed to save settings', e)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[520px] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold">{t('settings.title')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-lg leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('settings.apiKey')}
            </label>
            <input
              type="password"
              className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
              placeholder={t('settings.apiKeyPlaceholder')}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1.5">
              {t('settings.apiKeyHint')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('settings.model')}
            </label>
            <select
              className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black bg-white mb-2"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="deepseek-v4-pro">deepseek-v4-pro (推荐, 支持思考模式)</option>
              <option value="deepseek-v4-flash">deepseek-v4-flash (较快)</option>
            </select>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={thinking}
                onChange={(e) => setThinking(e.target.checked)}
                className="rounded border-gray-300 text-black focus:ring-black"
              />
              <span className="text-sm text-gray-700">{t('settings.thinkingMode')}</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('settings.apiUrl')}
            </label>
            <input
              type="text"
              className="w-full text-sm font-mono border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black"
              placeholder={DEFAULT_API_URL}
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1.5">
              {t('settings.apiUrlHint')}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800"
            >
              {t('settings.save')}
            </button>
            {showSaved && <span className="text-xs text-green-600 font-medium">{t('settings.saved')}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
