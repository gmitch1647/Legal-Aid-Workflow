import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  User,
  Users,
  Building2,
  Bell,
  Database,
  Save,
  Search,
  Plus,
  Edit3,
  Trash2,
  Upload,
  Image,
  Loader2,
  AlertCircle,
  Check,
  X,
  ChevronRight,
  BookOpen,
  RefreshCw,
  FileText,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../App';
import {
  getDefendants,
  createDefendant,
  updateDefendant,
  deleteDefendant,
  reindexReferenceCases,
  getReindexStatus,
  getPipelineStages,
  createPipelineStage,
  updatePipelineStage,
  deletePipelineStage,
  reorderPipelineStages,
  getAttorneyMemories,
  addAttorneyMemory,
  deleteAttorneyMemory,
  getMemoryStats,
  seedViolationPatterns,
  inviteStaffAttorney,
  getStaffAttorneys,
  getReferralPartners,
  createReferralPartner,
  deleteReferralPartner,
  getViolationPatterns,
  getCaseLaw,
  getCaseLawEntry,
  uploadCaseLaw,
  bulkUploadCaseLaw,
  reprocessAllCaseLaw,
  deleteCaseLaw,
} from '../../lib/api';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'profile', label: 'Attorney Profile', icon: User },
  { key: 'team', label: 'Attorney Team', icon: Users },
  { key: 'memory', label: 'AI Memory', icon: Sparkles },
  { key: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
  { key: 'pipeline', label: 'Pipeline Stages', icon: RefreshCw },
  { key: 'defendants', label: 'Defendant Database', icon: Database },
  { key: 'reference_cases', label: 'Reference Cases', icon: BookOpen },
  { key: 'referrals', label: 'Referral Partners', icon: Users },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'branding', label: 'Branding', icon: Building2 },
];

// ---------------------------------------------------------------------------
// Attorney Profile Tab
// ---------------------------------------------------------------------------

function ProfileTab() {
  const { profile } = useAuth();

  const [form, setForm] = useState({
    full_name: '',
    bar_number: '',
    firm_name: '',
    address: '',
    phone: '',
    email: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        bar_number: profile.bar_number || '',
        firm_name: profile.firm_name || '',
        address: profile.address || '',
        phone: profile.phone || '',
        email: profile.email || '',
      });
    }
  }, [profile]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setSaved(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          full_name: form.full_name,
          bar_number: form.bar_number,
          firm_name: form.firm_name,
          address: form.address,
          phone: form.phone,
        })
        .eq('id', profile.id);

      if (updateErr) throw updateErr;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label className="label">Full Name</label>
          <input
            type="text"
            value={form.full_name}
            onChange={handleChange('full_name')}
            className="input"
          />
        </div>
        <div>
          <label className="label">Bar Number</label>
          <input
            type="text"
            value={form.bar_number}
            onChange={handleChange('bar_number')}
            placeholder="e.g., CA-123456"
            className="input"
          />
        </div>
        <div>
          <label className="label">Firm Name</label>
          <input
            type="text"
            value={form.firm_name}
            onChange={handleChange('firm_name')}
            className="input"
          />
        </div>
        <div>
          <label className="label">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={handleChange('phone')}
            className="input"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Address</label>
          <input
            type="text"
            value={form.address}
            onChange={handleChange('address')}
            placeholder="123 Law Street, Suite 100, City, State ZIP"
            className="input"
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            value={form.email}
            disabled
            className="input !bg-slate-50 !text-slate-500"
          />
          <p className="mt-1 text-xs text-slate-400">Email cannot be changed here. Contact support.</p>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-slate-200 pt-6">
        <button type="submit" disabled={saving} className="btn-primary gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
        {saved && <span className="text-sm text-green-600">Profile updated successfully.</span>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Defendant Database Tab
// ---------------------------------------------------------------------------

function DefendantForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    address: initial?.address || '',
    registered_agent: initial?.registered_agent || '',
    entity_type: initial?.entity_type || '',
  });

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={handleChange('name')}
            placeholder="e.g., Equifax Inc."
            className="input"
            required
          />
        </div>
        <div>
          <label className="label">Entity Type</label>
          <select value={form.entity_type} onChange={handleChange('entity_type')} className="input">
            <option value="">Select type...</option>
            <option value="corporation">Corporation</option>
            <option value="llc">LLC</option>
            <option value="partnership">Partnership</option>
            <option value="sole_proprietor">Sole Proprietor</option>
            <option value="government">Government Entity</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Address</label>
          <input
            type="text"
            value={form.address}
            onChange={handleChange('address')}
            placeholder="1550 Peachtree St NE, Atlanta, GA 30309"
            className="input"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Registered Agent</label>
          <input
            type="text"
            value={form.registered_agent}
            onChange={handleChange('registered_agent')}
            placeholder="CT Corporation System"
            className="input"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={loading}>
          Cancel
        </button>
        <button type="submit" className="btn-primary gap-2" disabled={loading || !form.name.trim()}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial ? 'Update Defendant' : 'Add Defendant'}
        </button>
      </div>
    </form>
  );
}

