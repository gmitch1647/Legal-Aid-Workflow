import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitCase, uploadDocument, registerClient } from '../../lib/api';
import { X, Plus, FileText, Loader2, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';

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

const VIOLATION_CATEGORIES = [
  { value: '', label: '— Select —' },
  { value: 'FCRA', label: 'FCRA — Fair Credit Reporting Act' },
  { value: 'FDCPA', label: 'FDCPA — Fair Debt Collection Practices Act' },
  { value: 'TCPA', label: 'TCPA — Telephone Consumer Protection Act' },
];

const VIOLATION_TYPES = {
  FCRA: [
    { value: '', label: '— Select Type —' },
    { value: 'Inaccurate Reporting', label: 'Inaccurate Credit Reporting' },
    { value: 'Failure to Investigate', label: 'Failure to Investigate Dispute' },
    { value: 'Failure to Delete', label: 'Failure to Delete Inaccurate Info' },
    { value: 'Reinsertion', label: 'Reinsertion of Deleted Information' },
    { value: 'No File Disclosure', label: 'Failure to Provide File Disclosure' },
    { value: 'No Dispute Notice', label: 'Failure to Note Dispute' },
    { value: 'Mixed File', label: 'Mixed File / Wrong Person Reporting' },
    { value: 'Permissible Purpose', label: 'No Permissible Purpose (Unauthorized Pull)' },
    { value: 'Other', label: 'Other FCRA Violation' },
  ],
  FDCPA: [
    { value: '', label: '— Select Type —' },
    { value: 'Harassment', label: 'Harassment / Abuse' },
    { value: 'False Representations', label: 'False or Misleading Representations' },
    { value: 'Unfair Practices', label: 'Unfair Collection Practices' },
    { value: 'Validation Failure', label: 'Failure to Validate Debt' },
    { value: 'Third Party Disclosure', label: 'Third Party Disclosure' },
    { value: 'Cease Communication', label: 'Continued Contact After Cease Letter' },
    { value: 'Wrong Time', label: 'Calls Before 8am or After 9pm' },
    { value: 'Other', label: 'Other FDCPA Violation' },
  ],
  TCPA: [
    { value: '', label: '— Select Type —' },
    { value: 'Autodialer', label: 'Autodialer / Robocalls Without Consent' },
    { value: 'Prerecorded', label: 'Prerecorded Voice Messages' },
    { value: 'DNC', label: 'Do Not Call Registry Violation' },
    { value: 'Revoked Consent', label: 'Calls After Revoking Consent' },
    { value: 'Other', label: 'Other TCPA Violation' },
  ],
};

const EVIDENCE_OPTIONS = [
  { value: '', label: '— Select —' },
  { value: 'yes', label: 'Yes — I have supporting documents' },
  { value: 'some', label: 'Some — I have partial documentation' },
  { value: 'no', label: 'No — I do not have documents yet' },
];

const DEFAULT_DOC_CATEGORIES = [
  { key: 'credit_report', label: 'Credit Report' },
  { key: 'collection_letter', label: 'Collection Letter' },
  { key: 'screenshots', label: 'Screenshots' },
  { key: 'call_logs', label: 'Call Logs' },
  { key: 'other', label: 'Other Documents' },
];

const FORM_CONFIG_KEY = 'case_submission_config';

function loadFormConfig() {
  try {
    const saved = localStorage.getItem(FORM_CONFIG_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {
    violationCategories: [...VIOLATION_CATEGORIES.filter(c => c.value)],
    violationTypes: { ...VIOLATION_TYPES },
    docCategories: [...DEFAULT_DOC_CATEGORIES],
  };
}

function saveFormConfig(config) {
  try { localStorage.setItem(FORM_CONFIG_KEY, JSON.stringify(config)); } catch {}
}

const EMPTY_VIOLATION = { category: '', type: '', description: '', date: '' };

export default function CaseSubmission() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [formConfig, setFormConfig] = useState(loadFormConfig);
  const [newCatName, setNewCatName] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [newDocCat, setNewDocCat] = useState('');

  const [consumer, setConsumer] = useState({
    full_name: '', state: '', phone: '', email: '',
    street_address: '', city: '', zip_code: '',
  });

  const [creditor, setCreditor] = useState('');
  const [evidence, setEvidence] = useState('');
  const [violations, setViolations] = useState([{ ...EMPTY_VIOLATION }]);
  const [notes, setNotes] = useState('');

  const [docs, setDocs] = useState({
    credit_report: [], collection_letter: [], screenshots: [],
    call_logs: [], other: [],
  });

  // Config management
  function addViolationCategory(name) {
    if (!name.trim()) return;
    const value = name.trim().toUpperCase().replace(/\s+/g, '_');
    const updated = { ...formConfig };
    updated.violationCategories = [...updated.violationCategories, { value, label: name.trim() }];
    updated.violationTypes[value] = [{ value: '', label: '— Select Type —' }];
    setFormConfig(updated);
    saveFormConfig(updated);
    setNewCatName('');
  }

  function removeViolationCategory(value) {
    const updated = { ...formConfig };
    updated.violationCategories = updated.violationCategories.filter(c => c.value !== value);
    delete updated.violationTypes[value];
    setFormConfig(updated);
    saveFormConfig(updated);
  }

  function addViolationType(category, name) {
    if (!name.trim() || !category) return;
    const value = name.trim();
    const updated = { ...formConfig };
    updated.violationTypes[category] = [...(updated.violationTypes[category] || []), { value, label: name.trim() }];
    setFormConfig(updated);
    saveFormConfig(updated);
    setNewTypeName('');
  }

  function removeViolationType(category, value) {
    const updated = { ...formConfig };
    updated.violationTypes[category] = (updated.violationTypes[category] || []).filter(t => t.value !== value);
    setFormConfig(updated);
    saveFormConfig(updated);
  }

  function addDocCategory(name) {
    if (!name.trim()) return;
    const key = name.trim().toLowerCase().replace(/\s+/g, '_');
    const updated = { ...formConfig };
    updated.docCategories = [...updated.docCategories, { key, label: name.trim() }];
    setFormConfig(updated);
    saveFormConfig(updated);
    setDocs(prev => ({ ...prev, [key]: [] }));
    setNewDocCat('');
  }

  function removeDocCategory(key) {
    const updated = { ...formConfig };
    updated.docCategories = updated.docCategories.filter(c => c.key !== key);
    setFormConfig(updated);
    saveFormConfig(updated);
  }

  function updateConsumer(field, value) {
    setConsumer(prev => ({ ...prev, [field]: value }));
  }

  function addViolation() {
    setViolations(prev => [...prev, { ...EMPTY_VIOLATION }]);
  }

  function removeViolation(idx) {
    if (violations.length === 1) return;
    setViolations(prev => prev.filter((_, i) => i !== idx));
  }

  function updateViolation(idx, field, value) {
    setViolations(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  }

  function handleFileChange(category, e) {
    const files = Array.from(e.target.files || []);
    setDocs(prev => ({ ...prev, [category]: [...prev[category], ...files] }));
  }

  function removeFile(category, idx) {
    setDocs(prev => ({ ...prev, [category]: prev[category].filter((_, i) => i !== idx) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!consumer.full_name || !consumer.state) {
      setError('Consumer name and state are required.');
      return;
    }
    if (!creditor) {
      setError('Creditor / Collector name is required.');
      return;
    }
    if (violations.some(v => !v.category || !v.type || !v.description)) {
      setError('Each violation needs a category, type, and description.');
      return;
    }

    setSubmitting(true);

    try {
      // Step 1: Register as a client (creates auth user + profile)
      let clientId = null;
      if (consumer.email) {
        try {
          const clientResult = await registerClient({
            email: consumer.email,
            full_name: consumer.full_name,
            phone: consumer.phone || null,
            address: consumer.street_address || null,
            county: consumer.city || null,
            state: consumer.state || null,
          });
          clientId = clientResult?.profile?.id || clientResult?.id || null;
        } catch (err) {
          // Client may already exist — that's okay, continue with case submission
          console.log('Client registration skipped (may already exist):', err.message);
        }
      }

      // Step 2: Build case facts
      const caseFacts = violations.map((v, i) =>
        `Violation ${i + 1}: [${v.category}] ${v.type} — ${v.description}${v.date ? ` (Date: ${v.date})` : ''}`
      ).join('\n\n');

      const fullDescription = `CONSUMER: ${consumer.full_name}\n` +
        `ADDRESS: ${consumer.street_address}, ${consumer.city}, ${consumer.state} ${consumer.zip_code}\n` +
        `PHONE: ${consumer.phone}\nEMAIL: ${consumer.email}\n\n` +
        `CREDITOR/COLLECTOR: ${creditor}\n` +
        `EVIDENCE: ${evidence}\n\n` +
        `VIOLATIONS:\n${caseFacts}\n\n` +
        (notes ? `ADDITIONAL NOTES:\n${notes}` : '');

      // Step 3: Submit the case (linked to client if created)
      const result = await submitCase({
        full_name: consumer.full_name,
        email: consumer.email,
        phone: consumer.phone,
        address: consumer.street_address,
        county: consumer.city,
        state: consumer.state,
        defendants: [{ name: creditor }],
        description: fullDescription,
        start_date: violations[0]?.date || '',
        harm_description: violations.map(v => v.description).join('; '),
        client_id: clientId,
      });

      const caseId = result?.id || result?.case_id;

      if (caseId) {
        const allFiles = [
          ...docs.credit_report.map(f => ({ file: f, category: 'credit_report' })),
          ...docs.collection_letter.map(f => ({ file: f, category: 'collection_notice' })),
          ...docs.screenshots.map(f => ({ file: f, category: 'screenshot' })),
          ...docs.call_logs.map(f => ({ file: f, category: 'call_log' })),
          ...docs.other.map(f => ({ file: f, category: 'other' })),
        ];

        for (const { file, category } of allFiles) {
          try {
            await uploadDocument(caseId, file, category);
          } catch (err) {
            console.error('Upload failed:', file.name, err);
          }
        }
      }

      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Case Submitted Successfully</h1>
        <p className="text-slate-600 mb-6">Our team will review your case and get back to you shortly.</p>
        <button onClick={() => navigate('/client/dashboard')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mb-3">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Submit New Case</h1>
          <p className="text-sm text-slate-500 mt-1">Fill out all required fields to submit a consumer case for review.</p>
        </div>
        <button onClick={() => setEditMode(!editMode)}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition ${editMode ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          {editMode ? '✏️ Editing Form' : '⚙️ Customize'}
        </button>
      </div>
      <div className="mb-6" />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ═══ Consumer Information ═══ */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Consumer Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Consumer Full Name <span className="text-red-500">*</span></label>
              <input value={consumer.full_name} onChange={e => updateConsumer('full_name', e.target.value)}
                placeholder="e.g. Jane Smith"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">State <span className="text-red-500">*</span></label>
              <select value={consumer.state} onChange={e => updateConsumer('state', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select State —</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Consumer Phone</label>
              <input value={consumer.phone} onChange={e => updateConsumer('phone', e.target.value)}
                placeholder="(555) 555-5555"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Consumer Email</label>
              <input type="email" value={consumer.email} onChange={e => updateConsumer('email', e.target.value)}
                placeholder="consumer@email.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Street Address</label>
              <input value={consumer.street_address} onChange={e => updateConsumer('street_address', e.target.value)}
                placeholder="e.g. 123 Main St"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">City</label>
              <input value={consumer.city} onChange={e => updateConsumer('city', e.target.value)}
                placeholder="e.g. Atlanta"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Zip Code</label>
              <input value={consumer.zip_code} onChange={e => updateConsumer('zip_code', e.target.value)}
                placeholder="e.g. 30301"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </section>

        {/* ═══ Violation Details ═══ */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Violation Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Creditor / Collector <span className="text-red-500">*</span></label>
              <input value={creditor} onChange={e => setCreditor(e.target.value)}
                placeholder="e.g. Portfolio Recovery Associates"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Evidence Available?</label>
              <select value={evidence} onChange={e => setEvidence(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {EVIDENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Edit Mode: Manage Categories & Types */}
          {editMode && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-bold text-amber-800">Customize Violation Categories</h3>
              <div className="flex flex-wrap gap-1.5">
                {formConfig.violationCategories.map(c => (
                  <span key={c.value} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-200 rounded-full text-xs">
                    {c.label}
                    <button onClick={() => removeViolationCategory(c.value)} className="text-amber-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addViolationCategory(newCatName); } }}
                  placeholder="New category name..." className="flex-1 rounded-lg border border-amber-300 px-3 py-1.5 text-sm" />
                <button onClick={() => addViolationCategory(newCatName)} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium">Add</button>
              </div>

              <h3 className="text-sm font-bold text-amber-800 pt-2">Customize Violation Types</h3>
              <select value={editingCategory} onChange={e => setEditingCategory(e.target.value)}
                className="w-full rounded-lg border border-amber-300 px-3 py-1.5 text-sm">
                <option value="">— Select category to edit types —</option>
                {formConfig.violationCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {editingCategory && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(formConfig.violationTypes[editingCategory] || []).filter(t => t.value).map(t => (
                      <span key={t.value} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-200 rounded-full text-xs">
                        {t.label}
                        <button onClick={() => removeViolationType(editingCategory, t.value)} className="text-amber-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addViolationType(editingCategory, newTypeName); } }}
                      placeholder="New violation type..." className="flex-1 rounded-lg border border-amber-300 px-3 py-1.5 text-sm" />
                    <button onClick={() => addViolationType(editingCategory, newTypeName)} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium">Add</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mb-2">
            <label className="text-sm font-semibold text-slate-900">Violations <span className="text-red-500">*</span></label>
            <span className="text-xs text-slate-400 ml-2">Add one or more violations below</span>
          </div>

          <div className="space-y-4">
            {violations.map((v, idx) => (
              <div key={idx} className="bg-slate-50 rounded-xl border border-slate-200 p-4 relative">
                {violations.length > 1 && (
                  <button type="button" onClick={() => removeViolation(idx)}
                    className="absolute top-3 right-3 text-slate-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Category <span className="text-red-500">*</span></label>
                    <select value={v.category} onChange={e => updateViolation(idx, 'category', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Select —</option>
                      {formConfig.violationCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Violation Type <span className="text-red-500">*</span></label>
                    <select value={v.type} onChange={e => updateViolation(idx, 'type', e.target.value)}
                      disabled={!v.category}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                      {(formConfig.violationTypes[v.category] || [{ value: '', label: '— Select category first —' }]).map(t =>
                        <option key={t.value} value={t.value}>{t.label}</option>
                      )}
                    </select>
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Description <span className="text-red-500">*</span></label>
                    <textarea value={v.description} onChange={e => updateViolation(idx, 'description', e.target.value)}
                      placeholder="Describe what happened..."
                      rows={3}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Date <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input type="date" value={v.date} onChange={e => updateViolation(idx, 'date', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={addViolation}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 border-2 border-dashed border-blue-300 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition">
            <Plus className="w-4 h-4" /> Add Violation
          </button>

          <div className="mt-5">
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Additional Notes / Context <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any other information our team should know before reviewing this case."
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
          </div>
        </section>

        {/* ═══ Supporting Documents ═══ */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Supporting Documents</h2>
          <p className="text-xs text-slate-400 mb-4">Accepted formats: PDF, PNG, JPG, DOC, DOCX, CSV, TXT · Max 20 MB per file · Multiple files allowed per category</p>

          {editMode && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-amber-800">Customize Document Categories</h3>
              <div className="flex flex-wrap gap-1.5">
                {formConfig.docCategories.map(c => (
                  <span key={c.key} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-200 rounded-full text-xs">
                    {c.label}
                    <button onClick={() => removeDocCategory(c.key)} className="text-amber-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={newDocCat} onChange={e => setNewDocCat(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDocCategory(newDocCat); } }}
                  placeholder="New document category..." className="flex-1 rounded-lg border border-amber-300 px-3 py-1.5 text-sm" />
                <button onClick={() => addDocCategory(newDocCat)} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium">Add</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {formConfig.docCategories.map(cat => (
              <div key={cat.key}>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">{cat.label}</label>
                <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.csv,.txt"
                  onChange={e => handleFileChange(cat.key, e)}
                  className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-sm file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50" />
                {(docs[cat.key] || []).length > 0 && (
                  <div className="mt-1 space-y-1">
                    {(docs[cat.key] || []).map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded px-2 py-1">
                        <FileText className="w-3 h-3" />
                        <span className="truncate flex-1">{f.name}</span>
                        <button type="button" onClick={() => removeFile(cat.key, i)} className="text-slate-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={submitting}
            className="px-8 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : 'Submit Case'}
          </button>
          <button type="button" onClick={() => navigate(-1)}
            className="px-6 py-3 text-sm text-slate-600 hover:text-slate-800">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
