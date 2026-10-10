use super::remember_receipt;
use crate::services::protocol::report_document::{Fields, Receipt};
#[test]
fn server_receipts_keep_identity_state_and_date_without_duplicating_retries() {
    let mut receipts = vec![];
    let fields = Fields {
        action_text: "Título enviado".into(),
        observed_text: "Texto privado".into(),
        module: "hub".into(),
        ..Default::default()
    };
    let receipt = Receipt {
        report_id: "report_0123456789abcdef".into(),
        report_state: "submitted".into(),
        idempotent: false,
        created_at: "2026-10-05T20:00:00Z".into(),
    };
    remember_receipt(&mut receipts, fields, receipt.clone());
    let mut retry = receipt.clone();
    retry.idempotent = true;
    remember_receipt(&mut receipts, Fields::default(), retry);
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0].0.action_text, "Título enviado");
    assert_eq!(receipts[0].0.module, "hub");
    assert!(receipts[0].0.observed_text.is_empty());
    assert_eq!(receipts[0].1.report_state, receipt.report_state);
    assert_eq!(receipts[0].1.created_at, receipt.created_at);
    assert!(receipts[0].1.idempotent);
}
