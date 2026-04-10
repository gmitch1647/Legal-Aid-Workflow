import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  User,
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
} from 'lucide-react';
import { useAuth } from '../../App';
import { getDefendants, createDefendant, updateDefendant } from '../../lib/api';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'profile', label: 'Attorney Profile', icon: User },
  { key: 'defendants', label: 'Defendant Database', icon: Database },
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
      // Use supabase directly for delete, or API if available
      const { error: delErr } = await supabase.from('defendants').delete().eq('id', id);
      if (delErr) throw delErr;
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
// Settings Component
// ---------------------------------------------------------------------------

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile');

  const renderTab = () => {
    switch (activeTab) {
      case 'profile':
        return <ProfileTab />;
      case 'defendants':
        return <DefendantsTab />;
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
