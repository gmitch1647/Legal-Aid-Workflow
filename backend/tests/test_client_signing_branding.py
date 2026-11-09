"""Client signing invitations use LegalFlow, without changing legal identities."""
import asyncio
import base64
from email import message_from_string
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from routers import esign, signing, w9
from utils import email_service
from tests import test_signing_pdf_normalization as signing_fixtures
from tests.test_signing_pdf_normalization import (
    _FakeSigningSupabase, _FakeUpload,
)


async def _gary(_authorization):
    return {"id": "attorney-1", "full_name": "Gary Mitchell", "role": "attorney"}


class SenderHeaderTests(unittest.TestCase):
    def _resend(self, senders, status_code=200, **send_options):
        client = MagicMock()
        client.post = AsyncMock(return_value=SimpleNamespace(status_code=status_code, text='{}'))
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        results = []
        with patch("httpx.AsyncClient", return_value=client), patch.object(email_service, "SMTP_HOST", ""):
            for sender in senders:
                with patch.dict(os.environ, {"RESEND_API_KEY": "mock-test-key", "EMAIL_FROM": sender}):
                    results.append(asyncio.run(email_service.send_email(
                        "client@example.test", "Signature Required", "<p>From: LegalFlow</p>", **send_options
                    )))
        return client.post, results

    def test_headers_strip_legacy_names_and_preserve_verified_mailbox(self):
        for sender in ('signing@example.test', 'Gary Mitchell <signing@example.test>', 'LegalFlow <signing@example.test>'):
            with self.subTest(sender=sender):
                self.assertEqual(email_service._platform_from_header(sender), 'LegalFlow <signing@example.test>')
        for sender in ('', 'Gary Mitchell'):
            with self.subTest(sender=sender), self.assertRaises(ValueError):
                email_service._platform_from_header(sender)

    def test_resend_preserves_recipient_attachment_and_reply_to(self):
        post, result = self._resend(
            ['Gary Mitchell <signing@example.test>'], idempotency_key='request-1',
            attachments=[{'filename': 'agreement.pdf', 'content': b'%PDF-test'}],
            reply_to='thread@example.test',
        )
        self.assertEqual(result, [True])
        payload = post.await_args.kwargs['json']
        self.assertEqual(payload['from'], 'LegalFlow <signing@example.test>')
        self.assertEqual(payload['to'], ['client@example.test'])
        self.assertEqual(payload['reply_to'], ['thread@example.test'])
        self.assertEqual(base64.b64decode(payload['attachments'][0]['content']), b'%PDF-test')

    def test_retry_key_tracks_sender_mailbox_but_not_discarded_personal_name(self):
        post, results = self._resend([
            'Gary Mitchell <first@example.test>', 'LegalFlow <first@example.test>',
            'LegalFlow <second@example.test>',
        ], idempotency_key='request-1')
        self.assertEqual(results, [True, True, True])
        keys = [call.kwargs['headers']['Idempotency-Key'] for call in post.await_args_list]
        self.assertEqual(keys[0], keys[1])
        self.assertNotEqual(keys[1], keys[2])

    def test_invalid_resend_sender_does_not_raise_or_send(self):
        post, results = self._resend(['Gary Mitchell'])
        self.assertEqual(results, [False])
        post.assert_not_awaited()

    def test_smtp_uses_legalflow_header_and_bare_envelope_address(self):
        server = MagicMock()
        with patch.dict(os.environ, {'RESEND_API_KEY': ''}), patch.object(email_service, 'SMTP_HOST', 'smtp.example.test'), patch.object(
            email_service, 'SMTP_FROM_EMAIL', 'Gary Mitchell <signing@example.test>'
        ), patch.object(email_service.smtplib, 'SMTP', return_value=server):
            result = asyncio.run(email_service.send_email(
                'client@example.test', 'Signature Required', '<p>From: LegalFlow</p>', reply_to='thread@example.test'
            ))
        self.assertTrue(result)
        sender, recipients, content = server.sendmail.call_args.args
        self.assertEqual(sender, 'signing@example.test')
        self.assertEqual(recipients, ['client@example.test'])
        message = message_from_string(content)
        self.assertEqual(message['From'], 'LegalFlow <signing@example.test>')
        self.assertEqual(message['Reply-To'], 'thread@example.test')

    def test_failed_resend_falls_back_to_legalflow_smtp_header(self):
        client = MagicMock()
        client.post = AsyncMock(return_value=SimpleNamespace(status_code=503, text='temporary failure'))
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        server = MagicMock()
        with patch.dict(os.environ, {'RESEND_API_KEY': 'mock-test-key', 'EMAIL_FROM': 'Gary Mitchell <api@example.test>'}), patch(
            'httpx.AsyncClient', return_value=client
        ), patch.object(email_service, 'SMTP_HOST', 'smtp.example.test'), patch.object(
            email_service, 'SMTP_FROM_EMAIL', 'Gary Mitchell <smtp@example.test>'
        ), patch.object(email_service.smtplib, 'SMTP', return_value=server):
            self.assertTrue(asyncio.run(email_service.send_email('client@example.test', 'Sign', '<p>LegalFlow</p>')))
        self.assertEqual(message_from_string(server.sendmail.call_args.args[2])['From'], 'LegalFlow <smtp@example.test>')


