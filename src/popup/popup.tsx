import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

const DEEPL_FREE_LIMIT = 500_000

interface UsageStats {
  deepl: { chars: number; month: number }
  google: { chars: number; month: number }
}

function formatNumber(n: number): string {
  return n.toLocaleString('ja-JP')
}

function PopupApp() {
  const [enabled, setEnabled] = useState(true)
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [currentProvider, setCurrentProvider] = useState<'deepl' | 'google'>('deepl')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    chrome.storage.sync.get(['enabled', 'preferredProvider'], (result) => {
      setEnabled(result.enabled !== false)
      setCurrentProvider((result.preferredProvider as 'deepl' | 'google') ?? 'deepl')
    })

    chrome.runtime.sendMessage({ type: 'GET_USAGE' }, (response: UsageStats | undefined) => {
      if (response) setUsage(response)
      setLoading(false)
    })
  }, [])

  function handleToggle() {
    const next = !enabled
    setEnabled(next)
    chrome.storage.sync.set({ enabled: next })
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (tabId !== undefined) {
        chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_EXTENSION', enabled: next })
      }
    })
  }

  function openOptions() {
    chrome.runtime.openOptionsPage()
  }

  const deepLPct = usage ? Math.min((usage.deepl.chars / DEEPL_FREE_LIMIT) * 100, 100) : 0

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Discord JP Quick Translate</span>
        <label style={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={handleToggle}
            style={styles.checkbox}
          />
          <span style={{ ...styles.toggleTrack, background: enabled ? '#5865f2' : '#4f545c' }}>
            <span style={{ ...styles.toggleThumb, left: enabled ? '14px' : '2px' }} />
          </span>
        </label>
      </div>

      {loading ? (
        <div style={styles.loadingText}>読み込み中...</div>
      ) : (
        <div style={styles.stats}>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>DeepL 使用量</span>
            <span style={styles.statValue}>
              {formatNumber(usage?.deepl.chars ?? 0)} / {formatNumber(DEEPL_FREE_LIMIT)} 文字
            </span>
          </div>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${deepLPct}%` }} />
          </div>

          <div style={{ ...styles.statRow, marginTop: 8 }}>
            <span style={styles.statLabel}>Google 使用量</span>
            <span style={styles.statValue}>
              {formatNumber(usage?.google.chars ?? 0)} 文字
            </span>
          </div>

          <div style={styles.providerRow}>
            <span style={styles.statLabel}>現在のプロバイダー</span>
            <span
              style={{
                ...styles.badge,
                background: currentProvider === 'deepl' ? 'rgba(0,100,255,0.15)' : 'rgba(66,133,244,0.15)',
                color: currentProvider === 'deepl' ? '#6699ff' : '#4285f4',
              }}
            >
              {currentProvider === 'deepl' ? 'DeepL' : 'Google'}
            </span>
          </div>
        </div>
      )}

      <button style={styles.optionsBtn} onClick={openOptions}>
        設定を開く
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontWeight: 600,
    fontSize: 14,
    color: '#ffffff',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    position: 'relative',
  },
  checkbox: {
    position: 'absolute',
    opacity: 0,
    width: 0,
    height: 0,
  },
  toggleTrack: {
    width: 32,
    height: 18,
    borderRadius: 9,
    position: 'relative',
    transition: 'background 0.2s',
    display: 'inline-block',
  },
  toggleThumb: {
    position: 'absolute',
    top: 2,
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: '#ffffff',
    transition: 'left 0.2s',
  },
  stats: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
  },
  statLabel: {
    color: '#72767d',
  },
  statValue: {
    color: '#dcddde',
    fontVariantNumeric: 'tabular-nums',
  },
  progressBar: {
    height: 4,
    background: '#2b2d31',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressFill: {
    height: '100%',
    background: '#5865f2',
    borderRadius: 2,
    transition: 'width 0.3s',
  },
  providerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    marginTop: 4,
  },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    padding: '2px 6px',
    borderRadius: 3,
  },
  loadingText: {
    fontSize: 12,
    color: '#72767d',
    textAlign: 'center' as const,
    padding: '8px 0',
  },
  optionsBtn: {
    background: 'rgba(88,101,242,0.15)',
    border: '1px solid rgba(88,101,242,0.4)',
    borderRadius: 4,
    color: '#5865f2',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    padding: '6px 0',
    width: '100%',
    transition: 'background 0.15s',
  },
}

const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
)
