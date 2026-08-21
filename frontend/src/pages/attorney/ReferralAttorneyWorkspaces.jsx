import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  FolderKanban,
  Loader2,
  Plus,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  createReferralAttorneyWorkspace,
  getReferralPartners,
  getStaffAttorneys,
  getReferralAttorneyFeatureAccess,
  updateReferralAttorneyFeatureAccess,
  inviteReferralAttorneyWorkspaceCoOwner,
} from '../../lib/api';

const EMPTY_FORM = {
  full_name: '',
  email: '',
  phone: '',
  company: '',
  assigned_attorney_id: '',
  submission_slug: '',
};

function referralUrl(slug) {
  return slug ? `${window.location.origin}/case-referral/${slug}` : '';
}

export default function ReferralAttorneyWorkspaces() {
  const [partners, setPartners] = useState([]);
  const [attorneys, setAttorneys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [partnerRows, attorneyRows] = await Promise.all([getReferralPartners(), getStaffAttorneys()]);
      setPartners(Array.isArray(partnerRows) ? partnerRows : []);
      setAttorneys(Array.isArray(attorneyRows) ? attorneyRows : []);
      const esther = (attorneyRows || []).find((attorney) => String(attorney.email || '').toLowerCase() === 'oiselaw@gmail.com');
      if (esther) setForm((current) => current.assigned_attorney_id ? current : { ...current, assigned_attorney_id: esther.id });
    } catch (loadError) {
      setError(loadError.message || 'Could not load referral attorney workspace settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function suggestedSlug(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + (name.trim() ? '-referrals' : '');
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess(null);
    if (!form.full_name.trim() || !form.email.trim() || !form.assigned_attorney_id) {
      setError('Enter the referral attorney’s name and email, then choose the LegalFlow attorney assigned to work the cases.');
      return;
    }
    setSaving(true);
    try {
      const result = await createReferralAttorneyWorkspace({
        ...form,
        submission_slug: form.submission_slug.trim() || suggestedSlug(form.full_name),
      });
      setSuccess(result);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (saveError) {
      setError(saveError.message || 'The referral attorney workspace could not be created.');
    } finally {
      setSaving(false);
    }
  }

  async function copyLink(slug) {
    const url = referralUrl(slug);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(slug);
      window.setTimeout(() => setCopied(''), 2200);
    } catch {
      setError('Could not copy the referral link.');
    }
  }

  const workspaces = partners.filter((partner) => partner.portal_user_id || partner.submission_slug || partner.pipeline_id);

  if (loading) return <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-6 py-7 text-white shadow-lg sm:px-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-300/25 bg-indigo-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-200"><ShieldCheck className="h-3.5 w-3.5" /> Owner Controls</span>
            <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Referral Attorney Workspaces</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">Create a restricted login, a separate referral pipeline, and a dedicated submission link for another attorney. Their referred cases are assigned to the LegalFlow attorney you choose.</p>
          </div>
          <button onClick={() => { setShowForm(true); setSuccess(null); setError(''); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-indigo-300"><Plus className="h-4 w-4" /> Add Referral Attorney</button>
        </div>
      </section>

      {error && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> <span className="flex-1">{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X className="h-4 w-4" /></button></div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><div className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0" /><div><p className="font-semibold">{success.partner?.full_name}’s referral workspace is ready.</p><p className="mt-1">{success.email_sent ? 'The login invitation and private referral link were emailed successfully.' : 'The workspace was created, but the welcome email could not be confirmed. Send the referral link manually after checking the email address.'}</p></div></div></div>}

      {showForm && (
        <section className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><UserPlus className="h-5 w-5 text-indigo-700" /> Create Referral Attorney Workspace</h2><p className="mt-1 text-sm text-slate-500">This sends an invitation and creates an isolated partner pipeline. The partner cannot see normal firm cases.</p></div>
            <button onClick={() => setShowForm(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Attorney Full Name" required><input value={form.full_name} onChange={(event) => update('full_name', event.target.value)} placeholder="Ethan Babb" className="input" /></Field>
            <Field label="Attorney Email" required><input value={form.email} onChange={(event) => update('email', event.target.value)} type="email" placeholder="ethan@example.com" className="input" /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="Optional" className="input" /></Field>
            <Field label="Firm / Organization"><input value={form.company} onChange={(event) => update('company', event.target.value)} placeholder="Optional" className="input" /></Field>
            <Field label="LegalFlow Attorney Working the Cases" required><select value={form.assigned_attorney_id} onChange={(event) => update('assigned_attorney_id', event.target.value)} className="input"><option value="">Choose an attorney</option>{attorneys.map((attorney) => <option key={attorney.id} value={attorney.id}>{attorney.full_name || attorney.email}</option>)}</select></Field>
            <Field label="Private Referral Link Ending"><input value={form.submission_slug} onChange={(event) => update('submission_slug', event.target.value)} placeholder={suggestedSlug(form.full_name) || 'ethan-babb-referrals'} className="input" /><p className="mt-1 text-xs text-slate-500">Leave blank to generate from the attorney’s name.</p></Field>
            <div className="sm:col-span-2 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60">{saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : <><UserPlus className="h-4 w-4" /> Create Workspace & Invite</>}</button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4"><FolderKanban className="h-5 w-5 text-indigo-700" /><div><h2 className="font-bold text-slate-900">Active Referral Attorney Workspaces</h2><p className="text-sm text-slate-500">Each workspace has its own pipeline and public referral link.</p></div></div>
        {!workspaces.length ? <div className="p-10 text-center text-sm text-slate-500">No referral attorney workspaces have been created yet.</div> : <div className="grid gap-4 p-5 md:grid-cols-2">{workspaces.map((partner) => <article key={partner.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{partner.full_name}</h3><p className="mt-1 text-sm text-slate-500">{partner.company || partner.email || 'Referral attorney'}</p></div><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Active</span></div><div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{referralUrl(partner.submission_slug) || 'Private link is being configured.'}</div><ReferralAttorneyFeatureControls partner={partner} onError={setError} /><ReferralPortalCoOwnerControls partner={partner} onError={setError} />
                          <div className="mt-3 flex gap-2"><button disabled={!partner.submission_slug} onClick={() => copyLink(partner.submission_slug)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">{copied === partner.submission_slug ? <><CheckCircle2 className="h-3.5 w-3.5" /> Copied</> : <><ClipboardCopy className="h-3.5 w-3.5" /> Copy Link</>}</button>{partner.submission_slug && <a href={referralUrl(partner.submission_slug)} target="_blank" rel="noopener" className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-100" title="Open referral form"><ExternalLink className="h-3.5 w-3.5" /></a>}</div></article>)}</div>}
      </section>
    </div>
  );
}

function ReferralAttorneyFeatureControls({ partner, onError }) {
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');

  useEffect(() => {
    let active = true;
    getReferralAttorneyFeatureAccess(partner.id)
      .then((result) => { if (active) setFeatures(Array.isArray(result?.features) ? result.features : []); })
      .catch((error) => { if (active) onError(error.message || 'Could not load feature controls.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [partner.id, onError]);

  async function toggle(feature) {
    setSavingKey(feature.key);
    try {
      const result = await updateReferralAttorneyFeatureAccess(partner.id, { [feature.key]: !feature.enabled });
      setFeatures(Array.isArray(result?.features) ? result.features : []);
    } catch (error) {
      onError(error.message || 'Could not update feature access.');
    } finally {
      setSavingKey('');
    }
  }

  return <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
    <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">Attorney workspace features</p>
    <p className="mt-1 text-xs text-slate-600">Turn Ethan’s case-scoped tools on or off. Changes apply when he refreshes LegalFlow.</p>
    {loading ? <p className="mt-2 text-xs text-slate-500">Loading feature controls…</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{features.map((feature) => <button key={feature.key} type="button" onClick={() => toggle(feature)} disabled={savingKey === feature.key} className={`flex items-center justify-between rounded-md border px-2.5 py-2 text-left text-xs transition ${feature.enabled ? 'border-emerald-200 bg-white text-slate-700' : 'border-slate-200 bg-slate-100 text-slate-500'} disabled:opacity-60`}><span><span className="block font-semibold">{feature.label}</span><span className="block text-[11px] leading-4 opacity-80">{feature.description}</span></span><span className={`ml-2 rounded-full px-2 py-0.5 font-bold ${feature.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{savingKey === feature.key ? '…' : feature.enabled ? 'On' : 'Off'}</span></button>)}</div>}
  </div>;
}

function ReferralPortalCoOwnerControls({ partner, onError }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  async function submit(event) {
    event.preventDefault();
    onError('');
    setSuccess('');
    try {
      setSaving(true);
      const result = await inviteReferralAttorneyWorkspaceCoOwner(partner.id, form);
      setSuccess(result.message || 'Portal co-owner added.');
      setForm({ full_name: '', email: '' });
      setOpen(false);
    } catch (error) {
      onError(error.message || 'Could not add the portal co-owner.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
    <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Portal co-owners</p>
    <p className="mt-1 text-xs leading-5 text-slate-600">A co-owner can manage this portal’s team and settings, but remains restricted to this one referral workspace.</p>
    {success && <p className="mt-2 rounded-md bg-white px-2.5 py-2 text-xs font-medium text-emerald-800">{success}</p>}
    {!open ? <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"><UserPlus className="h-3.5 w-3.5" />Add co-owner</button> : <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <input required value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} placeholder="Co-owner name" className="input !bg-white !py-2 text-xs" />
      <input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="email@firm.com" className="input !bg-white !py-2 text-xs" />
      <div className="flex gap-2"><button type="button" onClick={() => { setOpen(false); setForm({ full_name: '', email: '' }); }} className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700">Cancel</button><button type="submit" disabled={saving} className="rounded-md bg-emerald-700 px-2.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{saving ? 'Adding…' : 'Invite'}</button></div>
    </form>}
  </div>;
}

function Field({ label, required = false, children }) {
  return <label className="block text-sm font-semibold text-slate-700">{label} {required && <span className="text-red-600">*</span>}{children}</label>;
}
