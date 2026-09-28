import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import wxQr from '../../wx.png'

// 右下角二维码推广弹窗。收起状态持久化，避免每次刷新都弹出。
const LS_KEY = 'promo-qr-collapsed'

function QrIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M20 20v.01M17.5 17.5v3" />
    </svg>
  )
}

export default function PromoPopup() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, collapsed ? '1' : '0')
    } catch { /* 忽略隐私模式等异常 */ }
  }, [collapsed])

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title={t('promo.open')}
        aria-label={t('promo.open')}
        className="promo-pop fixed right-4 bottom-4 z-40 flex items-center gap-1.5 rounded-full bg-black px-3 py-2 text-xs font-medium text-white shadow-lg hover:bg-gray-800"
      >
        <QrIcon className="h-4 w-4" />
        {t('promo.open')}
      </button>
    )
  }

  const services = t('promo.services', { returnObjects: true }) as string[]

  return (
    <div
      role="complementary"
      aria-label={t('promo.title')}
      className="promo-pop fixed right-4 bottom-4 z-40 w-[224px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.16)]"
    >
      <div className="flex items-center justify-between gap-2 bg-black px-3 py-2 text-white">
        <div className="flex items-center gap-1.5">
          <QrIcon className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">{t('promo.title')}</span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title={t('promo.close')}
          aria-label={t('promo.close')}
          className="-mr-1 rounded px-1 text-base leading-none text-white/70 hover:text-white"
        >
          ×
        </button>
      </div>

      <div className="px-3 pb-3 pt-2.5">
        <img
          src={wxQr}
          alt={t('promo.qrAlt')}
          className="mx-auto block h-[148px] w-[148px] rounded-md border border-gray-100 object-contain"
        />

        <p className="mt-2 text-center text-[11px] text-gray-500">{t('promo.scanHint')}</p>

        <ul className="mt-2 flex flex-wrap justify-center gap-1">
          {services.map((s) => (
            <li key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700">
              {s}
            </li>
          ))}
        </ul>

        <p className="mt-2 border-t border-dashed border-gray-200 pt-2 text-center text-[10px] leading-relaxed text-gray-400">
          {t('promo.note')}
        </p>
      </div>
    </div>
  )
}
