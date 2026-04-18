import React from 'react'
import ReactMarkdown from 'react-markdown'

const S = {
  msg: (role) => ({
    padding: '20px 24px',
    borderBottom: '1px solid #131313',
    background: role === 'user' ? '#0a0a0a' : '#0c0e08',
    borderLeft: role === 'assistant' ? '2px solid #c8ff00' : '2px solid transparent',
    animation: 'fadeUp 0.2s ease',
  }),
  who: (role) => ({
    fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    letterSpacing: '.18em', textTransform: 'uppercase',
    color: role === 'user' ? '#444' : '#c8ff00',
    marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px',
  }),
  whoDot: (role) => ({
    width: '5px', height: '5px', borderRadius: '50%',
    background: role === 'user' ? '#333' : '#c8ff00',
  }),
  content: {
    fontSize: '14px', color: '#ddd', lineHeight: 1.8,
    fontFamily: "'Fraunces', Georgia, serif", fontWeight: 300,
  },
  cite: {
    display: 'inline-block', background: '#141a04', border: '1px solid #2a3a08',
    padding: '0 5px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
    color: '#9fcc00', cursor: 'pointer', verticalAlign: 'middle',
    marginLeft: '2px', transition: 'all 0.12s', userSelect: 'none',
  },
}

function MarkdownWithCitations({ content, citations, onCiteClick }) {
  const segments = content.split(/(\[\d+\])/g)

  return (
    <div style={S.content}>
      {segments.map((seg, i) => {
        const match = seg.match(/^\[(\d+)\]$/)
        if (match) {
          const n = parseInt(match[1])
          const cit = citations?.find(c => c.n === n)
          return (
            <span
              key={i}
              style={S.cite}
              onClick={() => cit && onCiteClick(cit)}
              title={cit ? `${cit.author} · ↑${cit.score}` : `Citation ${n}`}
            >
              [{n}]
            </span>
          )
        }
        return (
          <ReactMarkdown key={i} components={{
            p:          ({ children }) => <p style={{ marginBottom: '10px' }}>{children}</p>,
            strong:     ({ children }) => <strong style={{ color: '#ebebeb', fontWeight: 500 }}>{children}</strong>,
            em:         ({ children }) => <em style={{ color: '#c8ff00', fontStyle: 'normal', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>{children}</em>,
            h1:         ({ children }) => <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '28px', color: '#ebebeb', marginBottom: '12px', marginTop: '20px' }}>{children}</div>,
            h2:         ({ children }) => <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '22px', color: '#ebebeb', marginBottom: '10px', marginTop: '18px' }}>{children}</div>,
            h3:         ({ children }) => <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', letterSpacing: '.16em', textTransform: 'uppercase', color: '#c8ff00', marginBottom: '8px', marginTop: '14px' }}>{children}</div>,
            ul:         ({ children }) => <ul style={{ paddingLeft: '20px', marginBottom: '10px' }}>{children}</ul>,
            li:         ({ children }) => <li style={{ marginBottom: '4px', color: '#ccc' }}>{children}</li>,
            blockquote: ({ children }) => (
              <div style={{ borderLeft: '2px solid #c8ff00', paddingLeft: '16px', margin: '12px 0', color: '#888', fontStyle: 'italic' }}>
                {children}
              </div>
            ),
            code: ({ children }) => (
              <code style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', background: '#131313', padding: '1px 5px', color: '#c8ff00' }}>
                {children}
              </code>
            ),
          }}>
            {seg}
          </ReactMarkdown>
        )
      })}
    </div>
  )
}

export default function ChatMessage({ message, onCiteClick }) {
  const { role, content, citations } = message

  return (
    <div style={S.msg(role)}>
      <div style={S.who(role)}>
        <div style={S.whoDot(role)} />
        {role === 'user' ? 'You' : 'Voxr'}
      </div>

      {role === 'assistant' ? (
        <MarkdownWithCitations
          content={content}
          citations={citations}
          onCiteClick={onCiteClick}
        />
      ) : (
        <div style={S.content}>{content}</div>
      )}
    </div>
  )
}
