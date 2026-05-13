'use client';
import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

type ModelTier = 'sophocles' | 'socrates' | 'ares' | 'athena';

const DEFAULT_MODEL: ModelTier = 'sophocles';
const STORAGE_KEY_MODEL = 'athenos_model';

function groupConversationsByDate(conversations: Conversation[]): Record<string, Conversation[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: Record<string, Conversation[]> = {
    Today: [],
    Yesterday: [],
    'This week': [],
    Older: [],
  };

  conversations.forEach((conv) => {
    const convDate = new Date(conv.updated_at);
    if (convDate >= today) {
      groups.Today.push(conv);
    } else if (convDate >= yesterday) {
      groups.Yesterday.push(conv);
    } else if (convDate >= weekAgo) {
      groups['This week'].push(conv);
    } else {
      groups.Older.push(conv);
    }
  });

  return groups;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

export default function Home() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [convMenuOpen, setConvMenuOpen] = useState<string | null>(null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteConfirmConv, setDeleteConfirmConv] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [currentModel, setCurrentModel] = useState<ModelTier>(DEFAULT_MODEL);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [comingSoonModalOpen, setComingSoonModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const convMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, loading, conversationId, loadingConv]);

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
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY_MODEL);
    if (stored && (stored === 'sophocles' || stored === 'socrates' || stored === 'ares' || stored === 'athena')) {
      setCurrentModel(stored as ModelTier);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY_MODEL, currentModel);
  }, [currentModel]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.className = `model-${currentModel}`;
    return () => {
      document.body.className = '';
    };
  }, [currentModel]);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const loadConversations = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('conversations')
      .select('id, title, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Failed to load conversations:', error);
      return;
    }
    setConversations(data || []);
  };

  useEffect(() => {
    if (user) {
      loadConversations();
    } else {
      setConversations([]);
    }
  }, [user]);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (convMenuRef.current && !convMenuRef.current.contains(event.target as Node)) {
        setConvMenuOpen(null);
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingConvId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingConvId]);
  useEffect(() => {
    const handleEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && deleteConfirmConv) {
        setDeleteConfirmConv(null);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [deleteConfirmConv]);
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

  const loadConversation = async (convId: string) => {
    if (loadingConv || convId === conversationId) return;

    setLoadingConv(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load messages:', error);
      setLoadingConv(false);
      return;
    }

    const loadedMessages: Message[] = (data || []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    setMessages(loadedMessages);
    setConversationId(convId);
    setWelcomeVisible(false);
    setLoadingConv(false);
  };

  const startEditingConv = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConvId(conv.id);
    setEditTitle(conv.title || '');
    setConvMenuOpen(null);
  };

  const cancelEdit = () => {
    setEditingConvId(null);
    setEditTitle('');
  };

  const saveEdit = async (convId: string) => {
    const newTitle = editTitle.trim();
    if (!newTitle) {
      cancelEdit();
      return;
    }

    // Find current title for rollback
    const currentConv = conversations.find((c) => c.id === convId);
    const previousTitle = currentConv?.title || '';

    if (newTitle === previousTitle) {
      cancelEdit();
      return;
    }

    // Optimistic update — update UI immediately
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, title: newTitle } : c))
    );
    setEditingConvId(null);
    setEditTitle('');

    // Persist to Supabase
    const supabase = createClient();
    const { error } = await supabase
      .from('conversations')
      .update({ title: newTitle })
      .eq('id', convId);

    if (error) {
      console.error('Failed to rename conversation:', error);
      // Rollback on failure
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: previousTitle } : c))
      );
    }
  };
  const requestDeleteConv = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setConvMenuOpen(null);
    setDeleteConfirmConv(conv);
  };

  const cancelDelete = () => {
    setDeleteConfirmConv(null);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmConv || deleting) return;

    const convId = deleteConfirmConv.id;
    const previousConvs = conversations;
    const wasActive = conversationId === convId;

    setDeleting(true);

    setConversations((prev) => prev.filter((c) => c.id !== convId));

    if (wasActive) {
      setMessages([]);
      setConversationId(null);
      setWelcomeVisible(true);
    }

    const supabase = createClient();
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', convId);

    setDeleting(false);
    setDeleteConfirmConv(null);

    if (error) {
      console.error('Failed to delete conversation:', error);
      setConversations(previousConvs);
    }
  };
  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>, convId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit(convId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const sendMessage = async (text?: string) => {
    const messageText = (text ?? input).trim();
    if (!messageText || loading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    setWelcomeVisible(false);
    const previousInput = input;
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
          conversationId: conversationId,
          model: currentModel,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error(`API responded with ${response.status}`);
      }

      const data = await response.json();

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.reply || 'No response received.',
      };
      setMessages([...updatedMessages, assistantMessage]);

      loadConversations();
    } catch (error) {
      console.error('Chat error:', error);
      // Restore the user's message in the input so they can retry
      setInput(previousInput || messageText);
      // Remove the user message we optimistically added (it failed to send)
      setMessages(messages);
      // Show a toast-style error briefly via the assistant role
      const errorMessage: Message = {
        role: 'assistant',
        content: '⚠ Connection failed. Your message is back in the input — press Enter to retry.',
      };
      setMessages([...messages, errorMessage]);
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
    setConversationId(null);
  };

  const getInitial = () => {
    if (!user) return null;
    const fullName = user.user_metadata?.full_name as string | undefined;
    if (fullName) {
      return fullName.trim().split(' ')[0]?.[0]?.toUpperCase() || 'U';
    }
    return user.email?.[0]?.toUpperCase() || 'U';
  };

  const getDisplayName = () => {
    if (!user) return 'Sign in';
    const fullName = user.user_metadata?.full_name as string | undefined;
    return fullName || user.email || 'User';
  };

  const groupedConversations = groupConversationsByDate(conversations);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {isMobile && !sidebarOpen && (
        <button
          className="sidebar-toggle-mobile"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}

      {isMobile && sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <div id="sb" className={`${sidebarOpen ? 'open' : 'closed'} ${isMobile ? 'mobile' : 'desktop'}`}>
        <div className="sb-top">
          <div className="sb-logo">
            <svg width="20" height="26" viewBox="0 0 110 150" fill="none">
              <line x1="18" y1="142" x2="55" y2="36" stroke="#C9A035" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="92" y1="142" x2="55" y2="36" stroke="#C9A035" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="33" y1="99" x2="77" y2="99" stroke="#C9A035" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            <span className="sb-logo-word">Athenos</span>
          </div>

          {!isMobile && (
            <button
              className="sidebar-collapse-desktop"
              onClick={() => setSidebarOpen(false)}
              aria-label="Collapse sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          <button className="sb-new" onClick={newChat}>
            <span className="sb-new-icon">✦</span>
            New conversation
          </button>
        </div>

        <div className="sb-scroll">
          {!user ? (
            <div style={{ padding: '8px', fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
              Sign in to see your conversations
            </div>
          ) : conversations.length === 0 ? (
            <>
              <div className="sb-section-label">Today</div>
              <div style={{ padding: '8px', fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                No conversations yet
              </div>
            </>
          ) : (
            Object.entries(groupedConversations).map(([groupName, convs]) => {
              if (convs.length === 0) return null;
              return (
                <div key={groupName}>
                  <div className="sb-section-label">{groupName}</div>
                  {convs.map((conv) => {
                    const isEditing = editingConvId === conv.id;
                    const isMenuOpen = convMenuOpen === conv.id;
                    return (
                      <div
                        key={conv.id}
                        className={`conv-item ${conv.id === conversationId ? 'active' : ''}`}
                        onClick={() => !isEditing && loadConversation(conv.id)}
                        style={{ cursor: isEditing ? 'default' : 'pointer', position: 'relative' }}
                      >
                        <div className="conv-dot"></div>
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => handleEditKeyDown(e, conv.id)}
                            onBlur={() => saveEdit(conv.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="conv-name-input"
                          />
                        ) : (
                          <>
                            <span className="conv-name">{conv.title || 'Untitled'}</span>
                            <span className="conv-time">{formatTime(conv.updated_at)}</span>
                            <button
                              className="conv-dots-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConvMenuOpen(isMenuOpen ? null : conv.id);
                              }}
                              aria-label="Conversation options"
                            >
                              ⋮
                            </button>
                            {isMenuOpen && (
                              <div className="conv-menu" ref={convMenuRef}>
                                <button
                                  className="conv-menu-item"
                                  onClick={(e) => startEditingConv(conv, e)}
                                >
                                  <span className="conv-menu-icon">✎</span>
                                  <span>Rename</span>
                                </button>
                                <button
                                  className="conv-menu-item conv-menu-danger"
                                  onClick={(e) => requestDeleteConv(conv, e)}
                                >
                                  <span className="conv-menu-icon">⊘</span>
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="sb-bottom">
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

      {!isMobile && !sidebarOpen && (
        <button
          className="sidebar-rail-desktop"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* MAIN */}
      <div id="main">
        <div id="topbar">
          <div className="tb-left">
            <div className="tb-title">
              {welcomeVisible ? 'New conversation' : 'Conversation'}
            </div>
            <div className="tb-tag">Chat</div>
          </div>
          <nav className="nav-modes">
            <Link href="/" className="nav-mode active">Chat</Link>
            <Link href="/voice" className="nav-mode">Voice</Link>
          </nav>
        </div>

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

            {loadingConv ? (
              <div className="conv-loading">
                <div className="conv-loading-spinner"></div>
                <div className="conv-loading-text">Loading conversation...</div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`msg ${msg.role === 'user' ? 'user' : 'ai'} msg-fade-in`}>
                  <div className="msg-name">{msg.role === 'user' ? 'You' : 'Athenos'}</div>
                  <div className="msg-bubble">
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))
            )}

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
                <div className="it-left">
                </div>
                <div className="it-right" style={{ position: 'relative' }} ref={modelMenuRef}>
                  <button
                    className={`it-model ${modelMenuOpen ? 'active' : ''}`}
                    onClick={() => setModelMenuOpen(!modelMenuOpen)}
                    type="button"
                  >
                    Athenos {currentModel.charAt(0).toUpperCase() + currentModel.slice(1)}
                  </button>
                  {modelMenuOpen && (
                    <div className="model-menu">
                      <button className="model-menu-item" onClick={() => setModelMenuOpen(false)}>
                        <span className="model-menu-icon" style={{ opacity: 0 }}></span>
                        <span className="model-menu-label" style={{ flex: 1, textAlign: 'left' }}>Athenos Sophocles</span>
                        <span className="model-menu-check">✓</span>
                      </button>
                      <button className="model-menu-item disabled" onClick={() => { setComingSoonModalOpen(true); setModelMenuOpen(false); }}>
                        <span className="model-menu-icon" style={{ color: 'var(--gold)' }}>🔒</span>
                        <span className="model-menu-label" style={{ flex: 1, textAlign: 'left' }}>Athenos Socrates</span>
                        <span className="model-menu-sub">Coming soon</span>
                      </button>
                      <button className="model-menu-item disabled" onClick={() => { setComingSoonModalOpen(true); setModelMenuOpen(false); }}>
                        <span className="model-menu-icon" style={{ color: 'var(--gold)' }}>🔒</span>
                        <span className="model-menu-label" style={{ flex: 1, textAlign: 'left' }}>Athenos Ares</span>
                        <span className="model-menu-sub">Coming soon</span>
                      </button>
                      <button className="model-menu-item disabled" onClick={() => { setComingSoonModalOpen(true); setModelMenuOpen(false); }}>
                        <span className="model-menu-icon" style={{ color: 'var(--gold)' }}>🔒</span>
                        <span className="model-menu-label" style={{ flex: 1, textAlign: 'left' }}>Athenos Athena</span>
                        <span className="model-menu-sub">Coming soon</span>
                      </button>
                    </div>
                  )}
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

      {comingSoonModalOpen && (
        <div className="modal-backdrop" onClick={() => setComingSoonModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Coming soon</div>
            <div className="modal-body">
              This model will be available when ATHENOS launches its full Strategist plan.
            </div>
            <div className="modal-actions">
              <button
                className="modal-btn modal-btn-cancel"
                onClick={() => setComingSoonModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmConv && (
        <div className="modal-backdrop" onClick={cancelDelete}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Delete conversation?</div>
            <div className="modal-body">
              This will permanently delete <strong>&ldquo;{deleteConfirmConv.title || 'Untitled'}&rdquo;</strong> and all its messages. This action cannot be undone.
            </div>
            <div className="modal-actions">
              <button
                className="modal-btn modal-btn-cancel"
                onClick={cancelDelete}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="modal-btn modal-btn-danger"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
