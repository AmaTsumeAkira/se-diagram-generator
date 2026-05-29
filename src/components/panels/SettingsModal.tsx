import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  onClose: () => void
}

export const API_KEY_LS_KEY = 'diagram-ai-api-key'

export function getApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_LS_KEY) || ''
  } catch (e) {
    return ''
  }
}

export default function SettingsModal({ onClose }: Props) {
  const { t } = useTranslation()
  const [apiKey, setApiKey] = useState('')
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    setApiKey(getApiKey())
  }, [])

  const handleSave = () => {
    try {
      localStorage.setItem(API_KEY_LS_KEY, apiKey.trim())
      setShowSaved(true)
      setTimeout(() => setShowSaved(false), 2000)
    } catch (e) {
      console.error('Failed to save API key', e)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[480px] flex flex-col" onClick={(e) => e.stopPropagation()}>
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
            <p className="text-xs text-gray-500 mt-2">
              {t('settings.apiKeyHint')}
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
