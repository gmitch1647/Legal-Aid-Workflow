import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SignaturePad from 'signature_pad';
import {
  AlertCircle,
  CheckCircle2,
  Eraser,
  ExternalLink,
  FileText,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Type,
} from 'lucide-react';
import { getPublicW9, publicW9CompletedCopyUrl, publicW9TemplateUrl, submitPublicW9 } from '../lib/api';
import AddressAutocomplete from '../components/AddressAutocomplete';

const entityTypes = [
  { value: 'individual', label: 'Individual / sole proprietor' },
  { value: 'c_corporation', label: 'C corporation' },
  { value: 's_corporation', label: 'S corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'trust_estate', label: 'Trust / estate' },
  { value: 'llc', label: 'Limited liability company (LLC)' },
  { value: 'other', label: 'Other' },
];

const initialValues = {
  legal_name: '',
  business_name: '',
  tax_classification: 'individual',
  llc_tax_classification: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  zip_code: '',
  tin_type: 'ssn',
  tin: '',
  typed_name: '',
  certification_accepted: false,
};

function formatTin(value, type) {
  const digits = value.replace(/\D/g, '').slice(0, 9);
  if (type === 'ssn') {
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export default function W9Form() {
  const { token } = useParams();
  const [request, setRequest] = useState(null);
  const [values, setValues] = useState(initialValues);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const [signatureMode, setSignatureMode] = useState('draw');
  const canvasRef = useRef(null);
  const signaturePadRef = useRef(null);

  useEffect(() => {
    let active = true;
    getPublicW9(token)
      .then((data) => {
        if (!active) return;
        setRequest(data);
        setValues((current) => ({
          ...current,
          typed_name: data.signer_name || current.typed_name,
          legal_name: data.prefill?.legal_name || current.legal_name,
          tin_type: data.prefill?.tin_type || current.tin_type,
        }));
        if (data.status === 'complete') setCompleted(true);
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  const initializeSignaturePad = useCallback((node) => {
    if (!node || signaturePadRef.current) return;
    canvasRef.current = node;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    node.width = node.offsetWidth * ratio;
    node.height = node.offsetHeight * ratio;
    node.getContext('2d').scale(ratio, ratio);
    signaturePadRef.current = new SignaturePad(node, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)',
      minWidth: 0.8,
      maxWidth: 2.2,
    });
  }, []);

  function update(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function clearSignature() {
    signaturePadRef.current?.clear();
  }

  function typedSignature(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111827';
    context.font = 'italic 64px "Times New Roman", serif';
    context.textBaseline = 'middle';
    context.fillText(name.trim(), 28, 94);
    return canvas.toDataURL('image/png');
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!values.certification_accepted) {
      setError('Please read and certify the Form W-9 certification before signing.');
      return;
    }
    if (values.tax_classification === 'llc' && !values.llc_tax_classification) {
      setError('Please choose the LLC tax classification: C, S, or P.');
      return;
    }

    let signature;
    if (signatureMode === 'draw') {
      if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
        setError('Please draw your signature before submitting the Form W-9.');
        return;
      }
      signature = signaturePadRef.current.toDataURL('image/png');
    } else {
      if (!values.typed_name.trim()) {
        setError('Please type the name that will appear as your electronic signature.');
        return;
      }
      signature = typedSignature(values.typed_name);
    }

    setSubmitting(true);
    try {
      const payload = { ...values, signature };
      // Locked values remain solely on the server. The server resolves them
      // from encrypted request data and ignores any client-side replacement.
      if (request?.prefill?.legal_name_locked) delete payload.legal_name;
      if (request?.prefill?.tin_locked) {
        delete payload.tin;
        delete payload.tin_type;
      }
      await submitPublicW9(token, payload);
      // Clear the taxpayer ID and all remaining sensitive form state as soon as
      // the server confirms persistence. Nothing is stored in localStorage.
      setValues(initialValues);
      signaturePadRef.current?.clear();
      setCompleted(true);
    } catch (err) {
      setError(err.message || 'The Form W-9 could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  if (completed) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <section className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center"><CheckCircle2 className="w-8 h-8 text-emerald-600" /></div>
          <h1 className="text-2xl font-bold text-slate-900">Form W-9 Submitted</h1>
          <p className="mt-3 text-slate-600">Your signed Form W-9 has been securely submitted to LegalFlow. Your taxpayer identification number is not displayed in this confirmation.</p>
          <p className="mt-3 text-sm text-slate-600">A secure completed-copy link has been sent to the email address used for this request.</p>
          <a href={publicW9CompletedCopyUrl(token)} className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"><FileText className="h-4 w-4" />Download completed copy</a>
          <p className="mt-5 text-xs text-slate-400">Keep the completed copy private because it contains sensitive taxpayer information.</p>
        </section>
      </main>
    );
  }

  if (error && !request) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <section className="max-w-lg w-full bg-white rounded-2xl border border-red-100 shadow-sm p-8 text-center">
          <AlertCircle className="mx-auto mb-4 w-10 h-10 text-red-500" />
          <h1 className="text-xl font-bold text-slate-900">Unable to Open Form W-9</h1>
          <p className="mt-3 text-slate-600">{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-800">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3"><div className="w-9 h-9 bg-blue-700 rounded-lg flex items-center justify-center"><FileText className="w-5 h-5 text-white" /></div><div><p className="font-bold text-slate-900">LegalFlow</p><p className="text-xs text-slate-500">Secure Form W-9 Collection</p></div></div>
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-700"><LockKeyhole className="w-4 h-4" />Encrypted taxpayer-ID storage</div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 md:py-10">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-7">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
            <div><p className="text-xs font-semibold tracking-wider uppercase text-blue-700">IRS Form W-9</p><h1 className="mt-1 text-2xl font-bold text-slate-950">{request?.title}</h1><p className="mt-2 text-sm text-slate-600">Requested for <span className="font-semibold">{request?.signer_name}</span>{request?.attorney_name ? ` by ${request.attorney_name}` : ''}.</p>{request?.message && <p className="mt-4 max-w-2xl rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-950">{request.message}</p>}</div>
            <a href={publicW9TemplateUrl(token)} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"><ExternalLink className="w-4 h-4" />View blank IRS W-9</a>
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950 flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 w-5 h-5" /><p>Enter the information exactly as it should appear on Form W-9. Fields securely prefilled by your attorney are locked. Any taxpayer identification number you enter is encrypted before storage and is never sent by email or shown in a LegalFlow confirmation.</p></section>

        <form onSubmit={submit} className="mt-5 space-y-5" autoComplete="off">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-7">
            <h2 className="text-lg font-bold text-slate-900">Taxpayer information</h2>
            <p className="mt-1 text-sm text-slate-500">Fields mirror the identifying sections of the official Form W-9.</p>
            <div className="mt-5 grid gap-4">
              <label className="block"><span className="block text-sm font-semibold text-slate-700">Name (as shown on your income tax return)</span>{request?.prefill?.legal_name_locked ? <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-slate-900"><LockKeyhole className="h-4 w-4 shrink-0 text-indigo-700" /><span className="font-medium">{request.prefill.legal_name}</span><span className="ml-auto text-xs font-semibold text-indigo-700">Prefilled and locked</span></div> : <input required value={values.legal_name} onChange={(e) => update('legal_name', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />}</label>
              <label className="block"><span className="block text-sm font-semibold text-slate-700">Business name / disregarded entity name <span className="font-normal text-slate-400">(if different)</span></span><input value={values.business_name} onChange={(e) => update('business_name', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" /></label>
            </div>

            <fieldset className="mt-6"><legend className="text-sm font-semibold text-slate-700">Federal tax classification</legend><p className="mt-1 text-xs text-slate-500">Select the one classification that applies.</p><div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">{entityTypes.map((entity) => <label key={entity.value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${values.tax_classification === entity.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}><input type="radio" name="classification" value={entity.value} checked={values.tax_classification === entity.value} onChange={() => update('tax_classification', entity.value)} className="mt-0.5 accent-blue-600" /><span className="text-sm font-medium text-slate-800">{entity.label}</span></label>)}</div></fieldset>
            {values.tax_classification === 'llc' && <label className="block mt-4"><span className="block text-sm font-semibold text-slate-700">LLC tax classification</span><select required value={values.llc_tax_classification} onChange={(e) => update('llc_tax_classification', e.target.value)} className="mt-1.5 rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"><option value="">Choose one</option><option value="C">C corporation</option><option value="S">S corporation</option><option value="P">Partnership</option></select></label>}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-7"><h2 className="text-lg font-bold text-slate-900">Mailing address</h2><div className="mt-5 grid gap-4"><label className="block"><span className="block text-sm font-semibold text-slate-700">Street address</span><AddressAutocomplete value={values.address_line1} onChange={(value) => update('address_line1', value)} onSelect={(address) => setValues((current) => ({ ...current, address_line1: address.line1, city: address.city || current.city, state: address.state || current.state, zip_code: address.zip_code || current.zip_code }))} placeholder="Start typing your street address" required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" /></label><label className="block"><span className="block text-sm font-semibold text-slate-700">Apartment, suite, or unit <span className="font-normal text-slate-400">(optional)</span></span><input value={values.address_line2} onChange={(e) => update('address_line2', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" /></label><div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_130px] gap-4"><label className="block"><span className="block text-sm font-semibold text-slate-700">City</span><input required value={values.city} onChange={(e) => update('city', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" /></label><label className="block"><span className="block text-sm font-semibold text-slate-700">State</span><input required value={values.state} onChange={(e) => update('state', e.target.value)} maxLength={32} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" /></label><label className="block"><span className="block text-sm font-semibold text-slate-700">ZIP code</span><input required value={values.zip_code} onChange={(e) => update('zip_code', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" /></label></div></div></section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-7"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-900">Taxpayer identification number</h2><p className="mt-1 text-sm text-slate-500">{request?.prefill?.tin_locked ? 'Your attorney securely prefilled this information.' : 'Choose the number type and enter all nine digits.'}</p></div><LockKeyhole className="w-6 h-6 text-emerald-600" /></div>{request?.prefill?.tin_locked ? <div className="mt-5 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4"><LockKeyhole className="h-5 w-5 shrink-0 text-indigo-700" /><div><p className="font-semibold text-indigo-950">{request.prefill.tin_type?.toUpperCase()} ending in {request.prefill.tin_last4} is prefilled and locked.</p><p className="mt-1 text-sm text-indigo-900">For your privacy, the full taxpayer ID is not displayed or sent back through this browser.</p></div></div> : <><div className="mt-5 flex flex-wrap gap-3"><label className={`px-4 py-2 rounded-lg border cursor-pointer ${values.tin_type === 'ssn' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}><input className="sr-only" type="radio" checked={values.tin_type === 'ssn'} onChange={() => { update('tin_type', 'ssn'); update('tin', ''); }} />Social Security Number</label><label className={`px-4 py-2 rounded-lg border cursor-pointer ${values.tin_type === 'ein' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}><input className="sr-only" type="radio" checked={values.tin_type === 'ein'} onChange={() => { update('tin_type', 'ein'); update('tin', ''); }} />Employer Identification Number</label></div><label className="block mt-4"><span className="block text-sm font-semibold text-slate-700">{values.tin_type === 'ssn' ? 'Social Security Number' : 'Employer Identification Number'}</span><input required type="password" inputMode="numeric" autoComplete="off" value={formatTin(values.tin, values.tin_type)} onChange={(e) => update('tin', e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder={values.tin_type === 'ssn' ? '000-00-0000' : '00-0000000'} className="mt-1.5 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2.5 tracking-wider focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" /></label></>}</section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-7"><h2 className="text-lg font-bold text-slate-900">Certification and electronic signature</h2><p className="mt-2 text-sm leading-6 text-slate-600">Under penalties of perjury, you certify that the taxpayer identification number entered is correct (or that you are waiting for one to be issued), that you are not subject to backup withholding unless notified otherwise, that you are a U.S. person, and that any FATCA exemption code entered is correct.</p><label className="mt-4 flex items-start gap-3 rounded-lg bg-slate-50 border border-slate-200 p-4 cursor-pointer"><input required type="checkbox" checked={values.certification_accepted} onChange={(e) => update('certification_accepted', e.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" /><span className="text-sm font-medium text-slate-700">I have read the certification and certify it by submitting my electronic signature.</span></label>
            <div className="mt-6"><div className="flex gap-1 bg-slate-100 rounded-lg p-1"><button type="button" onClick={() => setSignatureMode('draw')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${signatureMode === 'draw' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><Eraser className="w-4 h-4" />Draw signature</button><button type="button" onClick={() => setSignatureMode('type')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${signatureMode === 'type' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><Type className="w-4 h-4" />Type signature</button></div>{signatureMode === 'draw' ? <div className="mt-4"><div className="rounded-lg overflow-hidden border-2 border-slate-200 bg-white" style={{ touchAction: 'none' }}><canvas ref={initializeSignaturePad} className="w-full" style={{ height: '150px' }} /></div><div className="mt-2 flex items-center justify-between"><p className="text-xs text-slate-500">Draw your signature with a mouse or finger.</p><button type="button" onClick={clearSignature} className="text-xs font-medium text-blue-700 hover:text-blue-800">Clear</button></div></div> : <div className="mt-4"><label className="block text-sm font-semibold text-slate-700">Typed signature</label><input required value={values.typed_name} onChange={(e) => update('typed_name', e.target.value)} placeholder="Type your full legal name" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />{values.typed_name && <p className="mt-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-3xl italic" style={{ fontFamily: '"Times New Roman", serif' }}>{values.typed_name}</p>}</div>}</div>
            {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="inline w-4 h-4 mr-1" />{error}</p>}
            <button disabled={submitting} className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting securely…</> : <><CheckCircle2 className="w-4 h-4" />Certify and submit Form W-9</>}</button>
          </section>
        </form>
      </div>
    </main>
  );
}
