import { useEffect, useRef, useState } from 'react'
import type { CliProvider } from '@shared/ipc'

export default function App(): JSX.Element {
  const [provider, setProvider] = useState<CliProvider>('claude')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')
  const [version, setVersion] = useState('')
  const outputRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    window.orvis.getAppInfo().then((info) => setVersion(info.version))

    const offChunk = window.orvis.onSessionChunk((chunk) => {
      setOutput((prev) => prev + chunk.data)
    })
    const offExit = window.orvis.onSessionExit((exit) => {
      setOutput((prev) => prev + `\n[session exited: code=${exit.code}]\n`)
      setSessionId(null)
    })
    return () => {
      offChunk()
      offExit()
    }
  }, [])

  useEffect(() => {
    const el = outputRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [output])

  async function handleStart(): Promise<void> {
    setOutput('')
    const id = await window.orvis.startSession({ provider, cwd: '.' })
    setSessionId(id)
  }

  function handleSend(): void {
    if (!sessionId || !input) return
    window.orvis.writeSession(sessionId, input + '\r')
    setInput('')
  }

  async function handleStop(): Promise<void> {
    if (sessionId) await window.orvis.killSession(sessionId)
  }

  return (
    <div className="app">
      <div className="toolbar">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as CliProvider)}
          disabled={!!sessionId}
        >
          <option value="claude">Claude Code</option>
          <option value="codex">Codex</option>
        </select>
        {sessionId ? (
          <button onClick={handleStop}>停止</button>
        ) : (
          <button onClick={handleStart}>启动会话</button>
        )}
        <span className="badge">
          Orvis Code GUI v{version} · {sessionId ? '运行中' : '空闲'}
        </span>
      </div>

      <pre className="output" ref={outputRef}>
        {output || '选择一个 CLI 提供方并启动会话。'}
      </pre>

      <div className="composer">
        <input
          value={input}
          placeholder="输入指令，回车发送…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={!sessionId}
        />
        <button onClick={handleSend} disabled={!sessionId}>
          发送
        </button>
      </div>
    </div>
  )
}
