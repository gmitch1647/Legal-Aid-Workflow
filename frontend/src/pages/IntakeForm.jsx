import React, { useState, useRef } from 'react';
import { Scale, Upload, X, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { submitIntakeForm } from '../lib/api';

const CASE_TYPES = [
  { value: '', label: 'Select case type...' },
  { value: 'FCRA', label: 'FCRA — Fair Credit Reporting Act' },
  { value: 'FDCPA', label: 'FDCPA — Fair Debt Collection Practices Act' },
  { value: 'TCPA', label: 'TCPA — Telephone Consumer Protection Act' },
  { value: 'FCRA + FDCPA', label: 'FCRA + FDCPA' },
  { value: 'Other', label: 'Other' },
];

const VIOLATION_TYPES = [
  { value: '', label: 'Select violation type...' },
  { value: 'Inaccurate Reporting', label: 'Inaccurate Credit Reporting' },
  { value: 'Failure to Investigate', label: 'Failure to Investigate Dispute' },
  { value: 'Failure to Delete', label: 'Failure to Delete Inaccurate Info' },
  { value: 'Reinsertion', label: 'Reinsertion of Deleted Information' },
  { value: 'Harassment', label: 'Debt Collection Harassment' },
  { value: 'False Representations', label: 'False/Deceptive Representations' },
  { value: 'Autodialer Calls', label: 'Autodialer/Robocalls' },
  { value: 'Other', label: 'Other' },
];

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
  'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
  'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
  'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
  'Wisconsin','Wyoming',
];

