import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Scale,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { getReferralWorkspaceConfig, submitCaseReferralForm } from '../lib/api';

const CASE_TYPES = [
  'FCRA',
  'FDCPA',
  'State Law Violation',
  'TCPA',
  'Other',
];

const VIOLATION_TYPES = [
  'E8',
  'Reverse E8',
  'Refusal',
  'Inconvenience',
  'Other',
];

const ASSISTANCE_OPTIONS = [
  'LegalFlow Intake Team',
  'Gary Mitchell — Georgia clients only',
  'Esther Oise — Consumer Protection Matters',
  'No preference',
];

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming',
];

const ACCEPTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'png', 'jpg', 'jpeg'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  date_of_birth: '',
  address: '',
  city: '',
  state: '',
  zip_code: '',
  case_type: '',
  violation_type: '',
  specific_violation: '',
  adverse_party: '',
  brief_description: '',
  requested_assistance: 'LegalFlow Intake Team',
  affiliate_name: '',
};

function fileError(file) {
  const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
  if (!ACCEPTED_EXTENSIONS.includes(extension)) return `${file.name} is not an accepted file type.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} exceeds the 10 MB limit.`;
  return null;
}

export default function CaseReferralForm() {
  const { referralSlug } = useParams();
  const [form, setForm] = useState(EMPTY_FORM);
  const [workspace, setWorkspace] = useState(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(Boolean(referralSlug));
  const [files, setFiles] = useState([]);
  const [complaint, setComplaint] = useState(null);
  const [certified, setCertified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef(null);
  const complaintInputRef = useRef(null);

  useEffect(() => {
    if (!referralSlug) return;
    let active = true;
    setWorkspaceLoading(true);
    getReferralWorkspaceConfig(referralSlug)
      .then((config) => {
        if (!active) return;
        setWorkspace(config);
        setForm((current) => ({
          ...current,
          affiliate_name: config.partner_name || current.affiliate_name,
          requested_assistance: config.requested_assistance || current.requested_assistance,
        }));
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'This referral workspace is unavailable.');
      })
      .finally(() => { if (active) setWorkspaceLoading(false); });
    return () => { active = false; };
  }, [referralSlug]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function addFiles(fileList) {
    setError('');
    const incoming = Array.from(fileList || []);
    const slotsLeft = MAX_FILES - files.length;
    if (slotsLeft <= 0) {
      setError(`You can upload no more than ${MAX_FILES} supporting documents.`);
      return;
    }

    const accepted = [];
    for (const file of incoming.slice(0, slotsLeft)) {
      const issue = fileError(file);
      if (issue) {
        setError(issue);
        continue;
      }
      const isDuplicate = files.some((existing) => existing.name === file.name && existing.size === file.size)
        || accepted.some((existing) => existing.name === file.name && existing.size === file.size);
      if (!isDuplicate) accepted.push(file);
    }
    if (incoming.length > slotsLeft) setError(`Only the first ${slotsLeft} additional document${slotsLeft === 1 ? '' : 's'} could be added.`);
    if (accepted.length) setFiles((current) => [...current, ...accepted]);
  }

  function selectAddress(suggestion) {
    setForm((current) => ({
      ...current,
      address: suggestion.line1 || current.address,
      city: suggestion.city || current.city,
      state: suggestion.state || current.state,
      zip_code: suggestion.zip_code || current.zip_code,
    }));
  }

  function validate() {
    const required = [
      ['Client first name', form.first_name],
      ['Client last name', form.last_name],
      ['Client primary email', form.email],
      ['Client phone', form.phone],
      ['Client date of birth', form.date_of_birth],
      ['Client address', form.address],
      ['City', form.city],
      ['State', form.state],
      ['ZIP code', form.zip_code],
      ['Case type', form.case_type],
      ['Type of violation', form.violation_type],
      ['Adverse party', form.adverse_party],
      ['Requested assistance', form.requested_assistance],
      ['Referral organization', form.affiliate_name],
    ];
    const missing = required.find(([, value]) => !String(value || '').trim());
    if (missing) return `Complete the required field: ${missing[0]}.`;
    if (!files.length && !complaint) return 'Upload a complaint or at least one supporting document.';
    if (!certified) return 'Confirm the referral information is accurate before submitting.';
    return '';
  }

  async function submit(event) {
    event.preventDefault();
    const validationMessage = validate();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([field, value]) => payload.append(field, value || ''));
      if (referralSlug) payload.append('referral_slug', referralSlug);
      payload.append('certification', String(certified));
      files.forEach((file) => payload.append('files', file));
      if (complaint) payload.append('complaint', complaint);
      await submitCaseReferralForm(payload);
      setSubmitted(true);
    } catch (submissionError) {
      setError(submissionError.message || 'The referral could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-12 sm:py-20">
        <section className="mx-auto max-w-xl overflow-hidden rounded-3xl border border-slate-700 bg-white shadow-2xl">
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950 px-8 py-10 text-center text-white">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/20 ring-1 ring-emerald-300/40">
              <CheckCircle2 className="h-9 w-9 text-emerald-300" />
            </span>
            <h1 className="mt-5 text-2xl font-bold">Case Submission Received</h1>
            <p className="mt-2 text-sm text-slate-300">Your supporting documents and referral details were securely sent to LegalFlow.</p>
          </div>
          <div className="p-8 text-center">
            <p className="text-lg font-semibold text-slate-900">Thank you, {form.first_name}.</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              The referral has been created in <strong>Case Submission</strong> for LegalFlow review. The team will review the information and contact the client or referral partner if additional details are needed.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 py-8 sm:py-12">
      <section className="mx-auto max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
        <header className="border-b-2 border-emerald-400 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-10 text-center text-white sm:px-10">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-400/15 ring-1 ring-emerald-300/30">
            <Scale className="h-6 w-6 text-emerald-300" />
          </span>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">LegalFlow</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Case Referral Hub</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            {workspace ? `Submit a new referral through ${workspace.partner_name}'s private LegalFlow workspace. The assigned attorney will review it in the dedicated referral pipeline.` : 'Submit a new case referral below. Please ensure the client information and supporting documents are complete before submitting.'}
          </p>
        </header>

        <div className="space-y-8 px-5 py-7 sm:px-10 sm:py-10">
          <aside className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">Before you begin</p>
              <p className="mt-1 leading-5">Have the client’s full contact information, date of birth, case details, and supporting documents ready. Incomplete referrals may be returned for more information.</p>
            </div>
          </aside>

          {error && (
            <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-9" noValidate>
            <section>
              <SectionHeading title="Client Details" description="Complete the client information used to create the Case Submission record." />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <TextField label="Client First Name" required value={form.first_name} onChange={(event) => update('first_name', event.target.value)} />
                <TextField label="Client Last Name" required value={form.last_name} onChange={(event) => update('last_name', event.target.value)} />
                <TextField label="Client Primary Email" required type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
                <TextField label="Client Phone" required type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} />
                <TextField label="Client DOB" required type="date" value={form.date_of_birth} onChange={(event) => update('date_of_birth', event.target.value)} />
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Client Address <Required /></label>
                  <AddressAutocomplete
                    value={form.address}
                    onChange={(value) => update('address', value)}
                    onSelect={selectAddress}
                    placeholder="Start typing the client’s mailing address"
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                <TextField label="City" required value={form.city} onChange={(event) => update('city', event.target.value)} />
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">State / Province <Required /></label>
                  <select value={form.state} onChange={(event) => update('state', event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" required>
                    <option value="">Select a state</option>
                    {US_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                  </select>
                </div>
                <TextField label="ZIP / Postal Code" required value={form.zip_code} onChange={(event) => update('zip_code', event.target.value)} />
              </div>
            </section>

            <section>
              <SectionHeading title="Case Details" description="Provide the information LegalFlow needs to place the case in Case Submission." />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <SelectField label="Case Type" required value={form.case_type} onChange={(event) => update('case_type', event.target.value)} options={CASE_TYPES} placeholder="Select a case type" />
                <SelectField label="Type of Violation" required value={form.violation_type} onChange={(event) => update('violation_type', event.target.value)} options={VIOLATION_TYPES} placeholder="Select a violation" />
                <TextField label="Specific Violation" value={form.specific_violation} onChange={(event) => update('specific_violation', event.target.value)} placeholder="Describe the specific violation, if known" />
                <TextField label="Adverse Party" required value={form.adverse_party} onChange={(event) => update('adverse_party', event.target.value)} placeholder="Company, collector, bureau, or other party" />
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Brief Description</label>
                  <textarea
                    value={form.brief_description}
                    onChange={(event) => update('brief_description', event.target.value)}
                    rows={5}
                    placeholder="Describe the issue, important dates, disputes, responses, and how the client was affected."
                    className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                {workspace ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Submission Routing <Required /></label>
                    <div className="flex min-h-11 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-900">Main LegalFlow — Esther Oise</div>
                    <p className="mt-1 text-xs text-slate-500">This private link always sends the referral to the main LegalFlow workspace and assigns Esther Oise for review.</p>
                  </div>
                ) : (
                  <SelectField label="Who would you like to get help from?" required value={form.requested_assistance} onChange={(event) => update('requested_assistance', event.target.value)} options={ASSISTANCE_OPTIONS} placeholder="Select a review team" />
                )}
                {workspace ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Referral Organization / Affiliate Name <Required /></label>
                    <div className="flex min-h-11 items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-900">{workspace.partner_name}</div>
                    <p className="mt-1 text-xs text-slate-500">This private link records the correct referral source automatically.</p>
                  </div>
                ) : (
                  <TextField label="Referral Organization / Affiliate Name" required value={form.affiliate_name} onChange={(event) => update('affiliate_name', event.target.value)} placeholder="Name of the referring organization" />
                )}
              </div>
            </section>

            <section>
              <SectionHeading title="Complaint Document" description="Upload the complaint separately when one is already available. It will be saved as the case complaint and PDF complaints receive a Word download copy." />
              <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/50 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Complaint upload <span className="font-normal text-slate-500">(optional)</span></p>
                    <p className="mt-1 text-xs text-slate-600">PDF, DOC, DOCX, TXT, PNG, JPG, or JPEG · One file · 10 MB maximum</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => complaintInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-100">
                      <Upload className="h-4 w-4" /> {complaint ? 'Replace complaint' : 'Upload complaint'}
                    </button>
                    {complaint && <button type="button" onClick={() => setComplaint(null)} className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-red-600" aria-label="Remove complaint"><X className="h-4 w-4" /></button>}
                  </div>
                </div>
                <input
                  ref={complaintInputRef}
                  className="hidden"
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const issue = fileError(file);
                    if (issue) { setError(issue); return; }
                    setError('');
                    setComplaint(file);
                  }}
                />
                {complaint && <div className="mt-4 flex items-center gap-3 rounded-lg border border-violet-200 bg-white px-3 py-2.5"><FileText className="h-5 w-5 shrink-0 text-violet-700" /><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{complaint.name}</span><span className="shrink-0 text-xs text-slate-500">{(complaint.size / 1024 / 1024).toFixed(1)} MB</span></div>}
              </div>
            </section>

            <section>
              <SectionHeading title="Supporting Documents" description="Upload additional documents that support this referral. They will be saved to the submitted case for review." />
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  addFiles(event.dataTransfer.files);
                }}
                className="mt-5 cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-emerald-500 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                <Upload className="mx-auto h-9 w-9 text-emerald-700" />
                <p className="mt-3 text-sm font-semibold text-slate-900">Drop supporting documents here or select files</p>
                <p className="mt-1 text-xs text-slate-500">PDF, DOC, DOCX, TXT, PNG, JPG, or JPEG · Up to 10 files · 10 MB each</p>
                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                  onChange={(event) => addFiles(event.target.files)}
                />
              </div>
              {files.length > 0 && (
                <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-3 bg-white px-4 py-3">
                      <FileText className="h-5 w-5 shrink-0 text-emerald-700" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{file.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                      <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} className="rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={certified} onChange={(event) => setCertified(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm leading-6 text-slate-700">
                  I confirm that the client has been informed about this referral, the information is accurate to the best of my knowledge, and I am authorized to provide the supporting documents for LegalFlow’s review.
                </span>
              </label>
            </section>

            <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center">
              <p className="text-xs leading-5 text-slate-500">Submitted information is confidential and is used only for LegalFlow case review.</p>
              <button type="submit" disabled={submitting || workspaceLoading || Boolean(referralSlug && !workspace)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting referral…</> : 'Submit Case Referral'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

function SectionHeading({ title, description }) {
  return (
    <div className="border-b border-slate-200 pb-3">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function Required() {
  return <span aria-hidden="true" className="text-red-600">*</span>;
}

function TextField({ label, required = false, type = 'text', value, onChange, placeholder = '' }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label} {required && <Required />}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} required={required} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
    </div>
  );
}

function SelectField({ label, required = false, value, onChange, options, placeholder }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label} {required && <Required />}</label>
      <select value={value} onChange={onChange} required={required} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}
