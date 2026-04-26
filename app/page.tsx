'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const sendMessage = async (text?: string) => {
    const messageText = (text ?? input).trim();
    if (!messageText || loading) return;

    setWelcomeVisible(false);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMessage: Message = { role: 'user', content: messageText };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          history: messages,
        }),
      });

      if (!response.ok) {
        throw new Error(`API responded with ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.reply || 'No response received.',
      };
      setMessages([...updatedMessages, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Something went wrong. Try again in a moment.',
      };
      setMessages([...updatedMessages, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const useSuggestion = (text: string) => {
    sendMessage(text);
  };

  const newChat = () => {
    setMessages([]);
    setInput('');
    setWelcomeVisible(true);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* SIDEBAR */}
      <div id="sb">
        <div className="sb-top">
          <div className="sb-logo">
            <svg width="20" height="26" viewBox="0 0 110 150" fill="none">
              <line x1="18" y1="142" x2="55" y2="36" stroke="#C9A035" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="92" y1="142" x2="55" y2="36" stroke="#C9A035" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="33" y1="99" x2="77" y2="99" stroke="#C9A035" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            <span className="sb-logo-word">Athenos</span>
          </div>
          <button className="sb-new" onClick={newChat}>
            <span className="sb-new-icon">✦</span>
            New conversation
          </button>
        </div>

        <div className="sb-scroll">
          <div className="sb-section-label">Today</div>
          {messages.length === 0 ? (
            <div style={{ padding: '8px', fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
              No conversations yet
            </div>
          ) : (
            <div className="conv-item active">
              <div className="conv-dot"></div>
              <span className="conv-name">Current conversation</span>
              <span className="conv-time">now</span>
            </div>
          )}
        </div>

        <div className="sb-bottom">
          <div className="sb-mode-switcher">
            <button className="sb-mode-btn active">Chat</button>
            <button className="sb-mode-btn" disabled>Voice</button>
            <button className="sb-mode-btn" disabled>Both</button>
          </div>
          <div className="sb-user">
            <div className="sb-avatar">S</div>
            <div className="sb-user-info">
              <div className="sb-user-name">Sergio Burgos</div>
              <div className="sb-user-plan">Strategist · Bronze</div>
            </div>
            <span className="sb-user-dots">···</span>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div id="main">
        {/* TOP BAR */}
        <div id="topbar">
          <div className="tb-left">
            <div className="tb-title">
              {welcomeVisible ? 'New conversation' : 'Conversation'}
            </div>
            <div className="tb-tag">Chat</div>
          </div>
        </div>

        {/* CHAT */}
        <div id="chat" ref={chatRef}>
          <div className="chat-inner">
            {welcomeVisible && (
              <div id="welcome">
                <div className="w-logo">
                  <svg width="56" height="74" viewBox="0 0 110 150" fill="none">
                    <line x1="18" y1="142" x2="55" y2="36" stroke="#C9A035" strokeWidth="1.2" strokeLinecap="round" />
                    <line x1="92" y1="142" x2="55" y2="36" stroke="#C9A035" strokeWidth="1.2" strokeLinecap="round" />
                    <line x1="33" y1="99" x2="77" y2="99" stroke="#C9A035" strokeWidth="0.88" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <h2 className="w-title">Hello.</h2>
                  <p className="w-sub" style={{ marginTop: '6px' }}>
                    What do you want me to work on?
                  </p>
                </div>
                <div className="w-suggestions">
                  <button className="w-sug" onClick={() => useSuggestion('Draft a cold email to investors about my Series A.')}>
                    <span className="w-sug-icon">✉</span>
                    <span className="w-sug-title">Investor outreach</span>
                    <span className="w-sug-desc">Draft personalized investor emails</span>
                  </button>
                  <button className="w-sug" onClick={() => useSuggestion('Help me research my top 3 competitors and summarize their positioning.')}>
                    <span className="w-sug-icon">◉</span>
                    <span className="w-sug-title">Competitive research</span>
                    <span className="w-sug-desc">Analyze competitors in your market</span>
                  </button>
                  <button className="w-sug" onClick={() => useSuggestion('Help me plan my week. What should I prioritize?')}>
                    <span className="w-sug-icon">◐</span>
                    <span className="w-sug-title">Plan my week</span>
                    <span className="w-sug-desc">Prioritize tasks and time blocks</span>
                  </button>
                  <button className="w-sug" onClick={() => useSuggestion('Help me brainstorm ideas for a new product launch.')}>
                    <span className="w-sug-icon">◑</span>
                    <span className="w-sug-title">Product brainstorm</span>
                    <span className="w-sug-desc">Generate new product ideas</span>
                  </button>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`msg ${msg.role === 'user' ? 'user' : 'ai'}`}>
                <div className="msg-name">{msg.role === 'user' ? 'You' : 'Athenos'}</div>
                <div className="msg-bubble">{msg.content}</div>
              </div>
            ))}

            {loading && (
              <div className="typing-wrap">
                <svg className="typing-avatar" width="24" height="32" viewBox="0 0 110 150" fill="none">
                  <line x1="18" y1="142" x2="55" y2="36" stroke="#C9A035" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="92" y1="142" x2="55" y2="36" stroke="#C9A035" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="33" y1="99" x2="77" y2="99" stroke="#C9A035" strokeWidth="1.1" strokeLinecap="round" />
                </svg>
                <div className="typing-bubble">
                  <div className="t-dot"></div>
                  <div className="t-dot"></div>
                  <div className="t-dot"></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* INPUT */}
        <div id="input-wrap">
          <div className="input-inner">
            <div className="input-box">
              <textarea
                ref={textareaRef}
                id="inp"
                placeholder="Tell Athenos what to do..."
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResize();
                }}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
              <div className="input-toolbar">
                <div className="it-left"></div>
                <div className="it-right">
                  <div className="it-model">Athenos Strategist</div>
                  <button
                    id="send-btn"
                    type="button"
                    onClick={() => sendMessage()}
                    disabled={loading || !input.trim()}
                  >
                    ↑
                  </button>
                </div>
              </div>
            </div>
            <div className="input-hint">
              Athenos can make mistakes. Review important actions before they execute.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}