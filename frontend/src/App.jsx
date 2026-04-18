import React, { useState } from 'react'
import SearchScreen from './pages/SearchScreen.jsx'
import ChatScreen from './pages/ChatScreen.jsx'

export default function App() {
  const [view, setView] = useState('search') // 'search' | 'chat'
  const [chatParams, setChatParams] = useState(null)

  function handleSelect({ session_id, thread_url }) {
    setChatParams({ sessionId: session_id, threadUrl: thread_url })
    setView('chat')
  }

  function handleBack() {
    setChatParams(null)
    setView('search')
  }

  if (view === 'chat' && chatParams) {
    return (
      <ChatScreen
        sessionId={chatParams.sessionId}
        threadUrl={chatParams.threadUrl}
        onBack={handleBack}
      />
    )
  }

  return <SearchScreen onSelect={handleSelect} />
}
