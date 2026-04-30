'use client';
import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push('/login');
    router.refresh();
  };

  const handleSignIn = () => {
    router.push('/login');
  };

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

  // Helper: get first letter of first name (or email fallback)
  const getInitial = () => {
    if (!user) return null;
    const fullName = user.user_metadata?.full_name as string | undefined;
    if (fullName) {
      return fullName.trim().split(' ')[0]?.[0]?.toUpperCase() || 'U';
    }
    return user.email?.[0]?.toUpperCase() || 'U';
  };

  // Helper: display name (first name only for compactness)
  const getDisplayName = () => {
    if (!user) return 'Sign in';
    const fullName = user.user_metadata?.full_name as string | undefined;
    return fullName || user.email || 'User';
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
          <div className="sb-user-wrapper" ref={userMenuRef}>
            <div
              className="sb-user"
              onClick={() => user ? setMenuOpen(!menuOpen) : handleSignIn()}
              style={{ cursor: 'pointer' }}
            >
              <div className={`sb-avatar ${!user ? 'guest' : ''}`}>
                {user ? getInitial() : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4 0-8 2-8 6v2h16v-2c0-4-4-6-8-6z" />
                  </svg>
                )}
              </div>
              <div className="sb-user-info">
                <div className="sb-user-name">{getDisplayName()}</div>
                <div className="sb-user-plan">
                  {user ? 'Strategist · Bronze' : 'Not signed in'}
                </div>
              </div>
              {user && <span className="sb-user-dots">···</span>}
            </div>
            {menuOpen && user && (
              <div className="sb-user-menu">
                <button className="sb-menu-item disabled" disabled>
                  <span className="sb-menu-icon">⚙</span>
                  <span>Settings</span>
                </button>
                <button className="sb-menu-item disabled" disabled>
                  <span className="sb-menu-icon">◐</span>
                  <span>Profile</span>
                </button>
                <div className="sb-menu-divider"></div>
                <button className="sb-menu-item" onClick={handleSignOut}>
                  <span className="sb-menu-icon">⎋</span>
                  <span>Sign out</span>
                </button>
              </div>
            )}
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