import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getAgentTypes,
  getConversations,
  getConversation,
  createConversation,
  sendAgentMessage,
  archiveConversation,
  getCases,
} from '../../lib/api';
import {
  MessageSquare,
  Send,
  Plus,
  Bot,
  User,
  Scale,
  Search,
  FileText,
  DollarSign,
  Lightbulb,
  Briefcase,
  Trash2,
  ChevronDown,
  Loader2,
  X,
  Link,
} from 'lucide-react';

const AGENT_ICONS = {
  general: Bot,
  legal_researcher: Search,
  case_analyst: Scale,
  complaint_drafter: FileText,
  damages_calculator: DollarSign,
  strategy_advisor: Lightbulb,
};

const AGENT_COLORS = {
  general: 'bg-blue-100 text-blue-700',
  legal_researcher: 'bg-purple-100 text-purple-700',
  case_analyst: 'bg-amber-100 text-amber-700',
  complaint_drafter: 'bg-green-100 text-green-700',
  damages_calculator: 'bg-red-100 text-red-700',
  strategy_advisor: 'bg-indigo-100 text-indigo-700',
};

const AGENT_DESCRIPTIONS = {
  general: 'General legal assistant for any task',
  legal_researcher: 'Research statutes, case law, and legal issues',
  case_analyst: 'Analyze case strengths, weaknesses, and strategy',
  complaint_drafter: 'Draft complaints, counts, motions, and letters',
  damages_calculator: 'Calculate and structure damages claims',
  strategy_advisor: 'Litigation strategy and settlement advice',
};

