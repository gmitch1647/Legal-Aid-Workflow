import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../../App';
import {
  getReferralAttorneyPortalTeam,
  getReferralAttorneyWorkspace,
  inviteReferralAttorneyPortalTeamMember,
  resendReferralAttorneyPortalTeamInvitation,
  revokeReferralAttorneyPortalTeamMember,
  updateReferralAttorneyPortalPassword,
} from '../../lib/api';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function Notice({ tone = 'error', children }) {
  const styles = tone === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-red-200 bg-red-50 text-red-800';
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return <div className={`flex gap-3 rounded-xl border p-4 text-sm ${styles}`}><Icon className="h-5 w-5 shrink-0" />{children}</div>;
}

export default function ReferralAttorneySettings() {
  const { profile } = useAuth();
  const [workspace, setWorkspace] = useState(null);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [password, setPassword] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [invite, setInvite] = useState({ full_name: '', email: '' });
  const [inviting, setInviting] = useState(false);
  const [resendingId, setResendingId] = useState('');
  const [revokingId, setRevokingId] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const currentWorkspace = await getReferralAttorneyWorkspace();
      setWorkspace(currentWorkspace);
      if (currentWorkspace?.can_manage_team) {
        setTeamLoading(true);
        const response = await getReferralAttorneyPortalTeam();
        setTeam(response?.members || []);
      } else {
        setTeam([]);
      }
    } catch (loadError) {
      setError(loadError.message || 'Could not load portal settings.');
    } finally {
      setLoading(false);
      setTeamLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refreshTeam = useCallback(async () => {
    if (!workspace?.can_manage_team) return;
    try {
      setTeamLoading(true);
      const response = await getReferralAttorneyPortalTeam();
      setTeam(response?.members || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not refresh team members.');
    } finally {
      setTeamLoading(false);
    }
  }, [workspace?.can_manage_team]);

  async function submitPassword(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (password.new_password !== password.confirm_password) {
      setError('The new password and confirmation do not match.');
      return;
    }
    try {
      setSavingPassword(true);
      const result = await updateReferralAttorneyPortalPassword({
        current_password: password.current_password,
        new_password: password.new_password,
      });
      setPassword({ current_password: '', new_password: '', confirm_password: '' });
      setSuccess(result.message || 'Your password was updated.');
    } catch (saveError) {
      setError(saveError.message || 'Could not update your password.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function submitInvite(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      setInviting(true);
      const result = await inviteReferralAttorneyPortalTeamMember(invite);
      setInvite({ full_name: '', email: '' });
      setSuccess(result.message || 'Team member added.');
      await refreshTeam();
    } catch (inviteError) {
      setError(inviteError.message || 'Could not add that team member.');
    } finally {
      setInviting(false);
    }
  }

  async function resendInvite(member) {
    setError('');
    setSuccess('');
    try {
      setResendingId(member.id);
      const result = await resendReferralAttorneyPortalTeamInvitation(member.id);
      setSuccess(result.message || `A new invitation was sent to ${member.email}.`);
    } catch (resendError) {
      setError(resendError.message || 'Could not resend the invitation.');
    } finally {
      setResendingId('');
    }
  }

  async function revokeMember(member) {
    if (!window.confirm(`Remove ${member.full_name} from this referral workspace? They will immediately lose access to its clients, cases, documents, and messages.`)) return;
    setError('');
    setSuccess('');
    try {
      setRevokingId(member.id);
      const result = await revokeReferralAttorneyPortalTeamMember(member.id);
      setSuccess(result.message || 'Team access was removed.');
      await refreshTeam();
    } catch (revokeError) {
      setError(revokeError.message || 'Could not remove that team member.');
    } finally {
      setRevokingId('');
    }
  }

  if (loading) return <div className="flex h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;

  const canManageTeam = Boolean(workspace?.can_manage_team);
  const activeMembers = team.filter((member) => member.status === 'active');
  const formerMembers = team.filter((member) => member.status !== 'active');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-lg sm:p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white/10 p-3"><Settings className="h-7 w-7 text-indigo-200" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">Private Referral Portal</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Settings</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Manage your account and the people who may work inside {workspace?.partner_name || 'this'} referral workspace. Portal access never includes LegalFlow firm cases or other referral workspaces.</p>
          </div>
        </div>
      </section>

      {error && <Notice>{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <h2 className="font-bold text-slate-900">Portal account</h2>
            <p className="mt-1 text-sm text-slate-600">You are signed in as <strong>{profile?.full_name || 'Portal user'}</strong>{profile?.email ? ` (${profile.email})` : ''}. Your access remains limited to this referral workspace.</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><KeyRound className="h-5 w-5" /></div>
          <div>
            <h2 className="font-bold text-slate-900">Change password</h2>
            <p className="mt-1 text-sm text-slate-600">Enter your current password to protect your account. New passwords need at least 12 characters, an uppercase letter, lowercase letter, and number.</p>
          </div>
        </div>
        <form onSubmit={submitPassword} className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700">Current password<input required type="password" autoComplete="current-password" value={password.current_password} onChange={(event) => setPassword((current) => ({ ...current, current_password: event.target.value }))} className="input mt-1.5" /></label>
          <label className="block text-sm font-medium text-slate-700">New password<input required type="password" minLength="12" autoComplete="new-password" value={password.new_password} onChange={(event) => setPassword((current) => ({ ...current, new_password: event.target.value }))} className="input mt-1.5" /></label>
          <label className="block text-sm font-medium text-slate-700">Confirm new password<input required type="password" minLength="12" autoComplete="new-password" value={password.confirm_password} onChange={(event) => setPassword((current) => ({ ...current, confirm_password: event.target.value }))} className="input mt-1.5" /></label>
          <div className="md:col-span-3"><button type="submit" disabled={savingPassword} className="btn-primary gap-2">{savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{savingPassword ? 'Updating password...' : 'Update password'}</button></div>
        </form>
      </section>

      {canManageTeam ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Users className="h-5 w-5" /></div><div><h2 className="font-bold text-slate-900">Portal team</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">Invite staff who need to help with your referrals. Each active team account is restricted server-side to {workspace?.partner_name || 'this'} workspace’s clients, cases, documents, and messages.</p></div></div>
            <button type="button" onClick={refreshTeam} disabled={teamLoading} className="btn-secondary gap-2"><RefreshCw className={`h-4 w-4 ${teamLoading ? 'animate-spin' : ''}`} />Refresh</button>
          </div>

          <form onSubmit={submitInvite} className="mt-6 grid gap-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 md:grid-cols-[1fr_1fr_auto]">
            <label className="block text-sm font-medium text-slate-700">Team member name<input required value={invite.full_name} onChange={(event) => setInvite((current) => ({ ...current, full_name: event.target.value }))} placeholder="Full name" className="input mt-1.5 !bg-white" /></label>
            <label className="block text-sm font-medium text-slate-700">Email address<input required type="email" value={invite.email} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} placeholder="name@company.com" className="input mt-1.5 !bg-white" /></label>
            <div className="flex items-end"><button type="submit" disabled={inviting} className="btn-primary w-full gap-2">{inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}{inviting ? 'Adding...' : 'Add team member'}</button></div>
          </form>

          <div className="mt-6">
            <h3 className="text-sm font-bold text-slate-900">Active team members <span className="ml-1 text-slate-400">({activeMembers.length})</span></h3>
            {!activeMembers.length ? <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No team members have been added yet.</p> : <div className="mt-3 space-y-3">{activeMembers.map((member) => <article key={member.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-semibold text-slate-900">{member.full_name}</p><p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-600"><Mail className="h-3.5 w-3.5 shrink-0" />{member.email}</p><p className="mt-1 text-xs text-slate-500">Added {formatDate(member.created_at)} · Private workspace access only</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => resendInvite(member)} disabled={resendingId === member.id} className="btn-secondary gap-2 text-xs">{resendingId === member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Resend</button><button type="button" onClick={() => revokeMember(member)} disabled={revokingId === member.id} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60">{revokingId === member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Remove</button></div></article>)}</div>}
          </div>

          {!!formerMembers.length && <div className="mt-6 border-t border-slate-100 pt-5"><h3 className="text-sm font-bold text-slate-700">Removed members</h3><div className="mt-3 space-y-2">{formerMembers.map((member) => <div key={member.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500"><span>{member.full_name} · {member.email}</span><span>Removed {formatDate(member.revoked_at)}</span></div>)}</div></div>}
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 shadow-sm"><div className="flex gap-3"><Users className="h-5 w-5 shrink-0 text-slate-500" /><p>Only the referral attorney who owns this workspace can add or remove portal team members. You can still change your own password above.</p></div></section>
      )}
    </div>
  );
}
