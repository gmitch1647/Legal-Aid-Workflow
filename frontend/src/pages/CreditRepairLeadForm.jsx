import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Paperclip, ShieldCheck, Send, X } from 'lucide-react';
import { createCreditRepairLead } from '../lib/api';

const states = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
const initial = { full_name: '', email: '', phone: '', date_of_birth: '', state: '', street_address: '', city: '', zip: '', case_type: '', adverse_party: '', description: '' };
const acceptedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.heic', '.txt', '.csv'];
const maxFileBytes = 15 * 1024 * 1024;
const maxTotalBytes = 25 * 1024 * 1024;
const maxFiles = 10;

function formatBytes(value) {
  if (!value) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export default function CreditRepairLeadForm() {
  const { referralSlug } = useParams();
  const [form, setForm] = useState(initial);
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const removeFile = (index) => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));

  function selectFiles(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;
    const next = [...files, ...selected];
    if (next.length > maxFiles) {
      setError(`You can attach up to ${maxFiles} documents.`);
      return;
    }
    const invalid = next.find((file) => !acceptedExtensions.some((extension) => file.name.toLowerCase().endsWith(extension)));
    if (invalid) {
      setError(`${invalid.name} is not an accepted document type.`);
      return;
    }
    const oversized = next.find((file) => file.size > maxFileBytes);
    if (oversized) {
      setError(`${oversized.name} is larger than 15 MB.`);
      return;
    }
    const total = next.reduce((sum, file) => sum + file.size, 0);
    if (total > maxTotalBytes) {
      setError('All attachments together must be 25 MB or smaller.');
      return;
    }
    setError('');
    setFiles(next);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSending(true);
    try {
      await createCreditRepairLead({ ...form, ...(referralSlug ? { referral_slug: referralSlug } : {}) }, files);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'We could not submit this lead. Please try again.');
    } finally {
      setSending(false);
    }
  }

  if (submitted) {
    return <main className="min-h-screen bg-slate-950 px-4 py-16 text-slate-100"><section className="mx-auto max-w-xl rounded-3xl border border-emerald-400/30 bg-slate-900 p-10 text-center shadow-2xl"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" /><h1 className="mt-5 text-3xl font-bold">Lead submitted</h1><p className="mt-3 text-slate-300">Thank you. Your information{files.length ? ` and ${files.length} supporting document${files.length === 1 ? '' : 's'}` : ''} have been sent to the Credit Repair Leads team for review.</p><button type="button" onClick={() => { setForm(initial); setFiles([]); setSubmitted(false); }} className="mt-7 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 hover:bg-emerald-400">Submit another lead</button></section></main>;
  }

  return <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100"><div className="mx-auto max-w-4xl"><header className="mb-8"><p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">LegalFlow · Credit Repair</p><h1 className="mt-3 text-4xl font-bold tracking-tight">Credit Repair Lead Intake</h1><p className="mt-3 max-w-2xl text-slate-300">Use this form to submit a potential credit-repair lead. These submissions go to the separate Credit Repair Leads workspace and do not enter the legal case pipeline.</p>{referralSlug && <p className="mt-3 text-sm font-semibold text-emerald-300">Referral partner link recognized. This lead will be saved to the referring partner’s profile.</p>}</header><form onSubmit={submit} className="space-y-6 rounded-3xl bg-white p-6 text-slate-900 shadow-2xl md:p-9"><section><h2 className="text-lg font-bold">Client information</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="md:col-span-2">Full name *<input required value={form.full_name} onChange={(e) => update('full_name', e.target.value)} placeholder="Jane Doe" /></label><label>Email<input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="jane@example.com" /></label><label>Phone<input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="(555) 000-0000" /></label><label>Date of birth<input type="date" value={form.date_of_birth} onChange={(e) => update('date_of_birth', e.target.value)} /></label><label>State<select value={form.state} onChange={(e) => update('state', e.target.value)}><option value="">Select state</option>{states.map((state) => <option key={state}>{state}</option>)}</select></label><label className="md:col-span-2">Street address<input value={form.street_address} onChange={(e) => update('street_address', e.target.value)} placeholder="123 Main St" /></label><label>City<input value={form.city} onChange={(e) => update('city', e.target.value)} /></label><label>ZIP code<input value={form.zip} onChange={(e) => update('zip', e.target.value)} /></label></div></section><section className="border-t border-slate-200 pt-6"><h2 className="text-lg font-bold">Credit repair details</h2><div className="mt-4 grid gap-4"><label>Primary issue or service needed<select value={form.case_type} onChange={(e) => update('case_type', e.target.value)}><option value="">Select one</option><option>Credit report inaccuracies</option><option>Identity theft or accounts not mine</option><option>Collections or charge-offs</option><option>Late payments or payment history</option><option>Credit building or restoration</option><option>Other</option></select></label><label>Adverse party, creditor, or bureau<input value={form.adverse_party} onChange={(e) => update('adverse_party', e.target.value)} placeholder="Company, creditor, or credit bureau" /></label><label>Description / notes<textarea rows={6} value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Describe the credit issue and what assistance is needed." /></label></div></section><section className="border-t border-slate-200 pt-6"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-bold">Supporting documents <span className="text-sm font-normal text-slate-500">Optional</span></h2><p className="mt-1 text-sm text-slate-600">Attach credit reports, dispute letters, bureau responses, screenshots, identification, or other review documents.</p></div><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-600 px-4 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-50"><Paperclip className="h-4 w-4" />Add documents<input className="sr-only" type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.txt,.csv" onChange={selectFiles} /></label></div><p className="mt-3 text-xs text-slate-500">Up to {maxFiles} files. PDF, Word, image, text, and CSV files are accepted; 15 MB each and 25 MB total.</p>{files.length > 0 && <div className="mt-4 divide-y rounded-xl border border-slate-200">{files.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{file.name}</p><p className="text-xs text-slate-500">{formatBytes(file.size)}</p></div><button type="button" onClick={() => removeFile(index)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Remove ${file.name}`}><X className="h-4 w-4" /></button></div>)}</div>}</section>{error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}<div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />Only submit information and documents necessary for the team to review this credit-repair lead. Do not include full Social Security numbers or financial account numbers in this form.</div><button disabled={sending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-60"><Send className="h-4 w-4" />{sending ? 'Submitting…' : 'Submit credit repair lead'}</button></form></div><style>{'label{display:block;font-size:.875rem;font-weight:600;color:#334155}input:not(.sr-only),select,textarea{display:block;width:100%;margin-top:.4rem;border:1px solid #cbd5e1;border-radius:.65rem;padding:.7rem .8rem;font-weight:400;outline:none}input:focus,select:focus,textarea:focus{border-color:#059669;box-shadow:0 0 0 3px rgb(16 185 129 / .15)}'}</style></main>;
}