class ClientInvitationBrandingTests(unittest.TestCase):
    def assert_branded(self, sender):
        body = sender.await_args.kwargs['body']
        self.assertIn('<strong>From:</strong> LegalFlow', body)
        self.assertNotIn('Gary Mitchell', body)
        self.assertEqual(sender.await_args.kwargs['to'], 'client@example.test')

    def test_uploaded_document_invitation_uses_platform_not_operator_name(self):
        supabase = _FakeSigningSupabase()
        with patch.object(signing, 'get_supabase', return_value=supabase), patch.object(
            signing, '_get_current_user', _gary
        ), patch('utils.email_service.send_email', new=AsyncMock(return_value=True)) as send, patch.object(
            signing, 'notify_attorney_of_esign_event', new=AsyncMock()
        ):
            asyncio.run(signing.create_signing_session(
                file=_FakeUpload(b'%PDF-1.7\nsource', 'agreement.pdf', 'application/pdf'),
                signer_name='Client Example', signer_email='client@example.test', title='Settlement Agreement',
                document_type='settlement', message='Please review and sign.', authorization='Bearer mock',
            ))
        self.assert_branded(send)
        record = supabase.queries['signing_sessions'].insert_payloads[0]
        self.assertEqual(record['sent_by'], 'attorney-1')
        self.assertEqual(record['attorney_name'], 'Gary Mitchell')
        self.assertEqual(record['signer_name'], 'Client Example')

    def test_generated_closing_statement_invitation_is_branded(self):
        supabase = _FakeSigningSupabase()
        with patch.object(signing, 'get_supabase', return_value=supabase), patch(
            'utils.email_service.send_email', new=AsyncMock(return_value=True)
        ) as send, patch.object(signing, 'notify_attorney_of_esign_event', new=AsyncMock()):
            asyncio.run(signing.create_generated_pdf_signing_session(
                pdf_bytes=b'%PDF-1.7\nsource', filename='closing.pdf', title='Closing Statement',
                document_type='closing_statement', signer_name='Client Example', signer_email='client@example.test',
                case_id='case-1', client_id='client-1', message='Please review and sign.', profile=asyncio.run(_gary(None)),
            ))
        self.assert_branded(send)
        self.assertEqual(supabase.queries['signing_sessions'].insert_payloads[0]['sent_by'], 'attorney-1')

    def test_corrected_invitation_is_branded_without_changing_signed_original(self):
        source = {
            'id': 'original', 'title': 'Settlement Agreement', 'document_type': 'settlement',
            'original_path': 'signing/original/source.pdf', 'signed_path': 'signing/original/signed.pdf',
            'signer_name': 'Keshaun Wiggins', 'signer_email': 'client@example.test', 'status': 'signed',
            'case_id': 'case-1', 'client_id': 'client-1', 'sent_by': 'attorney-1',
        }
        original = source.copy()
        supabase = _FakeSigningSupabase(
            downloads={source['original_path']: signing_fixtures.SigningPdfNormalizationTests()._two_party_execution_pdf()},
            table_rows={'signing_sessions': [source]},
        )
        with patch.object(signing, 'get_supabase', return_value=supabase), patch.object(
            signing, '_get_current_user', _gary
        ), patch('utils.email_service.send_email', new=AsyncMock(return_value=True)) as send, patch.object(
            signing, 'notify_attorney_of_esign_event', new=AsyncMock()
        ):
            asyncio.run(signing.create_corrected_signing_request(
                signing.CorrectedSigningRequest(source_session_id='original', confirmed=True), authorization='Bearer mock'
            ))
        self.assert_branded(send)
        self.assertEqual(source, original)

    def test_oise_invitation_branded_but_preserves_esther_and_contract_content(self):
        supabase = _FakeSigningSupabase(table_rows={
            'cases': [{'id': 'case-1', 'client_id': 'client-1', 'plaintiff_name': 'Client Example', 'status': 'attorney_review'}],
            'profiles': [
                {'id': 'client-1', 'full_name': 'Client Example', 'email': 'client@example.test', 'assigned_attorney_id': 'esther-1'},
                {'id': 'esther-1', 'full_name': 'Esther Oise', 'email': 'oiselaw@example.test', 'role': 'staff_attorney', 'firm_name': 'Oise Law Group PC'},
            ],
        })
        with patch.object(signing, 'get_supabase', return_value=supabase), patch.object(
            signing, '_get_current_user', _gary
        ), patch('utils.email_service.send_email', new=AsyncMock(return_value=True)) as send, patch.object(
            signing, 'notify_attorney_of_esign_event', new=AsyncMock()
        ):
            asyncio.run(signing.send_oise_engagement_contract(
                signing.EngagementContractSendRequest(case_id='case-1', confirmed=True), authorization='Bearer mock'
            ))
        self.assert_branded(send)
        self.assertEqual(supabase.queries['signing_sessions'].insert_payloads[0]['attorney_name'], 'Esther Oise')
        self.assertEqual(supabase.bucket.uploads[0]['file'], signing.OISE_ENGAGEMENT_TEMPLATE_PATH.read_bytes())

    def test_w9_and_reminder_do_not_render_operator_name(self):
        row = {'id': 'request-1', 'title': 'Form W-9', 'signer_name': 'Client Example', 'signer_email': 'client@example.test',
               'token': 'mock-token', 'attorney_name': 'Gary Mitchell'}
        for function in (w9._send_w9_signing_notification, esign._send_in_app_reminder):
            with self.subTest(function=function.__name__), patch('utils.email_service.send_email', new=AsyncMock(return_value=True)) as send:
                asyncio.run(function(row))
                self.assertNotIn('Gary Mitchell', send.await_args.kwargs['body'])
                self.assertEqual(send.await_args.kwargs['to'], 'client@example.test')

    def test_signer_pages_show_platform_and_not_stored_operator_label(self):
        frontend = Path(__file__).resolve().parents[2] / 'frontend/src/pages'
        signer_page = (frontend / 'SignDocument.jsx').read_text()
        w9_page = (frontend / 'W9Form.jsx').read_text()
        self.assertIn('From: LegalFlow', signer_page)
        self.assertNotIn('From: {session.attorney_name}', signer_page)
        self.assertIn(' by LegalFlow.', w9_page)
        self.assertNotIn(' by ${request.attorney_name}', w9_page)


if __name__ == '__main__':
    unittest.main()
