import React from 'react'

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    zIndex: 1000, display: 'flex', justifyContent: 'flex-end',
    animation: 'fadeIn 0.2s ease',
  },
  drawer: {
    width: '420px', maxWidth: '95vw', background: '#0e0e0e',
    borderLeft: '1px solid #282828', height: '100%',
    overflow: 'auto', animation: 'slideIn 0.25s ease',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    padding: '20px 24px', borderBottom: '1px solid #1c1c1c',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    position: 'sticky', top: 0, background: '#0e0e0e', zIndex: 1,
  },
  citNum: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px',
    letterSpacing: '.18em', textTransform: 'uppercase', color: '#c8ff00',
    display: 'flex', alignItems: 'center', gap: '10px',
  },
  close: {
    background: 'none', border: '1px solid #282828', color: '#888',
    cursor: 'pointer', width: '28px', height: '28px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px',
    transition: 'all 0.15s',
  },
  body: { padding: '24px', flex: 1 },
  meta: { marginBottom: '20px' },
  metaRow: {
    display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px',
  },
  badge: (color = '#444') => ({
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.14em', textTransform: 'uppercase',
    padding: '3px 9px', border: `1px solid ${color}`, color,
  }),
  commentBox: {
    background: '#131313', border: '1px solid #1c1c1c',
    padding: '20px', borderLeft: '3px solid #c8ff00',
  },
  commentBody: {
    fontSize: '14px', color: '#ebebeb', lineHeight: 1.75,
    fontFamily: "'Fraunces', Georgia, serif", fontWeight: 300,
  },
  label: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.16em', textTransform: 'uppercase',
    color: '#444', marginBottom: '8px',
  },
  link: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px',
    color: '#888', textDecoration: 'none', display: 'block',
    marginTop: '16px', borderTop: '1px solid #1c1c1c', paddingTop: '12px',
  },
  credBar: {
    marginTop: '16px', display: 'flex', alignItems: 'center', gap: '10px',
  },
  credTrack: {
    flex: 1, height: '2px', background: '#1c1c1c', position: 'relative',
  },
  credFill: (pct, color) => ({
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: `${pct * 100}%`, background: color,
    transition: 'width 0.4s ease',
  }),
  credLabel: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#444', width: '32px',
  },
}

function credColor(score) {
  if (score > 0.6) return '#00ff7f'
  if (score > 0.3) return '#ff8800'
  return '#ff3a3a'
}

function formatAge(days) {
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${(days / 365).toFixed(1)}yr`
}

function formatScore(n) {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default function CitationDrawer({ citation, onClose }) {
  if (!citation) return null

  const { n, comment_id, author, score, body, credibility_score, account_age_days, era, is_correction } = citation

  const credScore = credibility_score || 0
  const ageDays = account_age_days || 0

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.drawer}>
        <div style={S.header}>
          <div style={S.citNum}>
            <span style={{ color: '#c8ff00' }}>[{n}]</span>
            Source comment
          </div>
          <button style={S.close} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          <div style={S.meta}>
            <div style={S.metaRow}>
              <span style={S.badge('#c8ff00')}>{author || '[deleted]'}</span>
              {score !== undefined && (
                <span style={S.badge('#888')}>↑ {formatScore(score)}</span>
              )}
              {era && (
                <span style={S.badge(era === 'hot_take' ? '#ff8800' : era === 'considered' ? '#3bbfff' : '#888')}>
                  {era.replace('_', ' ')}
                </span>
              )}
              {is_correction && (
                <span style={S.badge('#ff3a3a')}>⚠ correction</span>
              )}
            </div>

            {ageDays > 0 && (
              <div style={S.credBar}>
                <span style={{ ...S.credLabel }}>cred</span>
                <div style={S.credTrack}>
                  <div style={S.credFill(credScore, credColor(credScore))} />
                </div>
                <span style={{ ...S.credLabel, width: 'auto', color: credColor(credScore) }}>
                  {Math.round(credScore * 100)}%
                </span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: '#444' }}>
                  · acc {formatAge(ageDays)}
                </span>
              </div>
            )}
          </div>

          <div style={S.label}>Comment</div>
          <div style={S.commentBox}>
            <p style={S.commentBody}>{body}</p>
          </div>

          {comment_id && (
            <a
              href={`https://www.reddit.com/comments/${comment_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={S.link}
            >
              View on Reddit ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
