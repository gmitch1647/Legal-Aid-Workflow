import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Send,
  UserRound,
} from 'lucide-react';
import {
  getReferralPartnerMessages,
  getReferralPartners,
  sendReferralPartnerMessage,
} from '../../lib/api';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function initials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function ConversationComposer({ partner, onSent }) {
  const [channel, setChannel] = useState('email');
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [textBody, setTextBody] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const data = await getReferralPartnerMessages(partner.id);
      setHistory(Array.isArray(data) ? data : data?.items ?? []);
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Could not load this conversation.' });
    } finally {
      setLoadingHistory(false);
    }
  }, [partner.id]);

  useEffect(() => {
    setChannel('email');
    setEmailSubject('');
    setEmailBody('');
    setTextBody('');
    setNotice(null);
    loadHistory();
  }, [partner.id, loadHistory]);

  const visibleHistory = history.filter((item) => item.channel === channel);
  const recipient = channel === 'email' ? partner.email : partner.phone;
  const body = channel === 'email' ? emailBody : textBody;
  const canSend = Boolean(recipient && body.trim() && (channel !== 'email' || emailSubject.trim()));

  async function sendMessage() {
    if (!canSend || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const result = await sendReferralPartnerMessage(partner.id, {
        channel,
        subject: channel === 'email' ? emailSubject : '',
        body,
      });
      if (result?.status === 'sent') {
        setNotice({ type: 'success', text: `${channel === 'email' ? 'Email' : 'Text message'} sent to ${recipient}.` });
        if (channel === 'email') {
          setEmailSubject('');
          setEmailBody('');
        } else {
          setTextBody('');
        }
        await loadHistory();
        onSent?.();
      } else {
        setNotice({ type: 'error', text: result?.error || `Could not send the ${channel === 'email' ? 'email' : 'text message'}.` });
        await loadHistory();
      }
    } catch (error) {
      setNotice({ type: 'error', text: error.message || `Could not send the ${channel === 'email' ? 'email' : 'text message'}.` });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="grid min-h-[680px] grid-rows-[auto_auto_1fr] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
            {initials(partner.full_name)}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-900">{partner.full_name}</h2>
            <p className="truncate text-sm text-slate-500">{partner.company || partner.email || partner.phone || 'Referral partner'}</p>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-100 px-5 py-4">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => { setChannel('email'); setNotice(null); }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${channel === 'email' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Mail className="mr-1.5 inline h-4 w-4" /> Email
          </button>
          <button
            type="button"
            onClick={() => { setChannel('sms'); setNotice(null); }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${channel === 'sms' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Phone className="mr-1.5 inline h-4 w-4" /> Text Message
          </button>
        </div>

        {channel === 'email' ? (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-500">To: <span className="font-semibold text-slate-700">{partner.email || 'No email address on file'}</span></p>
            <input
              value={emailSubject}
              onChange={(event) => setEmailSubject(event.target.value)}
              placeholder="Email subject"
              maxLength={200}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            <textarea
              value={emailBody}
              onChange={(event) => setEmailBody(event.target.value)}
              placeholder={`Hi ${(partner.full_name || '').split(' ')[0] || 'there'},\n\n`}
              rows={5}
              maxLength={10000}
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-500">To: <span className="font-semibold text-slate-700">{partner.phone || 'No phone number on file'}</span></p>
            <textarea
              value={textBody}
              onChange={(event) => setTextBody(event.target.value)}
              placeholder="Type your text message..."
              rows={5}
              maxLength={1600}
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="flex justify-between text-xs text-slate-400"><span>{textBody.length}/1600</span><span>Text delivery requires an approved Twilio number.</span></div>
          </div>
        )}

        <button
          type="button"
          onClick={sendMessage}
          disabled={sending || !canSend}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? 'Sending...' : channel === 'email' ? 'Send Email' : 'Send Text Message'}
        </button>

        {notice && (
          <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {notice.type === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}
      </div>

      <div className="min-h-0 overflow-y-auto px-5 py-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{channel === 'email' ? 'Email' : 'Text'} Conversation</h3>
        {loadingHistory ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : visibleHistory.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No {channel === 'email' ? 'emails' : 'text messages'} in this conversation yet.</div>
        ) : (
          <div className="space-y-3">
            {visibleHistory.map((item) => {
              const inbound = item.direction === 'inbound';
              const title = item.subject || (inbound ? `Message from ${item.sender || partner.full_name}` : `Message to ${item.recipient}`);
              const detail = inbound ? `From ${item.sender || partner.full_name} · ${formatDate(item.received_at || item.created_at)}` : `To ${item.recipient} · ${formatDate(item.created_at)}`;
              const status = inbound ? 'received' : item.status;
              return (
                <article key={item.id} className={`rounded-xl border p-3.5 ${inbound ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{title}</p><p className="mt-0.5 text-xs text-slate-500">{detail}</p></div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${inbound ? 'bg-indigo-100 text-indigo-700' : status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{status}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.body}</p>
                  {item.error_message && <p className="mt-2 text-xs text-red-600">Delivery error: {item.error_message}</p>}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Communications() {
  const [partners, setPartners] = useState([]);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPartners = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getReferralPartners();
      const items = Array.isArray(data) ? data : data?.items ?? data?.partners ?? [];
      setPartners(items);
    } catch (loadError) {
      setError(loadError.message || 'Could not load referral partners.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPartners(); }, [loadPartners]);

  const filteredPartners = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return partners;
    return partners.filter((partner) => [partner.full_name, partner.company, partner.email, partner.phone]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(term)));
  }, [partners, search]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-6 text-white shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-blue-200"><MessageSquare className="h-5 w-5" /><span className="text-sm font-semibold">Referral Partner Inbox</span></div>
          <h1 className="text-2xl font-bold">Communications</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-300">Open referral partner conversations, read incoming email replies, and create a new email or text message from LegalFlow.</p>
        </div>
        <button
          type="button"
          onClick={() => { setSelectedPartner(null); setSearch(''); }}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-blue-50 active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" /> New Communication
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <label htmlFor="partner-search" className="text-sm font-bold text-slate-900">Referral Partners</label>
            <div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="partner-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search partners..." className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></div>
          </div>
          <div className="max-h-[610px] overflow-y-auto p-2">
            {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : error ? <div className="p-3 text-sm text-red-700">{error}</div> : filteredPartners.length === 0 ? <p className="p-4 text-center text-sm text-slate-500">No referral partners match your search.</p> : filteredPartners.map((partner) => {
              const selected = selectedPartner?.id === partner.id;
              return <button key={partner.id} type="button" onClick={() => setSelectedPartner(partner)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selected ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${selected ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{initials(partner.full_name)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{partner.full_name}</span><span className="block truncate text-xs text-slate-500">{partner.company || partner.email || partner.phone || 'Referral partner'}</span></span>
                <ChevronRight className={`h-4 w-4 shrink-0 ${selected ? 'text-blue-600' : 'text-slate-300'}`} />
              </button>;
            })}
          </div>
        </aside>

        {selectedPartner ? <ConversationComposer partner={selectedPartner} onSent={loadPartners} /> : (
          <section className="flex min-h-[520px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-8 text-center shadow-sm">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><UserRound className="h-7 w-7" /></span>
            <h2 className="mt-4 text-xl font-bold text-slate-900">Create a new communication</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Choose a referral partner from the list to read their conversation and compose a new email or text message.</p>
          </section>
        )}
      </div>
    </div>
  );
}
