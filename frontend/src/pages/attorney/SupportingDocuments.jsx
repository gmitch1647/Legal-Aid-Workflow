import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  deleteSupportingDocument,
  getSupportingDocumentAccessUrl,
  getSupportingDocuments,
  uploadSupportingDocument,
} from '../../lib/api';

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function SupportingDocuments() {
  const fileInputRef = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [openingId, setOpeningId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadDocuments() {
    setLoading(true);
    setError('');
    try {
      const result = await getSupportingDocuments();
      setDocuments(Array.isArray(result) ? result : result?.data || []);
    } catch (err) {
      setError(err.message || 'Unable to load the supporting-document library.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDocuments(); }, []);

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      await Promise.all(files.map((file) => uploadSupportingDocument(file, description)));
      setDescription('');
      setSuccess(`${files.length === 1 ? 'Document' : `${files.length} documents`} added to your reusable library.`);
      await loadDocuments();
    } catch (err) {
      setError(err.message || 'One or more supporting documents could not be uploaded.');
      await loadDocuments();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function openDocument(document) {
    setOpeningId(document.id);
    setError('');
    try {
      const { url } = await getSupportingDocumentAccessUrl(document.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err.message || 'Unable to open the supporting document.');
    } finally {
      setOpeningId('');
    }
  }

  async function removeDocument(document) {
    if (!window.confirm(`Delete “${document.file_name}” from your reusable supporting-document library? It will also be removed from cases where it is attached.`)) return;
    setDeletingId(document.id);
    setError('');
    setSuccess('');
    try {
      await deleteSupportingDocument(document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setSuccess('Supporting document deleted.');
    } catch (err) {
      setError(err.message || 'Unable to delete the supporting document.');
    } finally {
      setDeletingId('');
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-blue-700">
            <FolderOpen className="h-5 w-5" />
            <span className="text-sm font-semibold">Document Library</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Supporting Documents</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Upload frequently used exhibits, reference material, and templates once. Select them from a case whenever you need them without creating another stored copy.
          </p>
        </div>
        <button
          type="button"
          onClick={loadDocuments}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-blue-700" />
          <h2 className="text-base font-semibold text-slate-900">Add to library</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">You can add one file or multiple files at a time. Files are available only in your own LegalFlow library.</p>

        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="supporting-document-description">
          Optional description
        </label>
        <input
          id="supporting-document-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={uploading}
          placeholder="For example: Equifax dispute letter template"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
        />

        <div
          className={`mt-4 cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50'}`}
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!uploading) uploadFiles(event.dataTransfer.files);
          }}
        >
          {uploading ? <Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-600" /> : <Upload className="mx-auto h-7 w-7 text-slate-400" />}
          <p className="mt-3 text-sm font-medium text-slate-700">{uploading ? 'Uploading supporting document…' : 'Drag supporting documents here or click to browse'}</p>
          <p className="mt-1 text-xs text-slate-500">PDFs, Word files, images, spreadsheets, and text files up to 25 MB</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => uploadFiles(event.target.files)}
          />
        </div>
      </div>

      {(error || success) && (
        <div className={`mt-5 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <p>{error || success}</p>
        </div>
      )}

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Your reusable documents</h2>
            <p className="mt-1 text-sm text-slate-500">{documents.length} {documents.length === 1 ? 'document' : 'documents'} in your library</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading your library…
          </div>
        ) : documents.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-3 text-sm font-semibold text-slate-800">No supporting documents yet</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Add frequently used material here, then attach one or more documents to any case from the Complaint section.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {documents.map((document) => (
              <div key={document.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-700"><FileText className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <button type="button" onClick={() => openDocument(document)} className="block max-w-full truncate text-left text-sm font-semibold text-slate-800 hover:text-blue-700 hover:underline">
                      {document.file_name}
                    </button>
                    <p className="mt-0.5 text-xs text-slate-500">{formatFileSize(document.file_size)} · Added {displayDate(document.created_at)}</p>
                    {document.description && <p className="mt-1 text-sm text-slate-600">{document.description}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
                  <button
                    type="button"
                    onClick={() => openDocument(document)}
                    disabled={openingId === document.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {openingId === document.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDocument(document)}
                    disabled={deletingId === document.id}
                    aria-label={`Delete ${document.file_name}`}
                    className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    {deletingId === document.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
