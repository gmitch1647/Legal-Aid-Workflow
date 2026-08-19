import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Briefcase, Loader2, Mail, Phone, UserRound } from 'lucide-react';
import { getCases } from '../../lib/api';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReferralAttorneyClientProfile() {
  const { clientId } = useParams();
  const [client, setClient] = useState(null);
  const [clientCases, setClientCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const result = await getCases();
      const cases = Array.isArray(result) ? result : result?.items || result?.cases || [];
      const ownCases = cases.filter((item) => item.client_id === clientId);
      if (!ownCases.length) {
        setClient(null);
        return;
      }
      const first = ownCases[0];
      setClient({
        id: clientId,
        full_name: first.client?.full_name || first.client_name || first.plaintiff_name || 'Client',
        email: first.client?.email || first.client_email || '',
        phone: first.client?.phone || first.client_phone || '',
      });
      setClientCases(ownCases);
    } catch (loadError) {
      setError(loadError.message || 'Could not load this referral client.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);
  if (loading) return <div className="flex h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  if (!client) return <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900"><p className="font-semibold">Client unavailable</p><p className="mt-1">This client is not connected to your referral workspace.</p><Link to="/attorney/clients" className="mt-4 inline-flex font-medium text-indigo-700">Return to My Clients</Link></div>;

  return <div className="mx-auto max-w-5xl space-y-6">
    <Link to="/attorney/clients" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-700"><ArrowLeft className="h-4 w-4" />My Clients</Link>
    {error && <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700">{client.full_name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><p className="text-sm font-semibold text-indigo-700">REFERRAL CLIENT PROFILE</p><h1 className="mt-1 text-2xl font-bold text-slate-900">{client.full_name}</h1><div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">{client.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4" />{client.email}</span>}{client.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4" />{client.phone}</span>}</div></div></div></section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><h2 className="flex items-center gap-2 font-bold text-slate-900"><Briefcase className="h-5 w-5 text-indigo-600" />Referral cases</h2><p className="mt-1 text-sm text-slate-500">Open a case to review documents and send a secure message to this client.</p></div><div className="divide-y divide-slate-100">{clientCases.map((caseItem) => <Link key={caseItem.id} to={`/attorney/referral-cases/${caseItem.id}`} className="flex items-center justify-between gap-4 p-5 transition hover:bg-slate-50"><div className="flex min-w-0 items-center gap-3"><UserRound className="h-5 w-5 shrink-0 text-indigo-600" /><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{caseItem.plaintiff_name || client.full_name}</p><p className="mt-1 text-sm text-slate-500">{caseItem.status?.replaceAll('_', ' ') || 'Submitted'} · Submitted {formatDate(caseItem.created_at)}</p></div></div><span className="text-sm font-medium text-indigo-700">Open case</span></Link>)}</div></section>
  </div>;
}
