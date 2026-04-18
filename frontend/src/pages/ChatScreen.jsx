import React, { useState, useEffect, useRef } from 'react'
import ChatMessage from '../components/ChatMessage.jsx'
import StatsSidebar from '../components/StatsSidebar.jsx'
import CitationDrawer from '../components/CitationDrawer.jsx'

const S = {
  screen: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' },
  topbar: {
    height: '56px', borderBottom: '1px solid #1c1c1c', display: 'flex',
    alignItems: 'center', padding: '0 24px', gap: '20px',
    background: '#070707', flexShrink: 0, justifyContent: 'space-between',
  },
  logo: {
    fontFamily: "'Bebas Neue', sans-serif", fontSize: '22px',
    letterSpacing: '0.08em', color: '#ebebeb',
  },
  logoAcc: { color: '#c8ff00' },
  topMeta: { display: 'flex', alignItems: 'center', gap: '12px' },
  badge: (color = '#444') => ({
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.12em', textTransform: 'uppercase',
    padding: '3px 9px', border: `1px solid ${color}`, color,
  }),
  newBtn: {
    background: 'none', border: '1px solid #282828', color: '#888',
    padding: '6px 14px', cursor: 'pointer',
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.14em', textTransform: 'uppercase',
    transition: 'all 0.15s',
  },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  messages: { flex: 1, overflowY: 'auto', padding: '0' },
  loading: {
    padding: '20px 24px', borderBottom: '1px solid #131313',
    background: '#0c0e08', borderLeft: '2px solid #c8ff00',
    display: 'flex', alignItems: 'center', gap: '12px',
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#444',
  },
  spinner: {
    width: '12px', height: '12px', border: '1px solid #333',
    borderTopColor: '#c8ff00', borderRadius: '50%',
    animation: 'spin 0.7s linear infinite', flexShrink: 0,
  },
  inputArea: {
    borderTop: '1px solid #1c1c1c', padding: '16px 20px',
    background: '#070707', flexShrink: 0,
  },
  inputRow: {
    display: 'flex', gap: '0', border: '1px solid #282828', background: '#0a0a0a',
  },
  input: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    padding: '14px 18px', color: '#ebebeb',
    fontFamily: "'Fraunces', Georgia, serif", fontSize: '14px', fontWeight: 300,
    resize: 'none',
  },
  sendBtn: (active) => ({
    background: active ? '#c8ff00' : '#131313',
    border: 'none', padding: '0 20px', cursor: active ? 'pointer' : 'default',
    fontFamily: "'Bebas Neue', sans-serif", fontSize: '16px',
    letterSpacing: '0.06em', color: active ? '#000' : '#333',
    transition: 'all 0.15s', flexShrink: 0,
  }),
  hints: {
    display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap',
  },
  hint: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.1em', textTransform: 'uppercase',
    padding: '4px 10px', border: '1px solid #1c1c1c', color: '#444',
    cursor: 'pointer', transition: 'all 0.12s', background: 'none',
  },
  briefBanner: {
    padding: '12px 24px', background: '#0a0e06',
    borderBottom: '1px solid #1c1c1c',
    display: 'flex', alignItems: 'center', gap: '12px',
  },
  briefDot: {
    width: '6px', height: '6px', background: '#c8ff00',
    borderRadius: '50%', flexShrink: 0,
  },
  briefText: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.14em', textTransform: 'uppercase', color: '#9fcc00',
  },
}

const HINT_PROMPTS = [
  "What's the minority view?",
  "Which comments are most credible?",
  "Was there a correction chain?",
  "Did opinion change over time?",
  "What does r/[subreddit] specifically say?",
  "Summarise the debate transcript",
]

