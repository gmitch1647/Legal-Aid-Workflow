# Reference Cases — RAG Reference Library

This folder holds `.docx` files of previously filed complaints, motions, discovery, and other legal documents. The Complaint Drafter agent uses these as style and structure references — but instead of loading whole files into every API call, it uses **RAG (Retrieval-Augmented Generation)** to pull only the most semantically relevant excerpts based on the current case's facts.

## How it works

1. **You drop `.docx` files in this folder** (or subfolders)
2. **You trigger reindexing** via the `/draft/reindex` endpoint
3. **The indexer** reads each file, splits it into semantic chunks (~200 words each), embeds each chunk using Voyage AI's `voyage-law-2` model, and stores the vectors in Supabase's `reference_chunks` table (pgvector)
4. **At draft time** the Complaint Drafter embeds the current case's facts, queries pgvector for the 8 most similar chunks, and sends only those to Claude as style context

This means you can grow the library to hundreds of documents without blowing up the token cost of each draft.

## Setup (one-time)

### 1. Enable pgvector in Supabase

Run `supabase/migrations/004_pgvector_reference_chunks.sql` in the Supabase SQL Editor. This:
- Enables the `vector` extension
- Creates the `reference_chunks` table
- Adds the similarity-search function `match_reference_chunks`

### 2. Get a Voyage AI API key (free tier is plenty)

1. Go to https://www.voyageai.com
2. Sign up (first 200M tokens are free — you will likely never exceed this)
3. Create an API key
4. Add it to Railway → your service → Variables:
   - Key: `VOYAGE_API_KEY`
   - Value: your key

### 3. Upload reference case files

Use GitHub's web UI to drop `.docx` files into `backend/reference_cases/` and commit. Railway auto-deploys.

### 4. Trigger the first index

From your LegalFlow site, log in as the attorney and call:

```
POST /draft/reindex
Body: { "force": false }
```

The easiest way to trigger this is from your browser's DevTools console:

```js
await fetch('https://your-railway-url.up.railway.app/draft/reindex', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${(await window.supabase.auth.getSession()).data.session.access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ force: false })
}).then(r => r.json())
```

Or I can add a button in the UI for this — ask and it's 5 min of work.

### 5. Verify the index

Call `GET /draft/reindex/status` to see:
- Whether Voyage is configured
- How many files are on disk
- How many are indexed
- How many total chunks exist

## Updating reference cases

The indexer compares file hashes, so you only pay to re-embed files that actually changed.

Workflow:
1. Edit or add a `.docx` in this folder
2. Commit and push
3. After Railway redeploys, call `POST /draft/reindex`
4. Only the changed files get re-indexed

To fully wipe and rebuild (e.g. after changing the chunking strategy), call `POST /draft/reindex` with `{"force": true}`.

## Folder organization

The indexer infers document type and statute tags automatically from filenames and content, so you don't **have** to organize files into subfolders. But you can if you want — the indexer recursively scans all `.docx` files.

Suggested structure:
```
reference_cases/
├── fcra/
│   ├── mitchell_v_equifax_failure_to_delete.docx
│   └── kakungu_v_experian_reinsertion.docx
├── fdcpa/
│   └── kakungu_v_midland_cease_and_desist.docx
├── tcpa/
├── motions/
├── discovery/
└── responses/
```

## Naming tips

Descriptive filenames help the auto-tagging:

- ✅ `mitchell_v_equifax_FCRA_willful_reinsertion.docx` — tags will include `FCRA`, `WILLFUL`; defendant: `Equifax`
- ✅ `kakungu_v_midland_FDCPA_cease_and_desist.docx` — tags: `FDCPA`; defendant: `Midland`
- ⚠️ `draft1.docx` — works but tags will rely entirely on content analysis

Keywords the indexer recognizes:

**Statutes**: fcra, 1681, fdcpa, 1692, tcpa, 227, fbpa, 10-1-390, willful

**Defendants**: equifax, experian, transunion, chex systems, midland, lvnv, resurgent, portfolio recovery, truist, ed financial

**Document types**: motion, mtd, msj, discovery, interrogatories, rfp, rfa, response, answer, demand letter, guide

## Privacy & data

`.docx` files in this folder **are committed to GitHub**. Before committing:

- Redact client names if you don't want them in version history
- Remove or pseudonymize sensitive account numbers
- Remove personal contact info

If you need a fully private reference library, we can modify the indexer to read from Supabase Storage instead (ask and I'll add it).

## Cost per draft with RAG + Caching

| Setup | Per draft |
|---|---|
| No RAG, all files loaded | ~$0.80 |
| RAG + prompt caching (cold) | ~$0.25 |
| RAG + prompt caching (warm, same 5-min window) | **~$0.13** |

Haiku 4.5 is used for the simpler agents (intake, classification, QA) for additional savings.

## Troubleshooting

**"Voyage not configured"** — Set `VOYAGE_API_KEY` in Railway Variables and restart the service.

**"No reference chunks returned"** — Run `GET /draft/reindex/status` to check. If `total_chunks` is 0, run `POST /draft/reindex`.

**"RAG retrieval failed"** — Check Railway logs. The drafter will still work without RAG (it just won't have style references).

**Drafts look nothing like my reference cases** — Run `POST /draft/reindex` with `{"force": true}` to rebuild the index from scratch. Also check `GET /draft/reindex/status` to confirm your files are actually indexed.
