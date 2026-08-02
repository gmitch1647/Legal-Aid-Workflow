import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-500 mb-8">Last updated: August 2, 2026</p>

        <div className="prose prose-slate prose-sm max-w-none space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Acceptance of Terms</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              By accessing or using the LegalFlow platform ("Service") operated by LegalFlow ("we," "our," or "us"),
              you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not
              use the Service. These Terms apply to all users, including attorneys, staff attorneys, referral partners,
              and clients.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. Description of Service</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              LegalFlow is a legal case management platform designed for consumer protection attorneys. The Service
              provides tools for case pipeline management, AI-assisted document drafting, credit report analysis,
              electronic signatures, client management, referral partner tracking, commission management, and
              integrations with third-party services including QuickBooks Online.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">3. User Accounts</h2>
            <ul className="text-sm text-slate-700 leading-relaxed list-disc pl-5 space-y-1">
              <li>You must provide accurate and complete information when creating an account.</li>
              <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
              <li>You are responsible for all activities that occur under your account.</li>
              <li>You must notify us immediately of any unauthorized use of your account.</li>
              <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">4. Authorized Use</h2>
            <p className="text-sm text-slate-700 leading-relaxed">You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to:</p>
            <ul className="text-sm text-slate-700 leading-relaxed list-disc pl-5 space-y-1">
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Upload malicious software or harmful content</li>
              <li>Attempt to gain unauthorized access to the Service or its systems</li>
              <li>Interfere with or disrupt the Service or servers</li>
              <li>Share account credentials with unauthorized individuals</li>
              <li>Use the AI-generated content without professional legal review</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">5. AI-Generated Content</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              The Service uses artificial intelligence to assist with document drafting, credit report analysis, and
              other legal workflows. AI-generated content is provided as a starting point and must be reviewed,
              verified, and approved by a licensed attorney before use. We do not guarantee the accuracy, completeness,
              or legal sufficiency of AI-generated content. The practicing attorney bears full responsibility for all
              documents filed or sent on behalf of clients.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. Electronic Signatures</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              The Service provides electronic signature functionality. By using this feature, you acknowledge that
              electronic signatures created through the Service are intended to be legally binding under the federal
              ESIGN Act (15 U.S.C. 7001) and applicable state Uniform Electronic Transactions Acts (UETA). An audit
              trail including IP address, timestamp, and signer identity is recorded for each signature.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Third-Party Integrations</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              The Service integrates with third-party platforms including QuickBooks Online, Resend, Twilio, and others.
              Your use of these integrations is subject to the respective third party's terms of service and privacy
              policy. We are not responsible for the availability, accuracy, or practices of third-party services.
              You authorize us to transmit relevant data to connected third-party services as necessary to provide
              the integrated functionality you have enabled.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">8. Confidentiality and Data</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              We understand that legal data is highly confidential. We implement security measures as described in our
              Privacy Policy. However, you are responsible for ensuring that your use of the Service complies with all
              applicable confidentiality obligations, including attorney-client privilege. You should not upload
              information to the platform that you are not authorized to store electronically.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">9. Intellectual Property</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              The Service, including its design, code, features, and branding, is owned by LegalFlow and protected by
              intellectual property laws. You retain ownership of all content you upload to the Service. By uploading
              content, you grant us a limited license to store, process, and display that content as necessary to
              provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">10. Limitation of Liability</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, LEGALFLOW SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR
              BUSINESS OPPORTUNITIES, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY SHALL NOT EXCEED THE
              AMOUNT YOU PAID FOR THE SERVICE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">11. Disclaimer of Warranties</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
              WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE. WE DO NOT PROVIDE
              LEGAL ADVICE. THE SERVICE IS A TOOL FOR LICENSED ATTORNEYS AND DOES NOT SUBSTITUTE FOR PROFESSIONAL
              LEGAL JUDGMENT.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">12. Indemnification</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              You agree to indemnify and hold harmless LegalFlow and its officers, directors, employees, and agents
              from any claims, damages, losses, or expenses (including reasonable attorney's fees) arising from your
              use of the Service or violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">13. Termination</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              We may suspend or terminate your access to the Service at any time for violation of these Terms or for
              any other reason with reasonable notice. Upon termination, your right to use the Service ceases
              immediately. You may request export of your data prior to account deletion.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">14. Governing Law</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the State of Georgia,
              without regard to its conflict of law provisions. Any disputes arising from these Terms shall be
              resolved in the courts of the State of Georgia.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">15. Changes to Terms</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify users of material changes via
              email or in-app notification. Continued use of the Service after changes constitutes acceptance of
              the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">16. Contact</h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              For questions about these Terms, contact us at:
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