export default function AgentChat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [agentTypes, setAgentTypes] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConvo, setActiveConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(searchParams.get('case_id') || null);
  const [selectedAgent, setSelectedAgent] = useState('general');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (activeConvo) {
      inputRef.current?.focus();
    }
  }, [activeConvo]);

  async function loadInitialData() {
    try {
      setLoading(true);
      const [typesRes, convosRes, casesRes] = await Promise.all([
        getAgentTypes(),
        getConversations(),
        getCases(),
      ]);
      setAgentTypes(typesRes || []);
      setConversations(convosRes || []);
      setCases(Array.isArray(casesRes) ? casesRes : casesRes?.data || []);

      // Auto-open conversation from URL param
      const convoId = searchParams.get('conversation');
      if (convoId) {
        await openConversation(convoId);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function openConversation(convoId) {
    try {
      const convo = await getConversation(convoId);
      setActiveConvo(convo);
      setMessages(convo.messages || []);
      setSearchParams({ conversation: convoId });
    } catch (err) {
      console.error('Failed to open conversation:', err);
    }
  }

  async function handleNewChat() {
    try {
      const convo = await createConversation(selectedAgent, selectedCase);
      setConversations((prev) => [convo, ...prev]);
      setActiveConvo(convo);
      setMessages([]);
      setShowNewChat(false);
      setSearchParams({ conversation: convo.id });
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  }

  async function handleSend() {
    if (!input.trim() || !activeConvo || sending) return;

    const userMsg = input.trim();
    setInput('');
    setSending(true);

    // Optimistically add user message
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMsg, created_at: new Date().toISOString() },
    ]);

    try {
      const response = await sendAgentMessage(activeConvo.id, userMsg);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.content, created_at: new Date().toISOString() },
      ]);

      // Refresh conversation list to update titles
      const convos = await getConversations();
      setConversations(convos || []);
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function handleArchive(convoId, e) {
    e.stopPropagation();
    try {
      await archiveConversation(convoId);
      setConversations((prev) => prev.filter((c) => c.id !== convoId));
      if (activeConvo?.id === convoId) {
        setActiveConvo(null);
        setMessages([]);
        setSearchParams({});
      }
    } catch (err) {
      console.error('Failed to archive:', err);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const AgentIcon = activeConvo ? (AGENT_ICONS[activeConvo.agent_type] || Bot) : Bot;

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6">
      {/* Sidebar — conversation list */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <button
            onClick={() => setShowNewChat(true)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4" /> New Agent Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">
              No conversations yet. Start a new chat with an agent.
            </div>
          ) : (
            conversations.map((convo) => {
              const Icon = AGENT_ICONS[convo.agent_type] || Bot;
              const isActive = activeConvo?.id === convo.id;
              return (
                <div
                  key={convo.id}
                  onClick={() => openConversation(convo.id)}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-slate-100 hover:bg-slate-50 transition group ${
                    isActive ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${AGENT_COLORS[convo.agent_type] || 'bg-slate-100 text-slate-600'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {convo.title}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {formatDate(convo.updated_at)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleArchive(convo.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col bg-slate-50">
        {activeConvo ? (
          <>
            {/* Chat header */}
            <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${AGENT_COLORS[activeConvo.agent_type] || 'bg-slate-100'}`}>
                <AgentIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-900 text-sm">{activeConvo.title}</div>
                <div className="text-xs text-slate-500">
                  {AGENT_DESCRIPTIONS[activeConvo.agent_type] || 'AI Agent'}
                  {activeConvo.case_id && (
                    <span className="ml-2 text-blue-600">
                      <Link className="w-3 h-3 inline" /> Linked to case
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-16">
                  <div className={`inline-flex p-4 rounded-2xl ${AGENT_COLORS[activeConvo.agent_type] || 'bg-slate-100'} mb-4`}>
                    <AgentIcon className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {agentTypes.find((a) => a.id === activeConvo.agent_type)?.name || 'Agent'}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                    {AGENT_DESCRIPTIONS[activeConvo.agent_type]}
                    {activeConvo.case_id
                      ? '. This agent has full context about the linked case.'
                      : '. Link a case for context-aware responses.'}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2 justify-center">
                    {activeConvo.agent_type === 'legal_researcher' && (
                      <>
                        <SuggestedPrompt text="What are the elements of an FCRA §1681e(b) claim?" onClick={setInput} />
                        <SuggestedPrompt text="Find case law on willful FCRA violations in the 11th Circuit" onClick={setInput} />
                      </>
                    )}
                    {activeConvo.agent_type === 'case_analyst' && (
                      <>
                        <SuggestedPrompt text="Analyze the strengths and weaknesses of this case" onClick={setInput} />
                        <SuggestedPrompt text="What additional evidence do we need?" onClick={setInput} />
                      </>
                    )}
                    {activeConvo.agent_type === 'complaint_drafter' && (
                      <>
                        <SuggestedPrompt text="Draft a count for §1681i(a) failure to investigate" onClick={setInput} />
                        <SuggestedPrompt text="Rewrite the factual allegations section" onClick={setInput} />
                      </>
                    )}
                    {activeConvo.agent_type === 'damages_calculator' && (
                      <>
                        <SuggestedPrompt text="Calculate total potential damages for this case" onClick={setInput} />
                        <SuggestedPrompt text="What statutory damages apply under FCRA?" onClick={setInput} />
                      </>
                    )}
                    {activeConvo.agent_type === 'strategy_advisor' && (
                      <>
                        <SuggestedPrompt text="What's the best litigation strategy for this case?" onClick={setInput} />
                        <SuggestedPrompt text="Should we pursue settlement or go to trial?" onClick={setInput} />
                      </>
                    )}
                    {activeConvo.agent_type === 'general' && (
                      <>
                        <SuggestedPrompt text="Help me draft a demand letter" onClick={setInput} />
                        <SuggestedPrompt text="Summarize the key issues in this case" onClick={setInput} />
                      </>
                    )}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className={`flex-shrink-0 p-1.5 rounded-lg h-fit ${AGENT_COLORS[activeConvo.agent_type] || 'bg-slate-100'}`}>
                      <AgentIcon className="w-4 h-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md shadow-sm'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    <div
                      className={`text-xs mt-1 ${
                        msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'
                      }`}
                    >
                      {formatTime(msg.created_at)}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 p-1.5 rounded-lg h-fit bg-blue-100 text-blue-700">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}

              {sending && (
                <div className="flex gap-3">
                  <div className={`p-1.5 rounded-lg h-fit ${AGENT_COLORS[activeConvo.agent_type] || 'bg-slate-100'}`}>
                    <AgentIcon className="w-4 h-4" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Thinking...
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="bg-white border-t border-slate-200 p-4">
              <div className="flex items-end gap-3 max-w-4xl mx-auto">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-32"
                  style={{ minHeight: '42px' }}
                  disabled={sending}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="flex-shrink-0 bg-blue-600 text-white p-2.5 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Empty state — no conversation selected */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-lg">
              <div className="inline-flex p-4 rounded-2xl bg-blue-100 text-blue-600 mb-4">
                <MessageSquare className="w-10 h-10" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Agent Workspace</h2>
              <p className="text-slate-500 mt-2">
                Chat with specialized AI agents to research, analyze, draft, and strategize.
                Select a conversation from the sidebar or start a new one.
              </p>
              <button
                onClick={() => setShowNewChat(true)}
                className="mt-6 inline-flex items-center gap-2 bg-blue-600 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-blue-700 transition"
              >
                <Plus className="w-4 h-4" /> Start New Chat
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">New Agent Chat</h2>
              <button onClick={() => setShowNewChat(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Agent selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Choose an Agent
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(AGENT_DESCRIPTIONS).map(([key, desc]) => {
                    const Icon = AGENT_ICONS[key] || Bot;
                    const isSelected = selectedAgent === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedAgent(key)}
                        className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg ${AGENT_COLORS[key]}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {agentTypes.find((a) => a.id === key)?.name || key}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional case link */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Link to a Case <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <select
                  value={selectedCase || ''}
                  onChange={(e) => setSelectedCase(e.target.value || null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No case — general conversation</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.client_name || 'Client'} — {c.defendant_names || 'Case'} ({c.status})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Linking a case gives the agent full context about the facts, defendants, and pipeline results.
                </p>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowNewChat(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleNewChat}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Start Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestedPrompt({ text, onClick }) {
  return (
    <button
      onClick={() => onClick(text)}
      className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition"
    >
      {text}
    </button>
  );
}
