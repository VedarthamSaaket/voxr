import React, { useState } from 'react'

const S = {
  screen: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '40px 24px',
    position: 'relative', overflow: 'hidden',
  },
  bg: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  bgText: {
    fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(140px, 25vw, 300px)',
    color: '#c8ff00', opacity: 0.025, lineHeight: 1, userSelect: 'none',
    letterSpacing: '0.02em',
  },
  inner: { position: 'relative', zIndex: 1, width: '100%', maxWidth: '640px' },
  tag: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px',
    letterSpacing: '.22em', textTransform: 'uppercase', color: '#c8ff00',
    display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px',
  },
  tagLine: { width: '28px', height: '1px', background: '#c8ff00' },
  h1: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 'clamp(72px, 14vw, 120px)',
    lineHeight: 0.86, letterSpacing: '0.01em', color: '#ebebeb',
    marginBottom: '24px',
  },
  h1Acc: { color: '#c8ff00' },
  sub: {
    fontSize: '15px', fontWeight: 300, color: '#888',
    lineHeight: 1.75, fontStyle: 'italic', marginBottom: '40px',
  },
  inputRow: {
    display: 'flex', gap: '0', border: '1px solid #282828',
    background: '#0e0e0e', marginBottom: '16px',
  },
  input: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    padding: '16px 20px', color: '#ebebeb', fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '15px', fontWeight: 300,
  },
  btn: (loading) => ({
    background: loading ? '#9fcc00' : '#c8ff00', border: 'none',
    padding: '0 24px', cursor: loading ? 'wait' : 'pointer',
    fontFamily: "'Bebas Neue', sans-serif", fontSize: '18px',
    letterSpacing: '0.06em', color: '#000', transition: 'background 0.15s',
    flexShrink: 0,
  }),
  orRow: {
    display: 'flex', alignItems: 'center', gap: '16px',
    marginBottom: '16px',
  },
  orLine: { flex: 1, height: '1px', background: '#1c1c1c' },
  orText: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.16em', textTransform: 'uppercase', color: '#333',
  },
  urlInput: {
    width: '100%', background: '#0a0a0a', border: '1px solid #1c1c1c',
    outline: 'none', padding: '14px 20px', color: '#888',
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px',
    marginBottom: '12px',
  },
  urlBtn: {
    background: 'none', border: '1px solid #282828', color: '#888',
    padding: '10px 20px', cursor: 'pointer', width: '100%',
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px',
    letterSpacing: '.12em', textTransform: 'uppercase',
    transition: 'all 0.15s',
  },
  results: { marginTop: '24px' },
  resultsLabel: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.2em', textTransform: 'uppercase', color: '#444',
    marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px',
  },
  resultsLine: { flex: 1, height: '1px', background: '#1c1c1c' },
  card: (hovered) => ({
    border: '1px solid ' + (hovered ? '#333' : '#1c1c1c'),
    padding: '18px 20px', marginBottom: '8px', cursor: 'pointer',
    background: hovered ? '#0e0e0e' : '#0a0a0a',
    transition: 'all 0.15s', display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', gap: '16px',
    borderLeft: '2px solid ' + (hovered ? '#c8ff00' : 'transparent'),
  }),
  cardLeft: { flex: 1 },
  cardTitle: { fontSize: '13px', color: '#ddd', lineHeight: 1.5, marginBottom: '6px' },
  cardMeta: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  badge: (color = '#444') => ({
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.12em', textTransform: 'uppercase',
    padding: '2px 8px', border: `1px solid ${color}`, color,
  }),
  cardArrow: { color: '#444', fontSize: '18px', flexShrink: 0, marginTop: '2px' },
  error: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px',
    color: '#ff3a3a', border: '1px solid rgba(255,58,58,0.2)',
    padding: '10px 14px', marginTop: '12px',
  },
  loadingRow: {
    display: 'flex', alignItems: 'center', gap: '10px',
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#444',
    padding: '16px 0',
  },
  spinner: {
    width: '14px', height: '14px', border: '1px solid #333',
    borderTopColor: '#c8ff00', borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
}

function formatDate(utc) {
  return new Date(utc * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}

export default function SearchScreen({ onSelect }) {
  const [query, setQuery] = useState('')
  const [url, setUrl] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [error, setError] = useState('')
  const [hovered, setHovered] = useState(null)

  async function handleSearch(e) {
    e?.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setResults([])
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail)
      setResults(data.results || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleUrlLoad() {
    if (!url.trim()) return
    setLoadingUrl(true)
    setError('')
    try {
      const res = await fetch('/api/session/new', { method: 'POST' })
      const { session_id } = await res.json()
      onSelect({ session_id, thread_url: url.trim() })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingUrl(false)
    }
  }

  async function selectResult(result) {
    try {
      const res = await fetch('/api/session/new', { method: 'POST' })
      const { session_id } = await res.json()
      onSelect({ session_id, thread_url: result.url })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div style={S.screen}>
      <div style={S.bg}>
        <div style={S.bgText}>VOXR</div>
      </div>

      <div style={S.inner} className="fade-up">
        <div style={S.tag}>
          <div style={S.tagLine} />
          Vox Populi · Distilled · 2025
        </div>

        <h1 style={S.h1}>
          VOX<br />
          <span style={S.h1Acc}>POPULI</span><br />
          DISTILLED
        </h1>

        <p style={S.sub}>
          Type a topic. Voxr finds the threads, reads the crowd,
          surfaces the buried dissent, and lets you cross-examine every verdict.
        </p>

        <form onSubmit={handleSearch}>
          <div style={S.inputRow}>
            <input
              style={S.input}
              placeholder="What do you want to understand?"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
            <button type="submit" style={S.btn(loading)} disabled={loading}>
              {loading ? '…' : 'Search'}
            </button>
          </div>
        </form>

        <div style={S.orRow}>
          <div style={S.orLine} />
          <span style={S.orText}>or paste a URL</span>
          <div style={S.orLine} />
        </div>

        <input
          style={S.urlInput}
          placeholder="https://www.reddit.com/r/…"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleUrlLoad()}
        />
        <button
          style={S.urlBtn}
          onClick={handleUrlLoad}
          disabled={loadingUrl}
          onMouseEnter={e => e.target.style.borderColor = '#c8ff00'}
          onMouseLeave={e => e.target.style.borderColor = '#282828'}
        >
          {loadingUrl ? 'Loading…' : 'Load thread directly'}
        </button>

        {error && <div style={S.error}>⚠ {error}</div>}

        {loading && (
          <div style={S.loadingRow}>
            <div style={S.spinner} />
            Searching Reddit…
          </div>
        )}

        {results.length > 0 && (
          <div style={S.results}>
            <div style={S.resultsLabel}>
              {results.length} threads found
              <div style={S.resultsLine} />
            </div>
            {results.map((r, i) => (
              <div
                key={i}
                style={S.card(hovered === i)}
                onClick={() => selectResult(r)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <div style={S.cardLeft}>
                  <div style={S.cardTitle}>{r.title}</div>
                  <div style={S.cardMeta}>
                    <span style={S.badge('#c8ff00')}>r/{r.subreddit}</span>
                    <span style={S.badge('#444')}>↑ {r.score}</span>
                    <span style={S.badge('#444')}>{r.num_comments} comments</span>
                    <span style={S.badge('#333')}>{formatDate(r.created_utc)}</span>
                  </div>
                </div>
                <div style={S.cardArrow}>›</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
