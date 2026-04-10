import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDefendants, submitCase, uploadDocument } from '../../lib/api';
import { getUserProfile } from '../../lib/supabase';
import { ChevronLeft, ChevronRight, Check, Upload, X, Plus, FileText, AlertCircle } from 'lucide-react';

const STEPS = [
  'Tell Us About Yourself',
  'Who Is This Case Against?',
  'What Happened?',
  'Upload Your Documents',
  'Review and Submit',
];

const DOCUMENT_CATEGORIES = [
  { value: 'credit_report', label: 'Credit Report' },
  { value: 'dispute_letter', label: 'Dispute Letter' },
  { value: 'bureau_response', label: 'Response from Bureau' },
  { value: 'collection_notice', label: 'Collection Notice' },
  { value: 'call_log', label: 'Call Log' },
  { value: 'other', label: 'Other' },
];

const ACCEPTED_TYPES = '.pdf,.docx,.txt,.png,.jpg,.jpeg';

export default function CaseSubmission() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [allDefendants, setAllDefendants] = useState([]);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    county: '',
    state: '',
    defendants: [],
    description: '',
    start_date: '',
    dispute_date: '',
    harm_description: '',
    documents: [],
    confirmed: false,
  });

  const [customDefendant, setCustomDefendant] = useState({ name: '', address: '', entity_type: 'Debt Collector' });
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [selectedDefendantId, setSelectedDefendantId] = useState('');
  const [uploadCategory, setUploadCategory] = useState('other');

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      const [defs, profile] = await Promise.all([getDefendants(), getUserProfile()]);
      setAllDefendants(defs || []);
      if (profile) {
        setFormData(prev => ({
          ...prev,
          full_name: profile.full_name || '',
          email: profile.email || '',
          phone: profile.phone || '',
          address: profile.address || '',
          county: profile.county || '',
          state: profile.state || '',
        }));
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  function updateField(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  }

  function addDefendant() {
    if (!selectedDefendantId) return;
    const def = allDefendants.find(d => d.id === selectedDefendantId);
    if (def && !formData.defendants.find(d => d.id === def.id)) {
      setFormData(prev => ({ ...prev, defendants: [...prev.defendants, def] }));
    }
    setSelectedDefendantId('');
  }

  function addCustomDefendant() {
    if (!customDefendant.name.trim()) return;
    const custom = {
      id: `custom_${Date.now()}`,
      name: customDefendant.name,
      principal_address: customDefendant.address,
      entity_type: customDefendant.entity_type,
      is_custom: true,
    };
    setFormData(prev => ({ ...prev, defendants: [...prev.defendants, custom] }));
    setCustomDefendant({ name: '', address: '', entity_type: 'Debt Collector' });
    setShowCustomForm(false);
  }

  function removeDefendant(id) {
    setFormData(prev => ({ ...prev, defendants: prev.defendants.filter(d => d.id !== id) }));
  }

  async function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds 10MB limit`);
        continue;
      }
      setFormData(prev => ({
        ...prev,
        documents: [...prev.documents, { file, category: uploadCategory, name: file.name, size: file.size }],
      }));
    }
    e.target.value = '';
  }

  function removeDocument(idx) {
    setFormData(prev => ({ ...prev, documents: prev.documents.filter((_, i) => i !== idx) }));
  }

  function validateStep() {
    switch (step) {
      case 0:
        if (!formData.full_name.trim() || !formData.email.trim()) {
          setError('Please fill in your name and email.');
          return false;
        }
        break;
      case 1:
        if (formData.defendants.length === 0) {
          setError('Please add at least one defendant.');
          return false;
        }
        break;
      case 2:
        if (!formData.description.trim()) {
          setError('Please describe what happened.');
          return false;
        }
        break;
    }
    setError('');
    return true;
  }

  function nextStep() {
    if (validateStep()) setStep(prev => Math.min(prev + 1, STEPS.length - 1));
  }

  function prevStep() {
    setStep(prev => Math.max(prev - 1, 0));
    setError('');
  }

  async function handleSubmit() {
    if (!formData.confirmed) {
      setError('Please confirm the information is accurate.');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const defendant_ids = formData.defendants.filter(d => !d.is_custom).map(d => d.id);
      const case_facts = [
        formData.description,
        formData.start_date ? `Start date: ${formData.start_date}` : '',
        formData.dispute_date ? `First dispute date: ${formData.dispute_date}` : '',
      ].filter(Boolean).join('\n\n');

      const caseData = {
        case_facts,
        damages_description: formData.harm_description,
        defendant_ids,
      };

      const result = await submitCase(caseData);

      if (result?.id && formData.documents.length > 0) {
        for (const doc of formData.documents) {
          try {
            await uploadDocument(result.id, doc.file, doc.category);
          } catch (err) {
            console.error(`Failed to upload ${doc.name}:`, err);
          }
        }
      }

      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Failed to submit case. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="bg-green-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">
          Thank you, {formData.full_name}!
        </h1>
        <p className="text-slate-600 mb-2">Your case has been submitted successfully.</p>
        <p className="text-slate-500 mb-8">
          We will review it and get back to you within 3-5 business days.
        </p>
        <button
          onClick={() => navigate('/client/dashboard')}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Submit a New Case</h1>

      {/* Progress Steps */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, idx) => (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${idx < step ? 'bg-green-500 text-white' : idx === step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {idx < step ? <Check className="w-4 h-4" /> : idx + 1}
              </div>
              <span className={`text-xs mt-1 hidden sm:block ${idx === step ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                {s}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${idx < step ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        {/* Step 1: About Yourself */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold mb-4">Tell Us About Yourself</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                <input type="text" value={formData.full_name} onChange={e => updateField('full_name', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <input type="email" value={formData.email} onChange={e => updateField('email', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input type="tel" value={formData.phone} onChange={e => updateField('phone', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <input type="text" value={formData.address} onChange={e => updateField('address', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">County</label>
                <input type="text" value={formData.county} onChange={e => updateField('county', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                <input type="text" value={formData.state} onChange={e => updateField('state', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Defendants */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold mb-4">Who Is This Case Against?</h2>
            <p className="text-sm text-slate-500 mb-4">Select from known companies or add a new one.</p>
            <div className="flex gap-2">
              <select value={selectedDefendantId} onChange={e => setSelectedDefendantId(e.target.value)} className="flex-1 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                <option value="">Select a company...</option>
                {allDefendants.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.entity_type})</option>
                ))}
              </select>
              <button onClick={addDefendant} disabled={!selectedDefendantId} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">Add</button>
            </div>
            <button onClick={() => setShowCustomForm(!showCustomForm)} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              <Plus className="w-4 h-4" /> My defendant isn't listed
            </button>
            {showCustomForm && (
              <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
                <input type="text" placeholder="Company/Person name" value={customDefendant.name} onChange={e => setCustomDefendant(prev => ({ ...prev, name: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
                <input type="text" placeholder="Address" value={customDefendant.address} onChange={e => setCustomDefendant(prev => ({ ...prev, address: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
                <select value={customDefendant.entity_type} onChange={e => setCustomDefendant(prev => ({ ...prev, entity_type: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2">
                  <option value="CRA">Credit Reporting Agency</option>
                  <option value="Debt Collector">Debt Collector</option>
                  <option value="Furnisher">Furnisher</option>
                  <option value="Bank">Bank</option>
                </select>
                <button onClick={addCustomDefendant} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Add This Defendant</button>
              </div>
            )}
            {formData.defendants.length > 0 && (
              <div className="space-y-2 mt-4">
                <h3 className="text-sm font-medium text-slate-700">Selected Defendants:</h3>
                {formData.defendants.map(d => (
                  <div key={d.id} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <div>
                      <div className="font-medium text-slate-900">{d.name}</div>
                      <div className="text-sm text-slate-500">{d.principal_address || ''} &middot; {d.entity_type}</div>
                    </div>
                    <button onClick={() => removeDefendant(d.id)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: What Happened */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold mb-4">What Happened?</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Describe what happened in your own words *</label>
              <textarea value={formData.description} onChange={e => updateField('description', e.target.value)} rows={6} placeholder="For example: I found errors on my credit report that I didn't recognize. I disputed them with the credit bureau but they didn't fix it..." className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">When did this start?</label>
                <input type="date" value={formData.start_date} onChange={e => updateField('start_date', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">When did you first dispute this?</label>
                <input type="date" value={formData.dispute_date} onChange={e => updateField('dispute_date', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">What harm has this caused you?</label>
              <textarea value={formData.harm_description} onChange={e => updateField('harm_description', e.target.value)} rows={4} placeholder="For example: credit denials, emotional distress, financial harm, stress, anxiety, embarrassment..." className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        )}

        {/* Step 4: Upload Documents */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold mb-4">Upload Your Documents</h2>
            <p className="text-sm text-slate-500">Upload any relevant documents. Accepted: PDF, DOCX, TXT, PNG, JPG (max 10MB each).</p>
            <div className="flex gap-2 mb-3">
              <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                {DOCUMENT_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <label className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all">
              <Upload className="w-8 h-8 text-slate-400 mb-2" />
              <span className="text-sm font-medium text-slate-600">Drag files here or click to browse</span>
              <span className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT, PNG, JPG up to 10MB</span>
              <input type="file" accept={ACCEPTED_TYPES} multiple onChange={handleFileUpload} className="hidden" />
            </label>
            {formData.documents.length > 0 && (
              <div className="space-y-2 mt-4">
                {formData.documents.map((doc, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-slate-400" />
                      <div>
                        <div className="text-sm font-medium text-slate-900">{doc.name}</div>
                        <div className="text-xs text-slate-500">{formatFileSize(doc.size)} &middot; {DOCUMENT_CATEGORIES.find(c => c.value === doc.category)?.label}</div>
                      </div>
                    </div>
                    <button onClick={() => removeDocument(idx)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 5: Review */}
        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold mb-4">Review Your Information</h2>
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Your Information</h3>
              <div className="text-sm text-slate-600 space-y-1">
                <p><span className="font-medium">Name:</span> {formData.full_name}</p>
                <p><span className="font-medium">Email:</span> {formData.email}</p>
                {formData.phone && <p><span className="font-medium">Phone:</span> {formData.phone}</p>}
                {formData.address && <p><span className="font-medium">Address:</span> {formData.address}</p>}
                {formData.county && <p><span className="font-medium">County:</span> {formData.county}, {formData.state}</p>}
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Defendants</h3>
              {formData.defendants.map(d => (
                <p key={d.id} className="text-sm text-slate-600">&bull; {d.name} ({d.entity_type})</p>
              ))}
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Description</h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{formData.description.length > 300 ? formData.description.slice(0, 300) + '...' : formData.description}</p>
            </div>
            {formData.harm_description && (
              <div className="border border-slate-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Harm Described</h3>
                <p className="text-sm text-slate-600">{formData.harm_description}</p>
              </div>
            )}
            <div className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Documents</h3>
              <p className="text-sm text-slate-600">{formData.documents.length} document(s) uploaded</p>
            </div>
            <label className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer">
              <input type="checkbox" checked={formData.confirmed} onChange={e => updateField('confirmed', e.target.checked)} className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-slate-700">I confirm the information above is accurate to the best of my knowledge.</span>
            </label>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-4 border-t border-slate-200">
          {step > 0 ? (
            <button onClick={prevStep} className="flex items-center gap-1 text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-100">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : <div />}
          {step < STEPS.length - 1 ? (
            <button onClick={nextStep} className="flex items-center gap-1 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting || !formData.confirmed} className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Submitting...</>) : (<><Check className="w-4 h-4" /> Submit Case</>)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
