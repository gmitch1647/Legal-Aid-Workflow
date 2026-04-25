import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Edit3, Copy, ExternalLink, Save, X,
  Loader2, FileText, GripVertical, Check, Eye, EyeOff,
  AlertCircle,
} from 'lucide-react';
import { request } from '../../lib/api';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'select', label: 'Dropdown' },
  { value: 'file', label: 'File Upload' },
];

async function getForms() { return request('/intake/forms'); }
async function createForm(data) { return request('/intake/forms', { method: 'POST', body: JSON.stringify(data) }); }
async function updateForm(id, data) { return request(`/intake/forms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
async function deleteForm(id) { return request(`/intake/forms/${id}`, { method: 'DELETE' }); }

export default function Forms() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingForm, setEditingForm] = useState(null);
  const [error, setError] = useState(null);

  const loadForms = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getForms();
      setForms(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadForms(); }, [loadForms]);

  async function handleCreate() {
    try {
      const newForm = await createForm({
        name: 'New Intake Form',
        slug: `form-${Date.now()}`,
        fields: [
          { id: 'first_name', label: 'First Name', type: 'text', required: true },
          { id: 'last_name', label: 'Last Name', type: 'text', required: true },
          { id: 'email', label: 'Email', type: 'email', required: true },
          { id: 'phone', label: 'Phone', type: 'tel', required: true },
        ],
      });
      setEditingForm(newForm);
      await loadForms();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete form "${name}"? This cannot be undone.`)) return;
    try {
      await deleteForm(id);
      await loadForms();
    } catch (err) {
      setError(err.message);
    }
  }

  function copyLink(slug) {
    const url = `${window.location.origin}/intake/${slug}`;
    navigator.clipboard.writeText(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (editingForm) {
    return <FormEditor form={editingForm} onSave={async (data) => {
      await updateForm(editingForm.id, data);
      setEditingForm(null);
      await loadForms();
    }} onCancel={() => setEditingForm(null)} />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Intake Forms</h1>
          <p className="text-sm text-slate-500 mt-1">Create and manage client intake forms</p>
        </div>
        <button onClick={handleCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition">
          <Plus className="h-4 w-4" /> New Form
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {forms.map(form => (
          <div key={form.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-900">{form.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{form.description || 'No description'}</p>
              </div>
              <div className="flex items-center gap-1">
                {form.is_active ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">Active</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-500">Inactive</span>
                )}
                {form.is_default && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-700">Default</span>
                )}
              </div>
            </div>

            <div className="text-xs text-slate-500 mb-4">
              {(form.fields || []).length} fields · /intake/{form.slug}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setEditingForm(form)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition">
                <Edit3 className="h-3.5 w-3.5" /> Edit
              </button>
              <button onClick={() => copyLink(form.slug)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                title="Copy form link">
                <Copy className="h-3.5 w-3.5" />
              </button>
              <a href={`/intake/${form.slug}`} target="_blank" rel="noopener"
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                title="Preview form">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {!form.is_default && (
                <button onClick={() => handleDelete(form.id, form.name)}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-400 hover:text-red-500 hover:border-red-200 transition">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form Editor
// ---------------------------------------------------------------------------

function FormEditor({ form, onSave, onCancel }) {
  const [name, setName] = useState(form.name || '');
  const [slug, setSlug] = useState(form.slug || '');
  const [description, setDescription] = useState(form.description || '');
  const [fields, setFields] = useState(form.fields || []);
  const [isActive, setIsActive] = useState(form.is_active !== false);
  const [saving, setSaving] = useState(false);

  function addField() {
    setFields(prev => [...prev, {
      id: `field_${Date.now()}`,
      label: 'New Field',
      type: 'text',
      required: false,
      options: [],
    }]);
  }

  function updateField(idx, key, value) {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, [key]: value } : f));
  }

  function removeField(idx) {
    setFields(prev => prev.filter((_, i) => i !== idx));
  }

  function moveField(idx, direction) {
    const newFields = [...fields];
    const target = idx + direction;
    if (target < 0 || target >= newFields.length) return;
    [newFields[idx], newFields[target]] = [newFields[target], newFields[idx]];
    setFields(newFields);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ name, slug, description, fields, is_active: isActive });
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Edit Form</h1>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Form
          </button>
        </div>
      </div>

      {/* Form Settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Form Settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Form Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">URL Slug</label>
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-400">/intake/</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this form for?"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span className="text-sm text-slate-700">Form is active (accepting submissions)</span>
        </label>
      </div>

      {/* Fields */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Fields ({fields.length})</h2>
          <button onClick={addField}
            className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700">
            <Plus className="h-4 w-4" /> Add Field
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((field, idx) => (
            <div key={field.id || idx} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 bg-slate-50/50">
              <div className="flex flex-col gap-0.5 pt-2">
                <button onClick={() => moveField(idx, -1)} disabled={idx === 0}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                  <GripVertical className="w-3.5 h-3.5 -rotate-90" />
                </button>
                <button onClick={() => moveField(idx, 1)} disabled={idx === fields.length - 1}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                  <GripVertical className="w-3.5 h-3.5 rotate-90" />
                </button>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input value={field.label} onChange={(e) => updateField(idx, 'label', e.target.value)}
                  placeholder="Field label"
                  className="sm:col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <select value={field.type} onChange={(e) => updateField(idx, 'type', e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={field.required || false}
                      onChange={(e) => updateField(idx, 'required', e.target.checked)} />
                    Required
                  </label>
                </div>
              </div>
              {field.type === 'select' && (
                <div className="flex-1">
                  <input value={(field.options || []).join(', ')}
                    onChange={(e) => updateField(idx, 'options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    placeholder="Options (comma separated)"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
                </div>
              )}
              <button onClick={() => removeField(idx)} className="p-1 text-slate-400 hover:text-red-500 mt-1">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Form Link */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-2">Share Link</h2>
        <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-3">
          <code className="text-sm text-slate-700 flex-1 truncate">{window.location.origin}/intake/{slug}</code>
          <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/intake/${slug}`)}
            className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-700">
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}
