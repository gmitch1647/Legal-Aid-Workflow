import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-8">Last updated: August 2, 2026</p>

        <div className="prose prose-slate prose-sm max-w-none space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Introduction</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              LegalFlow ("we," "our," or "us") operates the LegalFlow platform at legalflow.me. This Privacy Policy
              explains how we collect, use, disclose, and safeguard your information when you use our legal case
              management platform. We are committed to protecting the privacy and confidentiality of all personal
              information entrusted to us, particularly given the sensitive nature of legal matters.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. Information We Collect</h2>
            <p className="text-sm text-slate-700 leading-relaxed"><strong>Account Information:</strong> Name, email address, phone number, mailing address, and professional credentials (bar number, firm name) for attorneys and staff.</p>
            <p className="text-sm text-slate-700 leading-relaxed"><strong>Client Information:</strong> Names, contact details, case facts, legal documents, and other information provided by attorneys on behalf of their clients for case management purposes.</p>
            <p className="text-sm text-slate-700 leading-relaxed"><strong>Personally Identifiable Information (PII):</strong> When uploaded by authorized attorneys, we may store sensitive documents such as identification cards, Social Security documentation, and similar records necessary for legal proceedings.</p>
            <p className="text-sm text-slate-700 leading-relaxed"><strong>Financial Information:</strong> Settlement amounts, commission records, and referral fee data used for accounting and payment tracking purposes.</p>
            <p className="text-sm text-slate-700 leading-relaxed"><strong>Usage Data:</strong> Log data, browser type, pages visited, and timestamps to improve our platform.</p>
            <p className="text-sm text-slate-700 leading-relaxed"><strong>Third-Party Integrations:</strong> When you connect third-party services (such as QuickBooks Online, Resend, or Twilio), we store authentication tokens necessary to maintain those connections. We do not store your passwords for third-party services.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">3. How We Use Your Information</h2>
            <p className="text-sm text-slate-700 leading-relaxed">We use the information we collect to:</p>
            <ul className="text-sm text-slate-700 leading-relaxed list-disc pl-5 space-y-1">
              <li>Provide and maintain the LegalFlow platform and its features</li>
              <li>Manage attorney-client case workflows, including document drafting and e-signatures</li>
              <li>Send transactional emails (account invitations, signing requests, case notifications)</li>
              <li>Process and track referral partner commissions</li>
              <li>Sync financial data with connected accounting software (e.g., QuickBooks)</li>
              <li>Generate AI-assisted legal documents using anonymized or authorized case data</li>
              <li>Improve platform functionality and user experience</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">4. Data Sharing and Disclosure</h2>
            <p className="text-sm text-slate-700 leading-relaxed">We do not sell your personal information. We may share information with:</p>
            <ul className="text-sm text-slate-700 leading-relaxed list-disc pl-5 space-y-1">
              <li><strong>Service Providers:</strong> Third-party services that help us operate the platform (Supabase for data storage, Anthropic for AI services, Resend for email delivery, Twilio for SMS).</li>
              <li><strong>Connected Integrations:</strong> When you authorize connections (e.g., QuickBooks), relevant data is shared with those services per your authorization.</li>
              <li><strong>Legal Requirements:</strong> We may disclose information if required by law, subpoena, or court order.</li>
              <li><strong>With Your Consent:</strong> We may share information with your explicit consent.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">5. Data Security</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              We implement industry-standard security measures to protect your data, including encryption in transit (TLS/SSL),
              encrypted storage, role-based access controls, and secure authentication via Supabase Auth. PII documents
              are stored in access-controlled storage buckets. However, no method of electronic storage is 100% secure,
              and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. Data Retention</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              We retain your information for as long as your account is active or as needed to provide services. Case data
              and legal documents are retained in accordance with applicable legal retention requirements. You may request
              deletion of your account and associated data by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Your Rights</h2>
            <p className="text-sm text-slate-700 leading-relaxed">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="text-sm text-slate-700 leading-relaxed list-disc pl-5 space-y-1">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your personal information</li>
              <li>Object to or restrict processing of your data</li>
              <li>Withdraw consent for optional data processing</li>
            </ul>
            <p className="text-sm text-slate-700 leading-relaxed mt-2">
              To exercise these rights, contact us at the email address below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">8. Third-Party Services</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              Our platform integrates with third-party services including Anthropic (AI), Supabase (database and authentication),
              Resend (email), Twilio (SMS), and Intuit QuickBooks (accounting). Each service has its own privacy policy
              governing its use of data. We encourage you to review their respective privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">9. Changes to This Policy</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify registered users of material changes
              via email or an in-app notification. Continued use of the platform after changes constitutes acceptance
              of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">10. Contact Us</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              If you have questions about this Privacy Policy or our data practices, contact us at:
            </p>
            <p className="text-sm text-slate-700 leading-relaxed mt-2">
              <strong>LegalFlow</strong><br />
              Email: support@legalflow.me
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
