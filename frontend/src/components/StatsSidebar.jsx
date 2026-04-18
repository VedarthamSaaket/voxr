import React from 'react'

const S = {
  sidebar: {
    width: '260px', flexShrink: 0, borderLeft: '1px solid #1c1c1c',
    background: '#0a0a0a', padding: '24px', overflowY: 'auto',
    maxHeight: 'calc(100vh - 56px)',
  },
  section: { marginBottom: '28px' },
  secLabel: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.2em', textTransform: 'uppercase',
    color: '#444', marginBottom: '12px',
    paddingBottom: '8px', borderBottom: '1px solid #1c1c1c',
  },
  stat: { marginBottom: '14px' },
  statLabel: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.14em', textTransform: 'uppercase', color: '#444', marginBottom: '5px',
  },
  statVal: {
    fontFamily: "'Bebas Neue', sans-serif", fontSize: '28px',
    lineHeight: 1, color: '#ebebeb',
  },
  bar: { marginTop: '6px' },
  barTrack: { height: '2px', background: '#1c1c1c', position: 'relative' },
  barFill: (pct, color) => ({
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: `${Math.min(pct * 100, 100)}%`, background: color,
    transition: 'width 0.5s ease',
  }),
  flag: (color) => ({
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.12em', textTransform: 'uppercase',
    padding: '4px 10px', border: `1px solid ${color}`, color,
    display: 'inline-block', marginBottom: '6px',
  }),
  credDist: { display: 'flex', gap: '2px', marginTop: '6px' },
  credSeg: (color, flex) => ({
    flex, height: '6px', background: color,
  }),
  credLegend: { display: 'flex', gap: '12px', marginTop: '6px' },
  credLegItem: { display: 'flex', alignItems: 'center', gap: '5px' },
  credDot: (color) => ({ width: '6px', height: '6px', background: color, borderRadius: '50%' }),
  credText: { fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: '#444' },
  threadCard: {
    border: '1px solid #1c1c1c', padding: '12px', marginBottom: '8px',
    background: '#0e0e0e',
  },
  threadTitle: { fontSize: '12px', color: '#ebebeb', lineHeight: 1.5, marginBottom: '6px' },
  threadSub: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.12em', color: '#c8ff00',
  },
  correctionItem: {
    borderLeft: '2px solid #ff3a3a', paddingLeft: '10px',
    marginBottom: '10px', fontSize: '11px', color: '#888', lineHeight: 1.6,
  },
  empty: { fontSize: '12px', color: '#444', fontStyle: 'italic' },
}

function skewColor(skew) {
  if (skew > 0.7) return '#ff3a3a'
  if (skew > 0.5) return '#ff8800'
  return '#00ff7f'
}

export default function StatsSidebar({ threads }) {
  if (!threads || threads.length === 0) {
    return (
      <div style={S.sidebar}>
        <div style={S.secLabel}>Thread stats</div>
        <p style={S.empty}>Load a thread to see intelligence stats.</p>
      </div>
    )
  }

  const allStats = threads.map(t => t.stats)
  const allCorrections = allStats.flatMap(s => s.correction_chains || [])
  const hasTemporalShift = allStats.some(s => s.temporal_shift)
  const avgSkew = allStats.reduce((a, s) => a + s.consensus_skew, 0) / allStats.length

  const credDist = allStats.reduce(
    (acc, s) => {
      acc.high += s.credibility_distribution?.high || 0
      acc.medium += s.credibility_distribution?.medium || 0
      acc.low += s.credibility_distribution?.low || 0
      return acc
    },
    { high: 0, medium: 0, low: 0 }
  )
  const credTotal = credDist.high + credDist.medium + credDist.low || 1

  return (
    <div style={S.sidebar}>

      <div style={S.section}>
        <div style={S.secLabel}>Loaded threads</div>
        {threads.map((t, i) => (
          <div key={i} style={S.threadCard}>
            <div style={S.threadTitle}>{t.post?.title?.slice(0, 80)}{t.post?.title?.length > 80 ? '…' : ''}</div>
            <div style={S.threadSub}>r/{t.subreddit?.name} · ↑{t.post?.score}</div>
          </div>
        ))}
      </div>

      <div style={S.section}>
        <div style={S.secLabel}>Consensus skew</div>
        <div style={{ ...S.statVal, color: skewColor(avgSkew), fontSize: '36px' }}>
          {Math.round(avgSkew * 100)}%
        </div>
        <div style={S.bar}>
          <div style={S.barTrack}>
            <div style={S.barFill(avgSkew, skewColor(avgSkew))} />
          </div>
        </div>
        {avgSkew > 0.6 && (
          <div style={{ ...S.flag('#ff3a3a'), marginTop: '8px' }}>⚑ dominant voice</div>
        )}
        <p style={{ fontSize: '11px', color: '#444', marginTop: '8px', lineHeight: 1.6 }}>
          {avgSkew > 0.6
            ? 'One voice is dominating. Minority views may be buried.'
            : 'Diverse voices present. Healthy debate detected.'}
        </p>
      </div>

      <div style={S.section}>
        <div style={S.secLabel}>Correction chains</div>
        <div style={{ ...S.statVal, color: allCorrections.length > 0 ? '#ff3a3a' : '#444' }}>
          {allCorrections.length}
        </div>
        {allCorrections.length > 0 ? (
          allCorrections.slice(0, 3).map((c, i) => (
            <div key={i} style={S.correctionItem}>
              <span style={{ color: '#ff3a3a' }}>✗</span> "{c.parent_body?.slice(0, 60)}…"
              <br />
              <span style={{ color: '#888' }}>↳ corrected by: "{c.reply_body?.slice(0, 60)}…"</span>
            </div>
          ))
        ) : (
          <p style={S.empty}>No correction chains detected.</p>
        )}
      </div>

      <div style={S.section}>
        <div style={S.secLabel}>Temporal shift</div>
        {hasTemporalShift ? (
          <>
            <div style={S.flag('#ff8800')}>⚠ shift detected</div>
            <p style={{ fontSize: '11px', color: '#888', marginTop: '6px', lineHeight: 1.6 }}>
              Early consensus diverges from settled opinion. The thread may have self-corrected.
            </p>
          </>
        ) : (
          <p style={S.empty}>Opinion stable across time eras.</p>
        )}
      </div>

      <div style={S.section}>
        <div style={S.secLabel}>Credibility distribution</div>
        <div style={S.credDist}>
          <div style={S.credSeg('#00ff7f', credDist.high)} />
          <div style={S.credSeg('#ff8800', credDist.medium)} />
          <div style={S.credSeg('#ff3a3a', credDist.low)} />
        </div>
        <div style={S.credLegend}>
          <div style={S.credLegItem}>
            <div style={S.credDot('#00ff7f')} />
            <span style={S.credText}>high {credDist.high}</span>
          </div>
          <div style={S.credLegItem}>
            <div style={S.credDot('#ff8800')} />
            <span style={S.credText}>med {credDist.medium}</span>
          </div>
          <div style={S.credLegItem}>
            <div style={S.credDot('#ff3a3a')} />
            <span style={S.credText}>low {credDist.low}</span>
          </div>
        </div>
      </div>

    </div>
  )
}
