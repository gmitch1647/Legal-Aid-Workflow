# LegalFlow — Legal Case Management Platform

A complete autonomous legal CRM platform for consumer protection attorneys handling FCRA, FDCPA, and TCPA cases. Features an AI-powered agent pipeline that automatically analyzes cases and drafts federal court complaints.

## Architecture

- **Frontend**: React + Tailwind CSS (deploy to Lovable or Vercel)
- **Backend**: Python FastAPI (deploy to Railway)
- **Database & Auth**: Supabase (PostgreSQL + Auth + Storage)
- **AI Agents**: Anthropic Claude API (claude-sonnet-4-5-20250514)
- **Document Generation**: python-docx

## Three Portals

### 1. Attorney Portal
- Dashboard with case pipeline summary and activity feed
- Kanban board for case management (8 stages from Submitted to Closed)
- Full case detail with agent pipeline status, complaint viewer, and inline editing
- Client management with profiles, notes, and document tracking
- Defendant database management
- Settings for attorney profile, notifications, and branding

### 2. Client Portal
- Self-service case submission with 5-step guided form
- Case status tracking with plain-language progress indicators
- Document upload (credit reports, dispute letters, etc.)
- Secure messaging with attorney
- Document download when complaints are approved

### 3. AI Agent Pipeline
Seven autonomous agents that run in sequence when a case is approved:
1. **Intake Analyst** — Extracts structured facts from case documents
2. **Case Classifier** — Identifies applicable statutes (FCRA, FDCPA, TCPA, GA FBPA)
3. **Legal Researcher** — Compiles statutory language, case law, and count structure
4. **Damages Analyst** — Calculates damages and generates pleading language
5. **Complaint Drafter** — Drafts complete NDGA-style complaint
6. **QA Reviewer** — Reviews against 10-point checklist
7. **Document Formatter** — Generates formatted .docx complaint and strategy memo

## Setup Instructions

### Prerequisites
- Python 3.10+
- Node.js 18+
- A Supabase project
- An Anthropic API key

### 1. Clone the Repository

```bash
git clone https://github.com/gmitch1647/legal-aid-workflow.git
cd legal-aid-workflow
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the migration file:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
3. Create a **Storage bucket** called `documents` (set to private)
4. Get your keys from **Settings > API**:
   - Project URL (`SUPABASE_URL`)
   - `anon` public key (`SUPABASE_ANON_KEY`)
   - `service_role` secret key (`SUPABASE_SERVICE_KEY`)

### 3. Get an Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Save it as `ANTHROPIC_API_KEY`

### 4. Set Up the Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file from example
cp .env.example .env
# Edit .env and fill in your keys:
#   ANTHROPIC_API_KEY=sk-ant-...
#   SUPABASE_URL=https://xxx.supabase.co
#   SUPABASE_SERVICE_KEY=eyJ...
#   SUPABASE_ANON_KEY=eyJ...
#   EMAIL_FROM=noreply@yourfirm.com
#   SMTP_HOST=smtp.gmail.com
#   SMTP_PORT=587
#   SMTP_USER=your_email@gmail.com
#   SMTP_PASSWORD=your_app_password
#   FRONTEND_URL=http://localhost:5173

# Run the backend
uvicorn main:app --reload --port 8000
```

### 5. Set Up the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Create .env file from example
cp .env.example .env.local
# Edit .env.local:
#   VITE_SUPABASE_URL=https://xxx.supabase.co
#   VITE_SUPABASE_ANON_KEY=eyJ...
#   VITE_API_URL=http://localhost:8000

# Run the frontend
npm run dev
```

### 6. Create the Attorney Account

In your Supabase dashboard:
1. Go to **Authentication > Users** and create a user
2. Go to **Table Editor > profiles** and add a row:
   - `id`: the user's UUID from auth
   - `role`: `attorney`
   - `full_name`: Your name
   - `email`: Your email

### 7. Deploy to Production

#### Backend → Railway
1. Connect your GitHub repo to [Railway](https://railway.app)
2. Set the root directory to `backend`
3. Add all environment variables from `.env`
4. Railway will auto-deploy on push to main

#### Frontend → Lovable (or Vercel/Netlify)
1. Connect your GitHub repo
2. Set the root directory to `frontend`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`)

## API Endpoints

### Authentication
- `POST /auth/register` — Attorney registers a client

### Cases
- `POST /cases/submit` — Client submits new case
- `GET /cases` — List cases (filtered by role)
- `GET /cases/{id}` — Full case detail
- `PATCH /cases/{id}/status` — Update status
- `POST /cases/{id}/approve-for-processing` — Trigger agent pipeline
- `POST /cases/{id}/approve-complaint` — Approve final complaint
- `POST /cases/{id}/request-revision` — Request revision (max 3)
- `POST /cases/{id}/deny` — Deny case with reason
- `GET /cases/{id}/download/complaint` — Download complaint .docx
- `GET /cases/{id}/download/memo` — Download strategy memo .docx
- `GET /cases/{id}/pipeline-status` — Agent pipeline status
- `POST /cases/{id}/rerun-agent/{agent_name}` — Rerun specific agent

### Documents
- `POST /cases/{id}/documents` — Upload document
- `GET /cases/{id}/documents` — List case documents

### Defendants
- `GET /defendants` — List all defendants
- `POST /defendants` — Add defendant
- `PATCH /defendants/{id}` — Update defendant

### Messages
- `GET /cases/{id}/messages` — Get message thread
- `POST /cases/{id}/messages` — Send message

### Notifications
- `GET /notifications` — Get notifications
- `PATCH /notifications/{id}/read` — Mark as read

## Database Schema

See `supabase/migrations/001_initial_schema.sql` for the complete schema including:
- 9 tables with full constraints
- Row Level Security policies
- 10 pre-populated defendant records
- Indexes for query performance

## Environment Variables

### Backend (.env)
| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `EMAIL_FROM` | Sender email address |
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP server port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password |
| `FRONTEND_URL` | Frontend URL for email links |

### Frontend (.env.local)
| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_API_URL` | Backend API URL |

## Project Structure

```
├── backend/
│   ├── main.py              # FastAPI application entry point
│   ├── agents/              # AI agent pipeline modules
│   │   ├── orchestrator.py  # Pipeline coordinator
│   │   ├── intake_analyst.py
│   │   ├── case_classifier.py
│   │   ├── legal_researcher.py
│   │   ├── damages_analyst.py
│   │   ├── complaint_drafter.py
│   │   └── qa_reviewer.py
│   ├── routers/             # API route handlers
│   │   ├── auth.py
│   │   ├── cases.py
│   │   ├── defendants.py
│   │   ├── documents.py
│   │   ├── messages.py
│   │   └── notifications.py
│   ├── models/
│   │   └── schemas.py       # Pydantic models
│   ├── utils/
│   │   ├── formatter.py     # DOCX document generator
│   │   ├── supabase_client.py
│   │   ├── document_reader.py
│   │   ├── email_service.py
│   │   ├── notifications.py
│   │   └── defendants_db.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main app with routing and auth
│   │   ├── pages/
│   │   │   ├── attorney/    # Attorney portal pages
│   │   │   └── client/      # Client portal pages
│   │   ├── components/      # Shared UI components
│   │   └── lib/             # API client and Supabase config
│   └── package.json
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
└── README.md
```

## License

Proprietary — All rights reserved.
