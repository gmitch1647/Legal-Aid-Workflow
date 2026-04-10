import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  X,
  File,
  FileText,
  Image,
  ChevronDown,
  AlertCircle,
  CheckCircle,
  Loader2,
  Trash2,
} from 'lucide-react';
import { uploadDocument, getDocuments } from '../lib/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: 'credit_report', label: 'Credit Report' },
  { value: 'dispute_letter', label: 'Dispute Letter' },
  { value: 'response_from_bureau', label: 'Response from Bureau' },
  { value: 'collection_notice', label: 'Collection Notice' },
  { value: 'call_log', label: 'Call Log' },
  { value: 'other', label: 'Other' },
];

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/jpg',
];

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.txt,.png,.jpg,.jpeg';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const CATEGORY_STYLES = {
  credit_report: 'bg-blue-100 text-blue-700',
  dispute_letter: 'bg-purple-100 text-purple-700',
  response_from_bureau: 'bg-amber-100 text-amber-700',
  collection_notice: 'bg-red-100 text-red-700',
  call_log: 'bg-green-100 text-green-700',
  other: 'bg-slate-100 text-slate-600',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${size} ${units[i]}`;
}

function getFileIcon(fileName) {
  if (!fileName) return File;
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return FileText;
  if (['png', 'jpg', 'jpeg'].includes(ext)) return Image;
  if (ext === 'docx') return FileText;
  return File;
}

function getCategoryLabel(value) {
  const cat = CATEGORIES.find((c) => c.value === value);
  return cat ? cat.label : value;
}

function validateFile(file) {
  if (file.size > MAX_FILE_SIZE) {
    return `File "${file.name}" exceeds the 10MB size limit (${formatFileSize(file.size)}).`;
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  const validExtensions = ['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg'];
  if (!validExtensions.includes(ext)) {
    return `File "${file.name}" has an unsupported format. Accepted: PDF, DOCX, TXT, PNG, JPG.`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// File Item Component
// ---------------------------------------------------------------------------

function UploadedFileItem({ fileItem, onRemove }) {
  const Icon = getFileIcon(fileItem.name || fileItem.file_name);
  const categoryStyle = CATEGORY_STYLES[fileItem.category] || CATEGORY_STYLES.other;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {fileItem.name || fileItem.file_name}
        </p>
        <p className="text-xs text-slate-400">
          {formatFileSize(fileItem.size || fileItem.file_size || 0)}
        </p>
      </div>
      <span className={`badge shrink-0 ${categoryStyle}`}>
        {getCategoryLabel(fileItem.category)}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(fileItem)}
          className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
          aria-label={`Remove ${fileItem.name || fileItem.file_name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload Progress Item
// ---------------------------------------------------------------------------

function UploadingFileItem({ fileItem }) {
  const Icon = getFileIcon(fileItem.name);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-500">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="truncate text-sm font-medium text-slate-900">{fileItem.name}</p>
          {fileItem.status === 'uploading' && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
          )}
          {fileItem.status === 'complete' && (
            <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
          )}
          {fileItem.status === 'error' && (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          )}
        </div>
        {fileItem.status === 'uploading' && (
          <div className="mt-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${fileItem.progress || 0}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-blue-600">
              Uploading... {fileItem.progress || 0}%
            </p>
          </div>
        )}
        {fileItem.status === 'error' && (
          <p className="mt-1 text-xs text-red-600">{fileItem.error}</p>
        )}
        {fileItem.status === 'complete' && (
          <p className="mt-1 text-xs text-green-600">Upload complete</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DocumentUpload({ caseId, onUploadComplete }) {
  const [category, setCategory] = useState('credit_report');
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [errors, setErrors] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const fileInputRef = useRef(null);
  const hasLoadedRef = useRef(false);

  // Load existing documents on mount
  React.useEffect(() => {
    if (!caseId || hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    let mounted = true;
    async function loadExisting() {
      setLoadingExisting(true);
      try {
        const data = await getDocuments(caseId);
        if (mounted) {
          const docs = Array.isArray(data) ? data : data?.items ?? data?.documents ?? [];
          setUploadedFiles(docs);
        }
      } catch {
        // Non-critical - just start with empty list
      } finally {
        if (mounted) setLoadingExisting(false);
      }
    }

    loadExisting();
    return () => {
      mounted = false;
    };
  }, [caseId]);

  const processFiles = useCallback(
    async (files) => {
      if (!files || files.length === 0) return;

      setErrors([]);
      const validationErrors = [];
      const validFiles = [];

      Array.from(files).forEach((file) => {
        const error = validateFile(file);
        if (error) {
          validationErrors.push(error);
        } else {
          validFiles.push(file);
        }
      });

      if (validationErrors.length > 0) {
        setErrors(validationErrors);
      }

      if (validFiles.length === 0) return;

      // Create uploading entries
      const newUploading = validFiles.map((file) => ({
        id: `uploading_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: file.name,
        size: file.size,
        category,
        status: 'uploading',
        progress: 0,
        file,
      }));

      setUploadingFiles((prev) => [...prev, ...newUploading]);

      // Upload each file
      for (const item of newUploading) {
        try {
          // Simulate progress increments
          const progressInterval = setInterval(() => {
            setUploadingFiles((prev) =>
              prev.map((f) =>
                f.id === item.id && f.status === 'uploading' && f.progress < 90
                  ? { ...f, progress: Math.min(f.progress + 15, 90) }
                  : f
              )
            );
          }, 200);

          const result = await uploadDocument(caseId, item.file, category);

          clearInterval(progressInterval);

          // Mark as complete
          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === item.id ? { ...f, status: 'complete', progress: 100 } : f))
          );

          // Add to uploaded list
          const uploaded = {
            id: result?.id || item.id,
            name: item.name,
            file_name: item.name,
            size: item.size,
            file_size: item.size,
            category,
            ...result,
          };

          setUploadedFiles((prev) => [...prev, uploaded]);

          // Remove from uploading after a brief delay
          setTimeout(() => {
            setUploadingFiles((prev) => prev.filter((f) => f.id !== item.id));
          }, 1500);

          onUploadComplete?.(uploaded);
        } catch (err) {
          // Mark as error
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? { ...f, status: 'error', error: err.message || 'Upload failed' }
                : f
            )
          );

          // Remove errored item after delay
          setTimeout(() => {
            setUploadingFiles((prev) => prev.filter((f) => f.id !== item.id));
          }, 5000);
        }
      }
    },
    [caseId, category, onUploadComplete]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleFileChange = useCallback(
    (e) => {
      processFiles(e.target.files);
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processFiles]
  );

  const handleRemoveUploaded = useCallback((fileItem) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileItem.id));
  }, []);

  return (
    <div className="space-y-4">
      {/* Category selector */}
      <div>
        <label htmlFor="doc-category" className="label">
          Document Category
        </label>
        <div className="relative">
          <select
            id="doc-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input appearance-none pr-9"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`group relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all ${
          isDragOver
            ? 'border-primary-400 bg-primary-50'
            : 'border-slate-300 bg-slate-50/50 hover:border-primary-300 hover:bg-primary-50/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="flex flex-col items-center">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
              isDragOver
                ? 'bg-primary-100 text-primary-600'
                : 'bg-slate-100 text-slate-400 group-hover:bg-primary-100 group-hover:text-primary-600'
            }`}
          >
            <Upload className="h-7 w-7" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-700">
            {isDragOver ? 'Drop files here' : 'Drag files here or click to browse'}
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            PDF, DOCX, TXT, PNG, or JPG up to 10MB each
          </p>
        </div>
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          {errors.map((err, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{err}</p>
            </div>
          ))}
        </div>
      )}

      {/* Uploading files */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Uploading
          </p>
          {uploadingFiles.map((item) => (
            <UploadingFileItem key={item.id} fileItem={item} />
          ))}
        </div>
      )}

      {/* Uploaded files */}
      {loadingExisting ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : (
        uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Uploaded Documents ({uploadedFiles.length})
            </p>
            {uploadedFiles.map((item) => (
              <UploadedFileItem
                key={item.id}
                fileItem={item}
                onRemove={handleRemoveUploaded}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
