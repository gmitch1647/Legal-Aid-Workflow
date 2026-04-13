import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  UserPlus,
  Users,
  Mail,
  Phone,
  Briefcase,
  Calendar,
  ChevronRight,
  Loader2,
  AlertCircle,
  X,
  Check,
} from 'lucide-react';
import { getCases, registerClient, getCommsHistory } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { MessageSquare, Send } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_LABELS = {
  submitted: 'Submitted',
  approved_for_processing: 'Approved',
  agents_processing: 'Processing',
  draft_ready: 'Draft Ready',
  attorney_review: 'Attorney Review',
  approved: 'Approved',
  filed: 'Filed',
  closed: 'Closed',
  denied: 'Denied',
};

function statusBadgeClasses(status) {
  switch (status) {
    case 'submitted':
      return 'bg-blue-100 text-blue-700';
    case 'draft_ready':
    case 'attorney_review':
      return 'bg-amber-100 text-amber-700';
    case 'agents_processing':
    case 'approved_for_processing':
      return 'bg-cyan-100 text-cyan-700';
    case 'approved':
      return 'bg-green-100 text-green-700';
    case 'filed':
      return 'bg-emerald-100 text-emerald-700';
    case 'closed':
      return 'bg-slate-100 text-slate-600';
    case 'denied':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

// ---------------------------------------------------------------------------
// Registration Modal
// ---------------------------------------------------------------------------

function RegisterClientModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    county: '',
    state: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) {
      setError('Name and email are required');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await registerClient(form);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to register client');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Register New Client</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center px-6 py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <p className="mt-4 text-lg font-medium text-slate-900">Client Registered!</p>
            <p className="mt-1 text-sm text-slate-500">The client has been added successfully.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6">
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={handleChange('full_name')}
                  placeholder="John Smith"
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={handleChange('email')}
                  placeholder="john@example.com"
                  className="input"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={handleChange('phone')}
                    placeholder="(555) 123-4567"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">County</label>
                  <input
                    type="text"
                    value={form.county}
                    onChange={handleChange('county')}
                    placeholder="County"
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="label">Address</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={handleChange('address')}
                  placeholder="123 Main St, City, State ZIP"
                  className="input"
                />
              </div>

              <div>
                <label className="label">State</label>
                <input
                  type="text"
                  value={form.state}
                  onChange={handleChange('state')}
                  placeholder="State"
                  className="input"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn-primary gap-2" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Register Client
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client List Component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

export default function ClientList() {
  const navigate = useNavigate();

  const [clients, setClients] = useState([]);
  const [cases, setCases] = useState([]);
  const [commsMap, setCommsMap] = useState({}); // { clientId: [comms] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch cases to derive client list and stats
      const casesData = await getCases();
      const caseList = Array.isArray(casesData) ? casesData : casesData?.items ?? casesData?.cases ?? [];
      setCases(caseList);

      // Also try to fetch profiles directly from supabase
      try {
        const { data: profiles, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'client')
          .order('created_at', { ascending: false });

        if (!profileErr && profiles) {
          setClients(profiles);
        } else {
          // Derive clients from cases if profiles query fails
          const clientMap = new Map();
          caseList.forEach((c) => {
            const clientId = c.client_id || c.plaintiff_id || c.user_id;
            if (clientId && !clientMap.has(clientId)) {
              clientMap.set(clientId, {
                id: clientId,
                full_name: c.plaintiff_name || c.client_name || 'Unknown Client',
                email: c.client_email || c.plaintiff_email || '',
                phone: c.client_phone || c.plaintiff_phone || '',
                created_at: c.created_at,
              });
            }
          });
          setClients(Array.from(clientMap.values()));
        }
      } catch {
        // Derive clients from cases as fallback
        const clientMap = new Map();
        caseList.forEach((c) => {
          const clientId = c.client_id || c.plaintiff_id || c.user_id;
          if (clientId && !clientMap.has(clientId)) {
            clientMap.set(clientId, {
              id: clientId,
              full_name: c.plaintiff_name || c.client_name || 'Unknown Client',
              email: c.client_email || c.plaintiff_email || '',
              phone: c.client_phone || c.plaintiff_phone || '',
              created_at: c.created_at,
            });
          }
        });
        setClients(Array.from(clientMap.values()));
      }
    } catch (err) {
      console.error('Failed to load clients:', err);
      setError(err.message || 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Enrich clients with case stats
  // Load comms for all clients (batch after initial load)
  useEffect(() => {
    if (clients.length === 0) return;
    async function loadComms() {
      const map = {};
      for (const client of clients.slice(0, 50)) {
        try {
          const history = await getCommsHistory(client.id);
          if (history && history.length > 0) {
            map[client.id] = history;
          }
        } catch {
          // ignore individual failures
        }
      }
      setCommsMap(map);
    }
    loadComms();
  }, [clients]);

  const enrichedClients = useMemo(() => {
    return clients.map((client) => {
      const clientCases = cases.filter(
        (c) =>
          c.client_id === client.id ||
          c.plaintiff_id === client.id ||
          c.user_id === client.id
      );
      const latestCase = clientCases.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      )[0];
      const comms = commsMap[client.id] || [];
      const lastComm = comms[0] || null;
      return {
        ...client,
        case_count: clientCases.length,
        latest_case_status: latestCase?.status || null,
        comms_count: comms.length,
        last_comm: lastComm,
      };
    });
  }, [clients, cases, commsMap]);

  // Filter
  const filteredClients = useMemo(() => {
    if (!search) return enrichedClients;
    const q = search.toLowerCase();
    return enrichedClients.filter(
      (c) =>
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
    );
  }, [enrichedClients, search]);

  // Pagination
  const totalPages = Math.ceil(filteredClients.length / PAGE_SIZE);
  const paginatedClients = filteredClients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-600" />
          <p className="mt-3 text-sm text-slate-500">Loading clients...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">
            {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowRegister(true)}
          className="btn-primary gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Register New Client
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input !pl-9"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button onClick={fetchData} className="ml-auto text-red-800 underline hover:no-underline">
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Client Table */}
      <div className="card overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Contact
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Cases
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Latest Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Last Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Joined
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Users className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm text-slate-500">
                      {search ? 'No clients match your search.' : 'No clients found.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedClients.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => navigate(`/attorney/clients/${client.id}`)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100">
                          <span className="text-sm font-semibold text-primary-700">
                            {(client.full_name || '?')
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-900">{client.full_name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {client.email && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-sm text-slate-600">{client.email}</span>
                          </div>
                        )}
                        {client.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-sm text-slate-600">{client.phone}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5">
                        <Briefcase className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-sm font-medium text-slate-700">{client.case_count}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {client.latest_case_status ? (
                        <span className={`badge ${statusBadgeClasses(client.latest_case_status)}`}>
                          {STATUS_LABELS[client.latest_case_status] || client.latest_case_status}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">No cases</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {client.last_comm ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            {client.last_comm.channel === 'email' ? (
                              <Mail className="h-3.5 w-3.5 text-blue-400" />
                            ) : (
                              <MessageSquare className="h-3.5 w-3.5 text-green-400" />
                            )}
                            <span className="text-xs text-slate-600">
                              {client.last_comm.channel === 'email' ? 'Email' : 'Text'}
                            </span>
                            <span className={`text-[10px] px-1 py-0.5 rounded ${
                              client.last_comm.status === 'sent' || client.last_comm.status === 'delivered'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {client.last_comm.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 truncate max-w-[150px]">
                            {client.last_comm.subject || client.last_comm.body?.slice(0, 40) || ''}
                          </p>
                          <p className="text-[10px] text-slate-400">{formatDate(client.last_comm.created_at)}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No contact yet</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm text-slate-600">{formatDate(client.created_at)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
            <p className="text-sm text-slate-500">
              Showing {(page - 1) * PAGE_SIZE + 1} to{' '}
              {Math.min(page * PAGE_SIZE, filteredClients.length)} of {filteredClients.length}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-xs disabled:opacity-50"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => (
                  <React.Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="flex items-center px-1 text-slate-400">...</span>
                    )}
                    <button
                      onClick={() => setPage(p)}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                        p === page
                          ? 'bg-primary-600 text-white'
                          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary text-xs disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Registration Modal */}
      {showRegister && (
        <RegisterClientModal
          onClose={() => setShowRegister(false)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}