export default function IntakeForm() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [submittedName, setSubmittedName] = useState('');

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    date_of_birth: '', address: '', city: '', state: '', zip_code: '',
    case_type: '', violation_type: '', specific_violation: '',
    adverse_party: '', brief_description: '', affiliate_name: '',
  });
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);

  const update = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  function addFiles(fileList) {
    setFiles(prev => [...prev, ...Array.from(fileList)]);
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function validateStep(s) {
    if (s === 1) return form.first_name && form.last_name && form.email && form.phone;
    if (s === 2) return true;
    if (s === 3) return true;
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([k, v]) => formData.append(k, v || ''));
      files.forEach(f => formData.append('files', f));

      await submitIntakeForm(formData);
      setSubmittedName(form.first_name);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Thank You, {submittedName}!</h2>
          <p className="mt-3 text-slate-600">
            Your case has been submitted successfully. Our team will review your information
            and get back to you within 1-2 business days.
          </p>
          <p className="mt-4 text-sm text-slate-500">
            You will receive a confirmation email at <strong>{form.email}</strong> shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/20">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
            <Scale className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Case Intake Form</h1>
            <p className="text-xs text-slate-400">Consumer Protection · FCRA · FDCPA · TCPA</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Progress steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map(s => (
            <React.Fragment key={s}>
              <button
                onClick={() => s < step && setStep(s)}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition ${
                  s === step ? 'bg-emerald-600 text-white' :
                  s < step ? 'bg-emerald-100 text-emerald-700 cursor-pointer' :
                  'bg-white/10 text-white/40'
                }`}
              >
                {s < step ? '✓' : s}
              </button>
              {s < 4 && <div className={`w-12 h-0.5 ${s < step ? 'bg-emerald-500' : 'bg-white/10'}`} />}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
          {error && (
            <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Step 1 — Personal Info */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Your Information</h2>
              <p className="text-sm text-slate-500 mb-6">Tell us about yourself so we can contact you.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="First Name *" value={form.first_name} onChange={update('first_name')} />
                <Field label="Last Name *" value={form.last_name} onChange={update('last_name')} />
                <Field label="Email *" value={form.email} onChange={update('email')} type="email" />
                <Field label="Phone *" value={form.phone} onChange={update('phone')} type="tel" />
                <Field label="Date of Birth" value={form.date_of_birth} onChange={update('date_of_birth')} type="date" />
                <Field label="Address" value={form.address} onChange={update('address')} />
                <Field label="City" value={form.city} onChange={update('city')} />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                  <select value={form.state} onChange={update('state')} className="input">
                    <option value="">Select state...</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <Field label="ZIP Code" value={form.zip_code} onChange={update('zip_code')} />
              </div>
            </div>
          )}

          {/* Step 2 — Case Details */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Case Details</h2>
              <p className="text-sm text-slate-500 mb-6">Tell us about your case.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Case Type</label>
                  <select value={form.case_type} onChange={update('case_type')} className="input">
                    {CASE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type of Violation</label>
                  <select value={form.violation_type} onChange={update('violation_type')} className="input">
                    {VIOLATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <Field label="Specific Violation" value={form.specific_violation} onChange={update('specific_violation')} placeholder="Describe the specific violation..." />
                <Field label="Adverse Party (who is this against?)" value={form.adverse_party} onChange={update('adverse_party')} placeholder="e.g. Equifax, Midland Credit" />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Brief Description</label>
                  <textarea value={form.brief_description} onChange={update('brief_description')} rows={5}
                    placeholder="Describe what happened, key dates, disputes sent, responses received, how you were harmed..."
                    className="input" />
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Documents */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Supporting Documents</h2>
              <p className="text-sm text-slate-500 mb-6">Upload any relevant documents — credit reports, dispute letters, collection notices, etc.</p>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition"
              >
                <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                <div className="text-sm font-medium text-slate-700">Click or drag files to upload</div>
                <div className="text-xs text-slate-500 mt-1">PDF, DOCX, TXT, PNG, JPG — up to 10MB each</div>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                  onChange={(e) => addFiles(e.target.files)} className="hidden" />
              </div>
              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span className="text-sm text-slate-700 flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-slate-400">{(f.size / 1024).toFixed(0)}KB</span>
                      <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Field label="Affiliate Name" value={form.affiliate_name} onChange={update('affiliate_name')} placeholder="Who referred you? (optional)" />
            </div>
          )}

          {/* Step 4 — Review & Submit */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Review & Submit</h2>
              <p className="text-sm text-slate-500 mb-6">Please review your information before submitting.</p>
              <div className="space-y-4">
                <ReviewSection title="Personal Information">
                  <ReviewItem label="Name" value={`${form.first_name} ${form.last_name}`} />
                  <ReviewItem label="Email" value={form.email} />
                  <ReviewItem label="Phone" value={form.phone} />
                  {form.address && <ReviewItem label="Address" value={`${form.address}, ${form.city}, ${form.state} ${form.zip_code}`} />}
                </ReviewSection>
                <ReviewSection title="Case Details">
                  {form.case_type && <ReviewItem label="Case Type" value={form.case_type} />}
                  {form.violation_type && <ReviewItem label="Violation" value={form.violation_type} />}
                  {form.adverse_party && <ReviewItem label="Against" value={form.adverse_party} />}
                  {form.brief_description && <ReviewItem label="Description" value={form.brief_description} />}
                </ReviewSection>
                {files.length > 0 && (
                  <ReviewSection title="Documents">
                    {files.map((f, i) => <ReviewItem key={i} label={`File ${i + 1}`} value={f.name} />)}
                  </ReviewSection>
                )}
              </div>
              <div className="mt-6 p-4 bg-slate-50 rounded-lg">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" id="confirm" className="mt-1" />
                  <span className="text-sm text-slate-700">I confirm the information above is accurate to the best of my knowledge.</span>
                </label>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t border-slate-200">
            {step > 1 ? (
              <button onClick={() => setStep(step - 1)}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800">
                ← Back
              </button>
            ) : <div />}
            {step < 4 ? (
              <button onClick={() => validateStep(step) && setStep(step + 1)}
                disabled={!validateStep(step)}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                Next →
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting}
                className="px-8 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2 transition">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</> : 'Submit Case'}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Your information is secure and confidential.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
    </div>
  );
}

function ReviewSection({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function ReviewItem({ label, value }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="text-slate-500 w-24 shrink-0">{label}</dt>
      <dd className="text-slate-900 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
