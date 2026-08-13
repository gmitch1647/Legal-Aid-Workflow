import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Send,
  UserRound,
  Users,
} from 'lucide-react';
import {
  getReferralPartner,
  getReferralPartnerMessages,
  sendReferralPartnerMessage,
} from '../../lib/api';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function partnerInitials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function PartnerCommunications({ partner }) {
  const [channel, setChannel] = useState('email');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [textBody, setTextBody] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      setHistory(await getReferralPartnerMessages(partner.id));
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Could not load partner message history.' });
    } finally {
      setHistoryLoading(false);
    }
  }, [partner.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const visibleHistory = history.filter((item) => item.channel === channel);
  const recipient = channel === 'email' ? partner.email : partner.phone;

  async function sendMessage() {
    const body = channel === 'email' ? emailBody : textBody;
    if (!body.trim() || (channel === 'email' && !emailSubject.trim())) return;

    setSending(true);
    setNotice(null);
    try {
      const result = await sendReferralPartnerMessage(partner.id, {
        channel,
        subject: channel === 'email' ? emailSubject : '',
        body,
      });
      if (result.status === 'sent') {
        setNotice({ type: 'success', text: `${channel === 'email' ? 'Email' : 'Text message'} sent to ${recipient}.` });
        if (channel === 'email') {
          setEmailSubject('');
          setEmailBody('');
        } else {
          setTextBody('');
        }
        await loadHistory();
      } else {
        setNotice({ type: 'error', text: result.error || `Could not send the ${channel === 'email' ? 'email' : 'text message'}.` });
        await loadHistory();
      }
    } catch (error) {
      setNotice({ type: 'error', text: error.message || `Could not send the ${channel === 'email' ? 'email' : 'text message'}.` });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <MessageSquare className="h-5 w-5 text-blue-600" /> Contact {partner.full_name}
          </h2>
          <p className="mt-1 text-sm text-slate-500">Read incoming replies and send a response from the same LegalFlow conversation. Every delivery and reply is recorded below.</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => { setChannel('email'); setNotice(null); }}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${channel === 'email' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Mail className="mr-1.5 inline h-4 w-4" /> Email
        </button>
        <button
          onClick={() => { setChannel('sms'); setNotice(null); }}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${channel === 'sms' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Phone className="mr-1.5 inline h-4 w-4" /> Text Message
        </button>
      </div>

      {channel === 'email' ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">To: <span className="font-semibold text-slate-800">{partner.email || 'No email address on file'}</span></p>
          <input
            value={emailSubject}
            onChange={(event) => setEmailSubject(event.target.value)}
            placeholder="Email subject"
            maxLength={200}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <textarea
            value={emailBody}
            onChange={(event) => setEmailBody(event.target.value)}
            placeholder={`Hi ${(partner.full_name || '').split(' ')[0] || 'there'},\n\n`}
            rows={6}
            maxLength={10000}
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !partner.email || !emailSubject.trim() || !emailBody.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending...' : 'Send Email'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">To: <span className="font-semibold text-slate-800">{partner.phone || 'No phone number on file'}</span></p>
          <textarea
            value={textBody}
            onChange={(event) => setTextBody(event.target.value)}
            placeholder="Type your text message..."
            rows={5}
            maxLength={1600}
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">{textBody.length}/1600</span>
            <span className="text-xs text-slate-400">Use the full phone number, including country code.</span>
          </div>
          <button
            onClick={sendMessage}
            disabled={sending || !partner.phone || !textBody.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending...' : 'Send Text Message'}
          </button>
        </div>
      )}

      {notice && (
        <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {notice.type === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      <div className="mt-6 border-t border-slate-100 pt-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{channel === 'email' ? 'Email' : 'Text'} Conversation</h3>
        {historyLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : visibleHistory.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">No {channel === 'email' ? 'emails' : 'text messages'} in this conversation yet.</p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {visibleHistory.map((item) => {
              const inbound = item.direction === 'inbound';
              const statusClass = inbound || item.status === 'sent'
                ? (inbound ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700')
                : 'bg-red-100 text-red-700';
              const title = item.subject || (inbound ? `Text from ${item.sender || partner.full_name}` : `Text to ${item.recipient}`);
              const detail = inbound
                ? `From ${item.sender || partner.full_name} · ${formatDate(item.received_at || item.created_at)}`
                : `To ${item.recipient} · ${formatDate(item.created_at)}`;
              return (
                <div key={item.id} className={`rounded-lg border p-3 ${inbound ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}>{inbound ? 'received' : item.status}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.body}</p>
                  {item.error_message && <p className="mt-2 text-xs text-red-600">Delivery error: {item.error_message}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default function ReferralPartnerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadPartner() {
      try {
        setLoading(true);
        setError('');
        const data = await getReferralPartner(id);
        if (active) setPartner(data);
      } catch (loadError) {
        if (active) setError(loadError.message || 'Could not load the referral partner profile.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadPartner();
    return () => { active = false; };
  }, [id]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>;
  }

  if (error || !partner) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
        <h1 className="mt-3 text-xl font-bold text-slate-900">Referral Partner Unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{error || 'This referral partner could not be found.'}</p>
        <button onClick={() => navigate('/attorney/settings')} className="btn-primary mt-5">Back to Settings</button>
      </div>
    );
  }

  const referralFee = partner.referral_fee_type === 'percentage'
    ? `${partner.referral_fee_amount || 0}%`
    : partner.referral_fee_type === 'flat'
      ? `$${Number(partner.referral_fee_amount || 0).toLocaleString()}`
      : 'No referral fee';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button
        onClick={() => navigate('/attorney/settings')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Settings
      </button>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-purple-700 to-indigo-700 px-6 py-7 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold ring-1 ring-white/30">{partnerInitials(partner.full_name)}</div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-purple-100">Referral Partner</p>
                <h1 className="mt-1 text-2xl font-bold">{partner.full_name}</h1>
                {partner.company && <p className="mt-1 text-sm text-purple-100">{partner.company}</p>}
              </div>
            </div>
            {partner.portal_user_id && <span className="inline-flex w-fit items-center rounded-full bg-emerald-400/20 px-3 py-1 text-sm font-semibold text-emerald-50 ring-1 ring-emerald-200/30">Portal Active</span>}
          </div>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
          <div className="bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Referred Clients</p><p className="mt-1 text-2xl font-bold text-slate-900">{partner.clients?.length || 0}</p></div>
          <div className="bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Referred Cases</p><p className="mt-1 text-2xl font-bold text-slate-900">{partner.cases?.length || 0}</p></div>
          <div className="bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Referral Fee</p><p className="mt-1 text-2xl font-bold text-slate-900">{referralFee}</p></div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900"><UserRound className="h-5 w-5 text-slate-500" /> Partner Information</h2>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Email</dt><dd className="mt-1 break-words font-medium text-slate-800">{partner.email || 'Not on file'}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Phone</dt><dd className="mt-1 font-medium text-slate-800">{partner.phone || 'Not on file'}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Company / Firm</dt><dd className="mt-1 font-medium text-slate-800">{partner.company || 'Not on file'}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Notes</dt><dd className="mt-1 whitespace-pre-wrap text-slate-700">{partner.notes || 'No notes added.'}</dd></div>
            </dl>
          </section>

          <section className="card">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900"><Users className="h-5 w-5 text-slate-500" /> Referred Clients</h2>
            {partner.clients?.length ? (
              <div className="space-y-2">
                {partner.clients.map((client) => (
                  <Link key={client.id} to={`/attorney/clients/${client.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-blue-300 hover:bg-blue-50">
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{client.full_name || 'Unnamed Client'}</span><span className="block truncate text-xs text-slate-500">{client.email || 'No email'}</span></span>
                    <ArrowLeft className="h-4 w-4 shrink-0 rotate-180 text-slate-400" />
                  </Link>
                ))}
              </div>
            ) : <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">No clients have been linked to this partner.</p>}
          </section>

          <section className="card">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900"><ClipboardList className="h-5 w-5 text-slate-500" /> Referred Cases</h2>
            {partner.cases?.length ? (
              <div className="space-y-2">
                {partner.cases.map((caseRecord) => (
                  <Link key={caseRecord.id} to={`/attorney/cases/${caseRecord.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-blue-300 hover:bg-blue-50">
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{caseRecord.plaintiff_name || caseRecord.case_number || 'Open Case'}</span><span className="block text-xs capitalize text-slate-500">{String(caseRecord.status || 'submitted').replace(/_/g, ' ')}</span></span>
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                ))}
              </div>
            ) : <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">No cases have been linked to this partner.</p>}
          </section>
        </div>

        <div className="lg:col-span-3"><PartnerCommunications partner={partner} /></div>
      </div>
    </div>
  );
}