function DefendantsTab() {
  const [defendants, setDefendants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchDefendants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDefendants();
      const list = Array.isArray(data) ? data : data?.defendants ?? data?.items ?? [];
      setDefendants(list);
    } catch (err) {
      setError(err.message || 'Failed to load defendants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDefendants();
  }, [fetchDefendants]);

  const filtered = useMemo(() => {
    if (!search) return defendants;
    const q = search.toLowerCase();
    return defendants.filter(
      (d) =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.address || '').toLowerCase().includes(q) ||
        (d.entity_type || '').toLowerCase().includes(q)
    );
  }, [defendants, search]);

  const handleCreate = async (form) => {
    try {
      setActionLoading(true);
      await createDefendant(form);
      setShowForm(false);
      await fetchDefendants();
    } catch (err) {
      setError(err.message || 'Failed to create defendant');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async (form) => {
    try {
      setActionLoading(true);
      await updateDefendant(editingId, form);
      setEditingId(null);
      await fetchDefendants();
    } catch (err) {
      setError(err.message || 'Failed to update defendant');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      setActionLoading(true);
      await deleteDefendant(id);
      setDeleteConfirm(null);
      await fetchDefendants();
    } catch (err) {
      setError(err.message || 'Failed to delete defendant');
    } finally {
      setActionLoading(false);
    }
  };

  const ENTITY_LABELS = {
    corporation: 'Corporation',
    llc: 'LLC',
    partnership: 'Partnership',
    sole_proprietor: 'Sole Proprietor',
    government: 'Government',
    other: 'Other',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search defendants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input !pl-9"
          />
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
          }}
          className="btn-primary gap-2"
        >
          <Plus className="h-4 w-4" />
          Add New Defendant
        </button>
      </div>

      {showForm && (
        <DefendantForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          loading={actionLoading}
        />
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Address
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Registered Agent
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Type
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center">
                  <Database className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-500">
                    {search ? 'No defendants match your search.' : 'No defendants in database.'}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((d) => (
                <React.Fragment key={d.id}>
                  {editingId === d.id ? (
                    <tr>
                      <td colSpan={5} className="p-4">
                        <DefendantForm
                          initial={d}
                          onSubmit={handleUpdate}
                          onCancel={() => setEditingId(null)}
                          loading={actionLoading}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-900">{d.name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-xs truncate text-sm text-slate-600">
                          {d.address || '-'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-600">{d.registered_agent || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge bg-slate-100 text-slate-600">
                          {ENTITY_LABELS[d.entity_type] || d.entity_type || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingId(d.id)}
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                            title="Edit"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(d.id)}
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Delete Defendant</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete this defendant? This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary" disabled={actionLoading}>
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={actionLoading}
                className="btn-danger gap-2"
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications Tab
// ---------------------------------------------------------------------------

function NotificationsTab() {
  const { profile } = useAuth();

  const [prefs, setPrefs] = useState({
    new_submission: true,
    draft_ready: true,
    revision_complete: true,
    case_filed: true,
    client_message: true,
    pipeline_error: true,
    weekly_summary: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (profile?.notification_preferences) {
      setPrefs((prev) => ({ ...prev, ...profile.notification_preferences }));
    }
  }, [profile]);

  const handleToggle = (key) => () => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ notification_preferences: prefs })
        .eq('id', profile.id);

      if (updateErr) throw updateErr;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const NOTIFICATION_OPTIONS = [
    { key: 'new_submission', label: 'New Case Submission', description: 'When a new case is submitted by a client' },
    { key: 'draft_ready', label: 'Draft Ready for Review', description: 'When the AI pipeline completes a complaint draft' },
    { key: 'revision_complete', label: 'Revision Complete', description: 'When a requested revision is completed' },
    { key: 'case_filed', label: 'Case Filed', description: 'Confirmation when a case is officially filed' },
    { key: 'client_message', label: 'Client Message', description: 'When a client sends a new message' },
    { key: 'pipeline_error', label: 'Pipeline Error', description: 'When the AI pipeline encounters an error' },
    { key: 'weekly_summary', label: 'Weekly Summary', description: 'Weekly digest of all case activity' },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-900">Email Notifications</h3>
        <p className="mt-1 text-sm text-slate-500">Choose which events trigger email notifications.</p>
      </div>

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {NOTIFICATION_OPTIONS.map((opt) => (
          <label
            key={opt.key}
            className="flex cursor-pointer items-center justify-between px-4 py-4 transition-colors hover:bg-slate-50"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">{opt.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{opt.description}</p>
            </div>
            <div className="relative ml-4 shrink-0">
              <input
                type="checkbox"
                checked={prefs[opt.key]}
                onChange={handleToggle(opt.key)}
                className="sr-only"
              />
              <div
                className={`h-6 w-11 rounded-full transition-colors ${
                  prefs[opt.key] ? 'bg-primary-600' : 'bg-slate-200'
                }`}
              >
                <div
                  className={`h-5 w-5 translate-y-0.5 rounded-full bg-white shadow-sm transition-transform ${
                    prefs[opt.key] ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-slate-200 pt-6">
        <button onClick={handleSave} disabled={saving} className="btn-primary gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Preferences'}
        </button>
        {saved && <span className="text-sm text-green-600">Preferences updated.</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Branding Tab
// ---------------------------------------------------------------------------

function BrandingTab() {
  const { profile } = useAuth();

  const [firmName, setFirmName] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (profile) {
      setFirmName(profile.firm_name || '');
      setLogoUrl(profile.logo_url || null);
    }
  }, [profile]);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be less than 2MB.');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const fileExt = file.name.split('.').pop();
      const filePath = `logos/${profile.id}/logo.${fileExt}`;

      const { error: uploadErr } = await supabase.storage
        .from('branding')
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from('branding')
        .getPublicUrl(filePath);

      setLogoUrl(urlData.publicUrl);
    } catch (err) {
      setError(err.message || 'Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          firm_name: firmName,
          logo_url: logoUrl,
        })
        .eq('id', profile.id);

      if (updateErr) throw updateErr;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save branding');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="label">Firm Name</label>
        <input
          type="text"
          value={firmName}
          onChange={(e) => {
            setFirmName(e.target.value);
            setSaved(false);
          }}
          placeholder="Your Law Firm, PLLC"
          className="input max-w-lg"
        />
      </div>

      <div>
        <label className="label">Firm Logo</label>
        <p className="mb-3 text-xs text-slate-500">
          Upload a logo to appear on generated documents. Max 2MB, PNG or JPG.
        </p>
        <div className="flex items-start gap-6">
          <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-slate-50">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Firm Logo"
                className="h-full w-full object-contain p-2"
              />
            ) : (
              <div className="text-center">
                <Image className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-1 text-[10px] text-slate-400">No logo</p>
              </div>
            )}
          </div>
          <div className="space-y-3">
            <label className="btn-secondary inline-flex cursor-pointer gap-2">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? 'Uploading...' : 'Upload Logo'}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
            {logoUrl && (
              <button
                onClick={() => {
                  setLogoUrl(null);
                  setSaved(false);
                }}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:underline"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove Logo
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-slate-200 pt-6">
        <button onClick={handleSave} disabled={saving} className="btn-primary gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Branding'}
        </button>
        {saved && <span className="text-sm text-green-600">Branding updated.</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Stages Tab — manage Kanban columns
// ---------------------------------------------------------------------------

const STAGE_COLORS = [
  'blue', 'indigo', 'cyan', 'amber', 'purple', 'green', 'emerald', 'slate',
  'red', 'orange', 'teal', 'pink', 'violet', 'lime', 'sky',
];

function PipelineStagesTab() {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('slate');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editNotifyEmail, setEditNotifyEmail] = useState(false);
  const [editNotifySms, setEditNotifySms] = useState(false);
  const [editNotifyTemplate, setEditNotifyTemplate] = useState('');

  const loadStages = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getPipelineStages();
      setStages(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStages(); }, [loadStages]);

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await createPipelineStage({ name: newName, color: newColor, description: newDesc });
      setNewName('');
      setNewColor('slate');
      setNewDesc('');
      setShowAdd(false);
      await loadStages();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this pipeline stage?')) return;
    try {
      await deletePipelineStage(id);
      await loadStages();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveEdit(id) {
    try {
      await updatePipelineStage(id, {
        name: editName,
        color: editColor,
        notify_on_enter: editNotifyEmail || editNotifySms,
        notify_email: editNotifyEmail,
        notify_sms: editNotifySms,
        notification_template: editNotifyTemplate,
      });
      setEditingId(null);
      await loadStages();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleMoveUp(index) {
    if (index === 0) return;
    const newOrder = [...stages];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setStages(newOrder);
    try {
      await reorderPipelineStages(newOrder.map((s) => s.id));
    } catch (err) {
      setError(err.message);
      await loadStages();
    }
  }

  async function handleMoveDown(index) {
    if (index === stages.length - 1) return;
    const newOrder = [...stages];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setStages(newOrder);
    try {
      await reorderPipelineStages(newOrder.map((s) => s.id));
    } catch (err) {
      setError(err.message);
      await loadStages();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Customize your case pipeline columns. Drag stages up/down to reorder.
        System stages (needed for the agent pipeline) cannot be deleted.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Stages list */}
      <div className="space-y-2">
        {stages.map((stage, i) => (
          <div
            key={stage.id}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
          >
            {/* Position arrows */}
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => handleMoveUp(i)}
                disabled={i === 0}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4 -rotate-90" />
              </button>
              <button
                onClick={() => handleMoveDown(i)}
                disabled={i === stages.length - 1}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4 rotate-90" />
              </button>
            </div>

            {/* Color dot */}
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ background: `var(--color-${stage.color}-500, #64748b)` }}
            />

            {/* Name + slug */}
            {editingId === stage.id ? (
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                    autoFocus
                  />
                  <select
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                  >
                    {STAGE_COLORS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button onClick={() => handleSaveEdit(stage.id)} className="text-emerald-600 hover:text-emerald-700">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {/* Notification settings */}
                <div className="bg-slate-50 rounded-lg p-2.5 space-y-2">
                  <div className="text-[10px] font-semibold uppercase text-slate-500">Notify client when case enters this stage</div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={editNotifyEmail} onChange={(e) => setEditNotifyEmail(e.target.checked)} />
                      Email
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={editNotifySms} onChange={(e) => setEditNotifySms(e.target.checked)} />
                      SMS
                    </label>
                  </div>
                  {(editNotifyEmail || editNotifySms) && (
                    <textarea
                      value={editNotifyTemplate}
                      onChange={(e) => setEditNotifyTemplate(e.target.value)}
                      rows={2}
                      placeholder="Message template (use {client_name}, {case_status}, {stage_name})..."
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                  {stage.name}
                  {(stage.notify_email || stage.notify_sms) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold uppercase">
                      {[stage.notify_email && 'email', stage.notify_sms && 'sms'].filter(Boolean).join(' + ')}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">{stage.slug}{stage.description ? ` — ${stage.description}` : ''}</div>
              </div>
            )}

            {/* Actions */}
            {editingId !== stage.id && (
              <div className="flex items-center gap-1">
                {stage.is_system && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">system</span>
                )}
                <button
                  onClick={() => {
                    setEditingId(stage.id);
                    setEditName(stage.name);
                    setEditColor(stage.color);
                    setEditNotifyEmail(stage.notify_email || false);
                    setEditNotifySms(stage.notify_sms || false);
                    setEditNotifyTemplate(stage.notification_template || '');
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                {!stage.is_system && (
                  <button
                    onClick={() => handleDelete(stage.id)}
                    className="p-1 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new stage */}
      {showAdd ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <div className="text-sm font-semibold text-emerald-900">Add New Stage</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Stage name (e.g. Negotiation)"
              className="col-span-2 rounded border border-slate-300 px-3 py-2 text-sm"
              autoFocus
            />
            <select
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {STAGE_COLORS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !newName.trim()}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? 'Adding...' : 'Add Stage'}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          <Plus className="w-4 h-4" /> Add Stage
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reference Cases Tab — RAG index management
// ---------------------------------------------------------------------------

function ReferenceCasesTab() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getReindexStatus();
      setStatus(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load index status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleReindex = async (force) => {
    if (reindexing) return;
    if (
      force &&
      !window.confirm(
        'Force rebuild will wipe the entire index and re-embed every reference case file. This may take several minutes and will use Voyage API credits. Continue?'
      )
    ) {
      return;
    }

    try {
      setReindexing(true);
      setError(null);
      setLastResult(null);
      const result = await reindexReferenceCases(force);
      setLastResult(result);
      await loadStatus();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Reindex failed');
    } finally {
      setReindexing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const voyageOk = status?.voyage_configured;
  const filesOnDisk = status?.files_on_disk || [];
  const filesIndexed = status?.files_indexed || [];
  const missing = status?.missing_from_index || [];
  const totalChunks = status?.total_chunks || 0;

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-purple-500" />
          <div>
            <div className="text-sm font-semibold text-slate-900">
              RAG Reference Library
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              The Complaint Drafter uses semantic retrieval to pull only the most
              relevant excerpts from your reference case library into each draft.
              Upload <code className="rounded bg-slate-200 px-1">.docx</code> files
              to{' '}
              <code className="rounded bg-slate-200 px-1">
                backend/reference_cases/
              </code>{' '}
              via GitHub, then reindex here.
            </p>
          </div>
        </div>
      </div>

      {/* Voyage config warning */}
      {!voyageOk && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1 text-sm">
              <div className="font-semibold text-amber-900">
                Voyage API key not configured
              </div>
              <p className="mt-1 text-amber-800">
                RAG is disabled. The drafter will fall back to loading the first
                few reference files alphabetically. To enable semantic retrieval:
              </p>
              <ol className="mt-2 ml-4 list-decimal space-y-1 text-amber-800">
                <li>
                  Sign up at{' '}
                  <a
                    href="https://www.voyageai.com"
                    target="_blank"
                    rel="noopener"
                    className="underline"
                  >
                    voyageai.com
                  </a>{' '}
                  (free tier includes 200M tokens)
                </li>
                <li>Create an API key</li>
                <li>
                  Add <code className="rounded bg-amber-100 px-1">VOYAGE_API_KEY</code>{' '}
                  to your Railway service Variables
                </li>
                <li>Wait for Railway to redeploy, then reload this page</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Files on disk" value={filesOnDisk.length} icon={FileText} />
        <StatCard
          label="Files indexed"
          value={filesIndexed.length}
          icon={Check}
          tone={filesIndexed.length === filesOnDisk.length ? 'success' : 'warning'}
        />
        <StatCard label="Total chunks" value={totalChunks} icon={Database} />
      </div>

      {/* Missing files */}
      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-900">
            {missing.length} file{missing.length !== 1 ? 's' : ''} not yet indexed
          </div>
          <ul className="mt-2 space-y-0.5 text-xs text-amber-800">
            {missing.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700">
            Click "Reindex" below to process these files.
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => handleReindex(false)}
          disabled={reindexing || !voyageOk}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {reindexing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Reindexing...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" /> Reindex (incremental)
            </>
          )}
        </button>
        <button
          onClick={() => handleReindex(true)}
          disabled={reindexing || !voyageOk}
          className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" /> Force Rebuild
        </button>
        <button
          onClick={loadStatus}
          disabled={loading || reindexing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" /> Refresh Status
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div className="text-sm text-red-800">
              <div className="font-semibold">Error</div>
              <div className="mt-1">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Result */}
      {lastResult && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="flex-1 text-sm text-emerald-900">
              <div className="font-semibold">Reindex complete</div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-emerald-700">Scanned</dt>
                  <dd className="font-semibold">{lastResult.files_scanned ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-emerald-700">Indexed</dt>
                  <dd className="font-semibold">{lastResult.files_indexed ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-emerald-700">Skipped (unchanged)</dt>
                  <dd className="font-semibold">{lastResult.files_skipped ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-emerald-700">New chunks</dt>
                  <dd className="font-semibold">{lastResult.chunks_indexed ?? 0}</dd>
                </div>
              </dl>
              {lastResult.errors?.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-red-700">
                    Errors ({lastResult.errors.length}):
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs text-red-700">
                    {lastResult.errors.map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Indexed files list */}
      {filesIndexed.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-700">
            Indexed files ({filesIndexed.length})
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {filesIndexed.map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700"
                >
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Knowledge Base Tab (Violation Patterns + Case Law)
// ---------------------------------------------------------------------------

function KnowledgeBaseTab() {
  const [subTab, setSubTab] = useState('violations');
  const [violations, setViolations] = useState([]);
  const [caseLawEntries, setCaseLawEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [filterStatute, setFilterStatute] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Categories
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  const DEFAULT_CATEGORIES = [
    'Case Opinions', 'Statutes & Regulations', 'CFPB Guidance',
    'FTC Advisory', 'Demand Letters', 'Settlement Agreements',
    'Briefs & Motions', 'Reference Guides', 'Articles & Commentary',
    'Discovery Templates', 'Client Intake Docs',
  ];

  useEffect(() => {
    loadData();
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      const saved = localStorage.getItem('kb_categories');
      if (saved) {
        setCategories(JSON.parse(saved));
      } else {
        setCategories(DEFAULT_CATEGORIES);
        localStorage.setItem('kb_categories', JSON.stringify(DEFAULT_CATEGORIES));
      }
    } catch { setCategories(DEFAULT_CATEGORIES); }
  }

  function addCategory() {
    if (!newCategory.trim()) return;
    const updated = [...categories, newCategory.trim()];
    setCategories(updated);
    localStorage.setItem('kb_categories', JSON.stringify(updated));
    setNewCategory('');
  }

  function removeCategory(cat) {
    const updated = categories.filter(c => c !== cat);
    setCategories(updated);
    localStorage.setItem('kb_categories', JSON.stringify(updated));
  }

  async function loadData() {
    setLoading(true);
    try {
      const [vp, cl] = await Promise.all([
        getViolationPatterns(),
        getCaseLaw(),
      ]);
      setViolations(vp || []);
      setCaseLawEntries(cl || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleSeed() {
    setSeeding(true);
    setSeedResult(null);
    try {
      const result = await seedViolationPatterns();
      setSeedResult(result);
      loadData();
    } catch (err) {
      setSeedResult({ status: 'error', error: err.message });
    } finally {
      setSeeding(false);
    }
  }

  async function handleUploadCaseLaw(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      if (files.length === 1) {
        await uploadCaseLaw(files[0], {});
      } else {
        await bulkUploadCaseLaw(files);
      }
      // Reload after a short delay to let background processing start
      setTimeout(() => loadData(), 2000);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDeleteCaseLaw(id) {
    if (!confirm('Delete this case law entry?')) return;
    try {
      await deleteCaseLaw(id);
      setCaseLawEntries(prev => prev.filter(c => c.id !== id));
    } catch (err) { console.error(err); }
  }

  const filteredViolations = violations.filter(v => {
    if (filterStatute && v.statute !== filterStatute) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (v.short_name || '').toLowerCase().includes(term)
        || (v.section || '').toLowerCase().includes(term)
        || (v.description || '').toLowerCase().includes(term);
    }
    return true;
  });

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Knowledge Base</h2>
        <p className="text-sm text-slate-500 mt-1">
          Violation patterns and case law that power the AI's legal knowledge.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button onClick={() => setSubTab('violations')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${subTab === 'violations' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          Violation Patterns ({violations.length})
        </button>
        <button onClick={() => setSubTab('caselaw')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${subTab === 'caselaw' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          Case Law ({caseLawEntries.length})
        </button>
      </div>

      {/* ═══ Violations Sub-tab ═══ */}
      {subTab === 'violations' && (
        <div className="space-y-4">
          {/* Seed button */}
          {violations.length === 0 ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
              <Database className="w-10 h-10 text-blue-400 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-900 mb-1">Seed Violation Patterns</h3>
              <p className="text-sm text-slate-600 mb-4">
                Load pre-built FCRA, FDCPA, TCPA, and Georgia FBPA violation patterns with elements, damages, defenses, and case citations.
              </p>
              <button onClick={handleSeed} disabled={seeding}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {seeding ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Seeding...</> : 'Seed Database Now'}
              </button>
              {seedResult && (
                <div className={`mt-3 text-sm ${seedResult.status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                  {seedResult.status === 'seeded' ? `Done! ${seedResult.count} patterns loaded.` :
                   seedResult.status === 'already_seeded' ? `Already seeded (${seedResult.count} patterns).` :
                   `Error: ${seedResult.error}`}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Filter + Search */}
              <div className="flex items-center gap-3">
                <select value={filterStatute} onChange={(e) => setFilterStatute(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">All Statutes</option>
                  <option value="FCRA">FCRA</option>
                  <option value="FDCPA">FDCPA</option>
                  <option value="TCPA">TCPA</option>
                  <option value="GA_FBPA">Georgia FBPA</option>
                </select>
                <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search violations..."
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <button onClick={handleSeed} disabled={seeding}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">
                  {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Violations list */}
              <div className="space-y-2">
                {filteredViolations.map(v => (
                  <ViolationCard key={v.id} violation={v} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ Case Law Sub-tab ═══ */}
      {subTab === 'caselaw' && (
        <div className="space-y-4">
          {/* Upload */}
          <div className="flex items-center gap-3">
            <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition">
              <input type="file" accept=".pdf,.docx,.txt" multiple onChange={handleUploadCaseLaw} className="hidden" />
              {uploading ? (
                <span className="text-sm text-blue-600"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Uploading & indexing...</span>
              ) : (
                <span className="text-sm text-slate-600"><Upload className="w-4 h-4 inline mr-1" /> Upload files — select multiple (.pdf, .docx, .txt)</span>
              )}
            </label>
            <button onClick={async () => { try { const r = await reprocessAllCaseLaw(); alert(`Reprocessing ${r.count} entries`); setTimeout(() => loadData(), 3000); } catch(e) { alert('Failed: ' + e.message); } }}
              className="shrink-0 px-3 py-3 border border-slate-200 rounded-xl text-xs text-slate-600 hover:bg-slate-50" title="Reprocess stuck entries">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={() => setShowCategoryManager(!showCategoryManager)}
              className="shrink-0 px-3 py-3 border border-slate-200 rounded-xl text-xs text-slate-600 hover:bg-slate-50" title="Manage categories">
              <Edit3 className="w-4 h-4" />
            </button>
          </div>

          {/* Category Manager */}
          {showCategoryManager && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900">Manage Categories</h4>
                <button onClick={() => setShowCategoryManager(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {categories.map(cat => (
                  <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 rounded-full text-xs text-slate-700">
                    {cat}
                    <button onClick={() => removeCategory(cat)} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }}
                  placeholder="New category name..."
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                <button onClick={addCategory} disabled={!newCategory.trim()}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Category filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setFilterCategory('')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${!filterCategory ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              All ({caseLawEntries.length})
            </button>
            {categories.map(cat => {
              const count = caseLawEntries.filter(c => (c.tags || []).includes(cat)).length;
              return (
                <button key={cat} onClick={() => setFilterCategory(cat)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${filterCategory === cat ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {cat} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-slate-500">
            Upload legal documents and the AI will automatically categorize, summarize, and index them. Assign categories to organize your knowledge base.
          </p>

          {caseLawEntries.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-xl border border-slate-200">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No documents indexed yet. Upload files to build your AI's legal library.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {caseLawEntries
                .filter(c => !filterCategory || (c.tags || []).includes(filterCategory))
                .map(c => (
                <CaseLawCard key={c.id} entry={c} onDelete={() => handleDeleteCaseLaw(c.id)} categories={categories} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CaseLawCard({ entry: c, onDelete, categories }) {
  const [expanded, setExpanded] = useState(false);
  const [fullText, setFullText] = useState(null);
  const [loadingFull, setLoadingFull] = useState(false);

  async function loadFullText() {
    if (fullText !== null) { setExpanded(!expanded); return; }
    setExpanded(true);
    setLoadingFull(true);
    try {
      const data = await getCaseLawEntry(c.id);
      setFullText(data.full_text || data.summary || 'No content available.');
    } catch (err) {
      setFullText('Failed to load content.');
    } finally {
      setLoadingFull(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="p-3 flex items-start gap-3 cursor-pointer hover:bg-slate-50 transition" onClick={loadFullText}>
        <ChevronRight className={`w-4 h-4 text-slate-400 mt-0.5 shrink-0 transition ${expanded ? 'rotate-90' : ''}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900">{c.case_name}</div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
            {c.citation && <span>{c.citation}</span>}
            {c.court && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-medium">{c.court}</span>}
            {c.year && <span>{c.year}</span>}
            {(c.statutes || []).map(s => (
              <span key={s} className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-medium">{s}</span>
            ))}
            {(c.tags || []).filter(t => categories.includes(t)).map(t => (
              <span key={t} className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-medium">{t}</span>
            ))}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${c.indexed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {c.indexed ? 'Indexed' : 'Processing'}
            </span>
          </div>
          {c.holding && <p className="text-xs text-slate-600 mt-1 line-clamp-2">{c.holding}</p>}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 p-4 bg-slate-50">
          {loadingFull ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading full text...</div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              {c.summary && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-[10px] font-bold uppercase text-blue-600 mb-1">Summary</div>
                  <p className="text-xs text-slate-800">{c.summary}</p>
                </div>
              )}
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{fullText}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ViolationCard({ violation: v }) {
  const [expanded, setExpanded] = useState(false);

  const statuteColors = {
    FCRA: 'bg-blue-100 text-blue-700',
    FDCPA: 'bg-purple-100 text-purple-700',
    TCPA: 'bg-emerald-100 text-emerald-700',
    GA_FBPA: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(!expanded)}>
        <ChevronRight className={`w-4 h-4 text-slate-400 transition ${expanded ? 'rotate-90' : ''}`} />
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statuteColors[v.statute] || 'bg-slate-100 text-slate-700'}`}>
          {v.statute}
        </span>
        <span className="text-xs font-mono text-slate-500">§{v.section}</span>
        <span className="text-sm font-medium text-slate-900 flex-1 truncate">{v.short_name}</span>
        <span className="text-[10px] text-slate-400">{v.defendant_type}</span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
          <p className="text-xs text-slate-700">{v.description}</p>

          {v.elements && v.elements.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Elements to Prove</div>
              <ol className="list-decimal list-inside text-xs text-slate-700 space-y-0.5">
                {v.elements.map((e, i) => <li key={i}>{e}</li>)}
              </ol>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Statutory Damages</div>
              <div className="text-slate-700">{v.damages_statutory || 'N/A'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">SOL</div>
              <div className="text-slate-700">{v.sol_years ? `${v.sol_years} years` : 'N/A'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Scienter</div>
              <div className="text-slate-700 capitalize">{v.scienter || 'N/A'}</div>
            </div>
          </div>

          {v.practice_tips && v.practice_tips.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase text-emerald-600 mb-1">Practice Tips</div>
              <ul className="text-xs text-slate-700 space-y-0.5">
                {v.practice_tips.map((t, i) => <li key={i} className="flex gap-1.5"><span className="text-emerald-500">→</span> {t}</li>)}
              </ul>
            </div>
          )}

          {v.defenses && v.defenses.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase text-red-500 mb-1">Common Defenses</div>
              <ul className="text-xs text-slate-700 space-y-0.5">
                {v.defenses.map((d, i) => <li key={i} className="flex gap-1.5"><span className="text-red-400">⚠</span> {d}</li>)}
              </ul>
            </div>
          )}

          {v.case_citations && v.case_citations.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Case Citations</div>
              {v.case_citations.map((c, i) => (
                <div key={i} className="text-xs text-slate-700 bg-slate-50 rounded p-2 mb-1">
                  <div className="font-medium">{c.case} — {c.cite}</div>
                  <div className="text-slate-500 mt-0.5">{c.holding}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Memory Tab
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Referral Partners Tab
// ---------------------------------------------------------------------------

function ReferralsTab() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ full_name: '', company: '', email: '', phone: '', referral_fee_type: 'percentage', referral_fee_amount: 0, notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadPartners(); }, []);

  async function loadPartners() {
    setLoading(true);
    try {
      const data = await getReferralPartners();
      setPartners(data || []);
    } catch {} finally { setLoading(false); }
  }

  async function handleAdd() {
    if (!form.full_name) return;
    setSaving(true);
    try {
      await createReferralPartner(form);
      setForm({ full_name: '', company: '', email: '', phone: '', referral_fee_type: 'percentage', referral_fee_amount: 0, notes: '' });
      setShowAdd(false);
      loadPartners();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this referral partner?')) return;
    try {
      await deleteReferralPartner(id);
      setPartners(prev => prev.filter(p => p.id !== id));
    } catch {}
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Referral Partners</h2>
        <p className="text-sm text-slate-500 mt-1">
          People and firms who refer cases to you. Assign referred clients to track where cases come from.
        </p>
      </div>

      <button onClick={() => setShowAdd(!showAdd)}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
        <Plus className="w-4 h-4" /> Add Referral Partner
      </button>

      {showAdd && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-bold text-blue-800">New Referral Partner</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name *</label>
              <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Company / Firm</label>
              <input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Referral Fee Type</label>
              <select value={form.referral_fee_type} onChange={e => setForm(p => ({ ...p, referral_fee_type: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="percentage">Percentage</option>
                <option value="flat">Flat Fee</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Fee Amount</label>
              <input type="number" value={form.referral_fee_amount} onChange={e => setForm(p => ({ ...p, referral_fee_amount: Number(e.target.value) }))}
                placeholder={form.referral_fee_type === 'percentage' ? 'e.g. 33' : 'e.g. 500'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-y" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving || !form.full_name}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Partner'}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          </div>
        </div>
      )}

      {partners.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl border border-slate-200">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No referral partners yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {partners.map(p => (
            <div key={p.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-4 group">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-purple-700">
                  {(p.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">{p.full_name}</div>
                <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                  {p.company && <span>{p.company}</span>}
                  {p.email && <span>{p.email}</span>}
                  {p.phone && <span>{p.phone}</span>}
                  {p.referral_fee_type !== 'none' && p.referral_fee_amount > 0 && (
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
                      {p.referral_fee_type === 'percentage' ? `${p.referral_fee_amount}%` : `$${p.referral_fee_amount}`} fee
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {p.client_count || 0} clients · {p.case_count || 0} cases
                </div>
              </div>
              <button onClick={() => handleDelete(p.id)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attorney Team Tab
// ---------------------------------------------------------------------------

function TeamTab() {
  const [attorneys, setAttorneys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ full_name: '', email: '', phone: '', bar_number: '', firm_name: '' });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);

  useEffect(() => { loadTeam(); }, []);

  async function loadTeam() {
    setLoading(true);
    try {
      const data = await getStaffAttorneys();
      setAttorneys(data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleInvite() {
    if (!inviteForm.full_name || !inviteForm.email) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const result = await inviteStaffAttorney(inviteForm);
      setInviteResult(result);
      setInviteForm({ full_name: '', email: '', phone: '', bar_number: '', firm_name: '' });
      loadTeam();
    } catch (err) {
      setInviteResult({ error: err.message });
    } finally {
      setInviting(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Attorney Team</h2>
        <p className="text-sm text-slate-500 mt-1">
          Invite attorneys to the platform. Assign them clients so they only see their cases.
        </p>
      </div>

      <button onClick={() => setShowInvite(!showInvite)}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
        <Plus className="w-4 h-4" /> Invite Attorney
      </button>

      {showInvite && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-bold text-blue-800">Invite New Attorney</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name *</label>
              <input value={inviteForm.full_name} onChange={e => setInviteForm(p => ({ ...p, full_name: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email *</label>
              <input type="email" value={inviteForm.email} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Bar Number</label>
              <input value={inviteForm.bar_number} onChange={e => setInviteForm(p => ({ ...p, bar_number: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Phone</label>
              <input value={inviteForm.phone} onChange={e => setInviteForm(p => ({ ...p, phone: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Firm Name</label>
              <input value={inviteForm.firm_name} onChange={e => setInviteForm(p => ({ ...p, firm_name: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleInvite} disabled={inviting || !inviteForm.full_name || !inviteForm.email}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {inviting ? 'Inviting...' : 'Send Invite'}
            </button>
            <button onClick={() => { setShowInvite(false); setInviteResult(null); }}
              className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          </div>

          {inviteResult && !inviteResult.error && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
              <div className="font-bold">Attorney invited successfully!</div>
              <div className="mt-1">Temporary password: <code className="bg-emerald-100 px-2 py-0.5 rounded font-mono text-xs select-all">{inviteResult.temp_password}</code></div>
              <div className="text-xs text-emerald-600 mt-1">Share this password with {inviteResult.profile?.full_name || 'the attorney'} to log in. They should change it immediately.</div>
            </div>
          )}

          {inviteResult?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              Error: {inviteResult.error}
            </div>
          )}
        </div>
      )}

      {/* Team list */}
      {attorneys.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl border border-slate-200">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No team members yet. Invite your first attorney above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {attorneys.map(a => (
            <div key={a.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-blue-700">
                  {(a.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">{a.full_name}</div>
                <div className="text-xs text-slate-500 flex items-center gap-3">
                  <span>{a.email}</span>
                  {a.bar_number && <span>Bar #{a.bar_number}</span>}
                  {a.firm_name && <span>{a.firm_name}</span>}
                </div>
              </div>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium">Active</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Memory Tab
// ---------------------------------------------------------------------------

function MemoryTab() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCategory, setNewCategory] = useState('preference');
  const [newContent, setNewContent] = useState('');
  const [newImportance, setNewImportance] = useState(7);
  const [adding, setAdding] = useState(false);
  const [filterCat, setFilterCat] = useState('all');

  useEffect(() => {
    loadMemories();
  }, []);

  async function loadMemories() {
    setLoading(true);
    try {
      const [mems, st] = await Promise.all([getAttorneyMemories(), getMemoryStats()]);
      setMemories(mems || []);
      setStats(st);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleAdd() {
    if (!newContent.trim()) return;
    setAdding(true);
    try {
      await addAttorneyMemory({
        category: newCategory,
        content: newContent.trim(),
        importance: newImportance,
      });
      setNewContent('');
      setShowAdd(false);
      loadMemories();
    } catch (err) { console.error(err); }
    finally { setAdding(false); }
  }

  async function handleDelete(id) {
    try {
      await deleteAttorneyMemory(id);
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch (err) { console.error(err); }
  }

  const CATEGORIES = [
    { value: 'preference', label: 'Preference', color: 'bg-blue-100 text-blue-700' },
    { value: 'instruction', label: 'Instruction', color: 'bg-purple-100 text-purple-700' },
    { value: 'strategy', label: 'Strategy', color: 'bg-emerald-100 text-emerald-700' },
    { value: 'fact', label: 'Fact', color: 'bg-amber-100 text-amber-700' },
    { value: 'decision', label: 'Decision', color: 'bg-rose-100 text-rose-700' },
  ];

  const filtered = filterCat === 'all' ? memories : memories.filter(m => m.category === filterCat);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">AI Memory</h2>
        <p className="text-sm text-slate-500 mt-1">
          The AI learns from your conversations and draft revisions. These memories are injected into every future interaction so the AI remembers your preferences, past decisions, and case-specific context.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-2xl font-bold text-slate-900">{stats.attorney_memories}</div>
            <div className="text-xs text-slate-500">Global Memories</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-2xl font-bold text-slate-900">{stats.case_memories}</div>
            <div className="text-xs text-slate-500">Case-Specific Memories</div>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        <Sparkles className="w-4 h-4 inline mr-1" />
        <strong>How it works:</strong> After each conversation or draft revision, the AI automatically extracts important facts, decisions, and preferences.
        These are used in all future interactions. You can also add memories manually below.
      </div>

      {/* Filter + Add */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setFilterCat('all')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${filterCat === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            All ({memories.length})
          </button>
          {CATEGORIES.map(c => {
            const count = memories.filter(m => m.category === c.value).length;
            if (count === 0) return null;
            return (
              <button key={c.value} onClick={() => setFilterCat(c.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium ${filterCat === c.value ? 'bg-slate-800 text-white' : `${c.color} hover:opacity-80`}`}>
                {c.label} ({count})
              </button>
            );
          })}
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
          <Plus className="w-3.5 h-3.5" /> Add Memory
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Importance (1-10)</label>
              <input type="number" min={1} max={10} value={newImportance} onChange={(e) => setNewImportance(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Content</label>
            <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={3}
              placeholder="e.g. 'Always use 2.0 line spacing in complaints' or 'Never include Georgia FBPA unless there is clear willful/deceptive conduct'"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-y" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-slate-600">Cancel</button>
            <button onClick={handleAdd} disabled={adding || !newContent.trim()}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {adding ? 'Saving...' : 'Save Memory'}
            </button>
          </div>
        </div>
      )}

      {/* Memory list */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl border border-slate-200">
          <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No memories yet. Start chatting or drafting and the AI will learn automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(mem => {
            const cat = CATEGORIES.find(c => c.value === mem.category) || CATEGORIES[0];
            return (
              <div key={mem.id} className="bg-white rounded-lg border border-slate-200 p-3 flex items-start gap-3 group hover:border-slate-300 transition">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cat.color}`}>{cat.label}</span>
                    <span className="text-[10px] text-slate-400">Importance: {mem.importance}/10</span>
                    <span className="text-[10px] text-slate-400">·</span>
                    <span className="text-[10px] text-slate-400">{mem.source_type === 'manual' ? 'Manual' : mem.source_type === 'conversation' ? 'From Chat' : 'From Draft'}</span>
                    <span className="text-[10px] text-slate-400">· {new Date(mem.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-slate-800">{mem.content}</p>
                </div>
                <button onClick={() => handleDelete(mem.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatCard({ label, value, icon: Icon, tone = 'default' }) {
  const toneClasses = {
    default: 'border-slate-200 bg-white text-slate-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  };
  return (
    <div className={`rounded-lg border p-4 ${toneClasses[tone] || toneClasses.default}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-70">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Component
// ---------------------------------------------------------------------------

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile');

  const renderTab = () => {
    switch (activeTab) {
      case 'profile':
        return <ProfileTab />;
      case 'team':
        return <TeamTab />;
      case 'memory':
        return <MemoryTab />;
      case 'referrals':
        return <ReferralsTab />;
      case 'knowledge':
        return <KnowledgeBaseTab />;
      case 'defendants':
        return <DefendantsTab />;
      case 'pipeline':
        return <PipelineStagesTab />;
      case 'reference_cases':
        return <ReferenceCasesTab />;
      case 'notifications':
        return <NotificationsTab />;
      case 'branding':
        return <BrandingTab />;
      default:
        return <ProfileTab />;
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your account and preferences.</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Tab Navigation - Sidebar */}
        <nav className="shrink-0 lg:w-56">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <li key={tab.key}>
                  <button
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex w-full items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? 'text-primary-600' : 'text-slate-400'}`} />
                    {tab.label}
                    {isActive && <ChevronRight className="ml-auto hidden h-4 w-4 text-primary-400 lg:block" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Tab Content */}
        <div className="card min-w-0 flex-1">
          <h2 className="mb-6 text-lg font-semibold text-slate-900">
            {TABS.find((t) => t.key === activeTab)?.label}
          </h2>
          {renderTab()}
        </div>
      </div>
    </div>
  );
}