export default function ChatScreen({ sessionId, threadUrl, onBack }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [briefLoading, setBriefLoading] = useState(true)
  const [activeCitation, setActiveCitation] = useState(null)
  const [threads, setThreads] = useState([])
  const [threadLoaded, setThreadLoaded] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('Fetching thread…')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    loadThread()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function loadThread() {
    setBriefLoading(true)
    setLoadingLabel('Fetching thread from Reddit…')

    try {
      const res = await fetch('/api/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, thread_url: threadUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)

      setThreads([{ post: data.post, subreddit: data.subreddit, stats: data.thread_stats }])
      setThreadLoaded(true)

      setMessages([{
        role: 'assistant',
        content: data.brief,
        citations: data.citations || [],
      }])
    } catch (e) {
      setMessages([{
        role: 'assistant',
        content: `⚠ Failed to load thread: ${e.message}`,
        citations: [],
      }])
    } finally {
      setBriefLoading(false)
    }
  }

  async function sendMessage(text) {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')

    setMessages(prev => [...prev, { role: 'user', content: msg, citations: [] }])
    setLoading(true)
    setLoadingLabel('Analysing…')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: msg }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        citations: data.citations || [],
      }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠ Error: ${e.message}`,
        citations: [],
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const thread = threads[0]

  return (
    <div style={S.screen}>
      {/* Top bar */}
      <div style={S.topbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={S.logo}><span style={S.logoAcc}>VOX</span>R</span>
          {thread && (
            <>
              <span style={S.badge('#c8ff00')}>r/{thread.subreddit?.name}</span>
              <span style={S.badge('#444')}>{thread.stats?.total_comments} comments</span>
              {thread.stats?.bias_flag && <span style={S.badge('#ff3a3a')}>⚑ biased source</span>}
              {thread.stats?.temporal_shift && <span style={S.badge('#ff8800')}>⚑ temporal shift</span>}
            </>
          )}
        </div>
        <button
          style={S.newBtn}
          onClick={onBack}
          onMouseEnter={e => { e.target.style.color = '#c8ff00'; e.target.style.borderColor = '#c8ff00' }}
          onMouseLeave={e => { e.target.style.color = '#888'; e.target.style.borderColor = '#282828' }}
        >
          ← New search
        </button>
      </div>

      <div style={S.body}>
        {/* Main chat area */}
        <div style={S.main}>
          {threadLoaded && (
            <div style={S.briefBanner}>
              <div style={S.briefDot} />
              <span style={S.briefText}>
                Brief generated — {thread?.post?.title?.slice(0, 60)}{thread?.post?.title?.length > 60 ? '…' : ''}
              </span>
            </div>
          )}

          <div style={S.messages}>
            {briefLoading && (
              <div style={S.loading}>
                <div style={S.spinner} />
                {loadingLabel}
              </div>
            )}

            {messages.map((msg, i) => (
              <ChatMessage
                key={i}
                message={msg}
                onCiteClick={setActiveCitation}
              />
            ))}

            {loading && (
              <div style={S.loading}>
                <div style={S.spinner} />
                {loadingLabel}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div style={S.inputArea}>
            <div style={S.inputRow}>
              <textarea
                style={S.input}
                rows={1}
                placeholder="Ask anything about these threads…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={briefLoading}
              />
              <button
                style={S.sendBtn(input.trim().length > 0 && !loading)}
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
              >
                Send
              </button>
            </div>

            <div style={S.hints}>
              {HINT_PROMPTS.map((h, i) => (
                <button
                  key={i}
                  style={S.hint}
                  onClick={() => sendMessage(h)}
                  onMouseEnter={e => { e.target.style.color = '#c8ff00'; e.target.style.borderColor = '#c8ff00' }}
                  onMouseLeave={e => { e.target.style.color = '#444'; e.target.style.borderColor = '#1c1c1c' }}
                  disabled={briefLoading || loading}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats sidebar */}
        <StatsSidebar threads={threads} />
      </div>

      {/* Citation drawer */}
      {activeCitation && (
        <CitationDrawer
          citation={activeCitation}
          onClose={() => setActiveCitation(null)}
        />
      )}
    </div>
  )
}
