PRAGMA foreign_keys = ON;

-- Keep repeated revision cycles compatible with the current unique status key
-- without deleting evidence. An older superseded revision is moved to a unique
-- historical entity reference before a newer revision is superseded.
CREATE TRIGGER IF NOT EXISTS trg_signature_superseded_preserve
BEFORE UPDATE OF status ON signature_documents
WHEN NEW.status='superseded' AND OLD.status<>NEW.status
BEGIN
  UPDATE signature_documents
     SET entity_id=entity_id || ':superseded:' || id
   WHERE tenant_id=NEW.tenant_id
     AND document_type=NEW.document_type
     AND entity_type=NEW.entity_type
     AND entity_id=NEW.entity_id
     AND status='superseded'
     AND id<>OLD.id;
END;

-- Enforce signing order at the database boundary. Later signers cannot sign a
-- document before all lower-order requests have been completed.
CREATE TRIGGER IF NOT EXISTS trg_digital_signature_order
BEFORE INSERT ON digital_signatures
WHEN EXISTS (
  SELECT 1
    FROM signature_requests current_request
    JOIN signature_requests prior
      ON prior.tenant_id=current_request.tenant_id
     AND prior.document_id=current_request.document_id
     AND prior.signing_order<current_request.signing_order
   WHERE current_request.id=NEW.request_id
     AND prior.status<>'signed'
)
BEGIN
  SELECT RAISE(ABORT,'SIGNATURE_ORDER_PENDING');
END;

-- Built-in portal confirmation is intentionally not allowed to mint an advanced
-- or qualified electronic signature. Those levels stay reserved for a future
-- trusted provider callback/integration instead of accepting a user-typed
-- provider reference as proof.
CREATE TRIGGER IF NOT EXISTS trg_external_signature_provider_required
BEFORE INSERT ON digital_signatures
WHEN NEW.method IN ('external_advanced','external_qualified')
BEGIN
  SELECT RAISE(ABORT,'EXTERNAL_SIGNATURE_PROVIDER_REQUIRED');
END;

-- A teacher may only countersign a report book after the explicit professional
-- review/approval step. This prevents a direct API call from bypassing review.
CREATE TRIGGER IF NOT EXISTS trg_report_book_teacher_signature_requires_approval
BEFORE INSERT ON digital_signatures
WHEN EXISTS (
  SELECT 1
    FROM signature_requests r
    JOIN signature_documents d ON d.id=r.document_id AND d.tenant_id=r.tenant_id
    JOIN report_book_periods p ON p.signature_document_id=d.id AND p.tenant_id=d.tenant_id
   WHERE r.id=NEW.request_id
     AND r.signer_role='teacher'
     AND d.document_type='report_book'
     AND p.status<>'approved'
)
BEGIN
  SELECT RAISE(ABORT,'REPORT_BOOK_APPROVAL_REQUIRED');
END;

-- Once all requested confirmations are complete, the report book itself becomes
-- final/signed automatically. The signed snapshot remains immutable in the
-- signature ledger.
CREATE TRIGGER IF NOT EXISTS trg_report_book_signature_complete
AFTER UPDATE OF status ON signature_documents
WHEN NEW.document_type='report_book' AND NEW.status='complete' AND OLD.status<>NEW.status
BEGIN
  UPDATE report_book_periods
     SET status='signed',updated_at=COALESCE(NEW.completed_at,datetime('now'))
   WHERE tenant_id=NEW.tenant_id AND signature_document_id=NEW.id;
END;
