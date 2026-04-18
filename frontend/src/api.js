const BASE = '/api'

async function req(path, body = null, method = 'POST') {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  newSession:   ()                         => req('/session/new'),
  search:       (query, limit = null)      => req('/search', { query, limit }),
  load:         (session_id, thread_url)   => req('/load', { session_id, thread_url }),
  chat:         (session_id, message)      => req('/chat', { session_id, message }),
  stats:        (session_id)               => req(`/session/${session_id}/stats`, null, 'GET'),
  clearSession: (session_id)               => req(`/session/${session_id}`, null, 'DELETE'),
}
