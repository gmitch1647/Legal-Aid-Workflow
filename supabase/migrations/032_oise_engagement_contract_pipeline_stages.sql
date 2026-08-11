-- Add the shared stages used by the Oise Law engagement-contract workflow.
-- The guard makes this data migration safe to run more than once.
DO $$
DECLARE
  needs_doc_sent boolean;
  needs_documents_signed boolean;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1 FROM public.pipeline_stages
    WHERE slug = 'doc_sent_for_signature' AND pipeline_id IS NULL
  ) INTO needs_doc_sent;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.pipeline_stages
    WHERE slug = 'documents_signed' AND pipeline_id IS NULL
  ) INTO needs_documents_signed;

  IF needs_doc_sent OR needs_documents_signed THEN
    UPDATE public.pipeline_stages
    SET position = position + 2
    WHERE pipeline_id IS NULL AND position >= 3;
  END IF;

  IF needs_doc_sent THEN
    INSERT INTO public.pipeline_stages (
      slug, name, position, color, description, is_system, pipeline_id
    ) VALUES (
      'doc_sent_for_signature',
      'Doc Sent for Signature',
      3,
      'amber',
      'Client representation agreement has been sent and is awaiting signature.',
      true,
      NULL
    );
  END IF;

  IF needs_documents_signed THEN
    INSERT INTO public.pipeline_stages (
      slug, name, position, color, description, is_system, pipeline_id
    ) VALUES (
      'documents_signed',
      'Documents Signed',
      4,
      'emerald',
      'The client completed the representation agreement signature.',
      true,
      NULL
    );
  END IF;
END $$;
