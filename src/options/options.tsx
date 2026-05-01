import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

type ProviderName = 'deepl' | 'google'
type Status = 'idle' | 'testing' | 'success' | 'error'

interface ApiKeyFieldProps {
  label: string
  provider: ProviderName
  value: string
  onChange: (v: string) => void
  onTest: () => void
  status: Status
  statusMessage: string
}

function ApiKeyField({
  label,
  provider,
  value,
  onChange,
  onTest,
  status,
  statusMessage,
}: ApiKeyFieldProps) {
  const statusColor =
    status === 'success' ? '#3ba55d' : status === 'error' ? '#ed4245' : '#72767d'

  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      <div style={styles.inputRow}>
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${provider === 'deepl' ? 'DeepL' : 'Google'} APIキーを入力`}
          style={styles.input}
          autoComplete="off"
        />
        <button
          onClick={onTest}
          disabled={status === 'testing' || !value}
          style={{
            ...styles.testBtn,
            opacity: status === 'testing' || !value ? 0.5 : 1,
          }}
        >
          {status === 'testing' ? '確認中...' : 'テスト'}
        </button>
      </div>
      {statusMessage && (
        <span style={{ ...styles.statusText, color: statusColor }}>{statusMessage}</span>
      )}
    </div>
  )
}

function OptionsApp() {
  const [deeplKey, setDeeplKey] = useState('')
  const [googleKey, setGoogleKey] = useState('')
  const [targetLang, setTargetLang] = useState('JA')
  const [preferredProvider, setPreferredProvider] = useState<ProviderName>('deepl')
  const [cacheCount, setCacheCount] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)

  const [deeplStatus, setDeeplStatus] = useState<Status>('idle')
  const [deeplStatusMsg, setDeeplStatusMsg] = useState('')
  const [googleStatus, setGoogleStatus] = useState<Status>('idle')
  const [googleStatusMsg, setGoogleStatusMsg] = useState('')

  useEffect(() => {
    chrome.storage.sync.get(['targetLang', 'preferredProvider'], (result) => {
      if (result.targetLang) setTargetLang(result.targetLang as string)
      if (result.preferredProvider) setPreferredProvider(result.preferredProvider as ProviderName)
    })

    chrome.runtime.sendMessage({ type: 'GET_API_KEY', provider: 'deepl' }, (r: { key: string | null }) => {
      if (r?.key) setDeeplKey(r.key)
    })

    chrome.runtime.sendMessage({ type: 'GET_API_KEY', provider: 'google' }, (r: { key: string | null }) => {
      if (r?.key) setGoogleKey(r.key)
    })
  }, [])

  function handleSave() {
    chrome.storage.sync.set({ targetLang, preferredProvider })
    chrome.runtime.sendMessage({ type: 'SET_API_KEY', provider: 'deepl', key: deeplKey })
    chrome.runtime.sendMessage({ type: 'SET_API_KEY', provider: 'google', key: googleKey })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function testDeepL() {
    setDeeplStatus('testing')
    setDeeplStatusMsg('')
    try {
      const response = await fetch('https://api-free.deepl.com/v2/translate', {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${deeplKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'text=Hello&target_lang=JA',
      })
      if (response.ok) {
        setDeeplStatus('success')
        setDeeplStatusMsg('接続成功!')
      } else {
        setDeeplStatus('error')
        setDeeplStatusMsg(`エラー: ${response.status}`)
      }
    } catch {
      setDeeplStatus('error')
      setDeeplStatusMsg('接続失敗')
    }
  }

  async function testGoogle() {
    setGoogleStatus('testing')
    setGoogleStatusMsg('')
    try {
      const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(googleKey)}`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: 'Hello', target: 'ja', format: 'text' }),
      })
      if (response.ok) {
        setGoogleStatus('success')
        setGoogleStatusMsg('接続成功!')
      } else {
        setGoogleStatus('error')
        setGoogleStatusMsg(`エラー: ${response.status}`)
      }
    } catch {
      setGoogleStatus('error')
      setGoogleStatusMsg('接続失敗')
    }
  }

  function handleClearCache() {
    chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, () => {
      setCacheCount(0)
    })
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Discord JP Quick Translate 設定</h1>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>API キー</h2>
          <ApiKeyField
            label="DeepL API キー（推奨）"
            provider="deepl"
            value={deeplKey}
            onChange={setDeeplKey}
            onTest={testDeepL}
            status={deeplStatus}
            statusMessage={deeplStatusMsg}
          />
          <ApiKeyField
            label="Google Translate API キー（フォールバック）"
            provider="google"
            value={googleKey}
            onChange={setGoogleKey}
            onTest={testGoogle}
            status={googleStatus}
            statusMessage={googleStatusMsg}
          />
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>翻訳設定</h2>

          <div style={styles.field}>
            <label style={styles.label}>翻訳先言語</label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              style={styles.select}
            >
              <option value="JA">日本語 (JA)</option>
              <option value="EN">英語 (EN)</option>
              <option value="ZH">中国語 (ZH)</option>
              <option value="KO">韓国語 (KO)</option>
              <option value="FR">フランス語 (FR)</option>
              <option value="DE">ドイツ語 (DE)</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>優先プロバイダー</label>
            <div style={styles.radioGroup}>
              {(['deepl', 'google'] as ProviderName[]).map((p) => (
                <label key={p} style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="provider"
                    value={p}
                    checked={preferredProvider === p}
                    onChange={() => setPreferredProvider(p)}
                    style={{ marginRight: 6 }}
                  />
                  {p === 'deepl' ? 'DeepL 優先' : 'Google 優先'}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>キャッシュ</h2>
          <div style={styles.cacheRow}>
            <span style={styles.label}>
              {cacheCount !== null ? `${cacheCount.toLocaleString()} 件のキャッシュ` : 'キャッシュ管理'}
            </span>
            <button style={styles.dangerBtn} onClick={handleClearCache}>
              キャッシュをクリア
            </button>
          </div>
        </section>

        <div style={styles.footer}>
          <button style={styles.saveBtn} onClick={handleSave}>
            {saved ? '保存しました ✓' : '設定を保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 600,
    margin: '0 auto',
    padding: '32px 16px',
  },
  card: {
    background: '#2b2d31',
    borderRadius: 8,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  heading: {
    fontSize: 18,
    fontWeight: 700,
    color: '#ffffff',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: '#5865f2',
    borderBottom: '1px solid #3f4147',
    paddingBottom: 6,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#b5bac1',
  },
  inputRow: {
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1,
    background: '#1e1f22',
    border: '1px solid #3f4147',
    borderRadius: 4,
    color: '#dcddde',
    fontSize: 13,
    padding: '7px 10px',
    fontFamily: 'inherit',
    outline: 'none',
  },
  testBtn: {
    background: 'rgba(88,101,242,0.15)',
    border: '1px solid rgba(88,101,242,0.4)',
    borderRadius: 4,
    color: '#5865f2',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    padding: '0 14px',
    whiteSpace: 'nowrap' as const,
  },
  statusText: {
    fontSize: 11,
    marginTop: 2,
  },
  select: {
    background: '#1e1f22',
    border: '1px solid #3f4147',
    borderRadius: 4,
    color: '#dcddde',
    fontSize: 13,
    padding: '7px 10px',
    fontFamily: 'inherit',
    maxWidth: 240,
    outline: 'none',
  },
  radioGroup: {
    display: 'flex',
    gap: 16,
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 13,
    cursor: 'pointer',
    color: '#dcddde',
  },
  cacheRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dangerBtn: {
    background: 'rgba(237,66,69,0.15)',
    border: '1px solid rgba(237,66,69,0.4)',
    borderRadius: 4,
    color: '#ed4245',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    padding: '6px 12px',
  },
  footer: {
    borderTop: '1px solid #3f4147',
    paddingTop: 16,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  saveBtn: {
    background: '#5865f2',
    border: 'none',
    borderRadius: 4,
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'inherit',
    fontWeight: 600,
    padding: '8px 20px',
    transition: 'background 0.15s',
  },
}

const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
)
