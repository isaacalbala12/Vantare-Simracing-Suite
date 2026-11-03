//! One versioned outbound report body for the three Services entry points.
use crate::protocol::report_document::ReportV2;
use crate::{Error, Result, content_hash};

pub(crate) enum Kind {
    Simple,
    Triage(serde_json::Value, serde_json::Value),
    Diagnostic(serde_json::Value),
}

pub(crate) fn key_from_id(id: &str) -> String {
    format!("draft_{}", content_hash(id.as_bytes()))
}

pub(crate) fn id_from_key(key: &str) -> Result<String> {
    let hex = key.strip_prefix("draft_").ok_or(Error::Protocol)?;
    if hex.len() != 64 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(Error::Protocol);
    }
    let mut uuid = hex.as_bytes()[..32].to_vec();
    uuid[12] = b'4';
    uuid[16] = b'8';
    let uuid = std::str::from_utf8(&uuid).map_err(|_| Error::Protocol)?;
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &uuid[..8],
        &uuid[8..12],
        &uuid[12..16],
        &uuid[16..20],
        &uuid[20..32]
    ))
}

pub(crate) fn build(
    report_id: String,
    channel: &str,
    title: String,
    body: String,
    idempotency_key: String,
    kind: Kind,
) -> Result<ReportV2> {
    if !matches!(channel, "nightly" | "testers" | "master")
        || !valid_id(&report_id)
        || !idempotency_key.starts_with("draft_")
        || idempotency_key.len() != 70
    {
        return Err(Error::Protocol);
    }
    let (variant, context, attachments) = match kind {
        Kind::Simple => ("simple", None, None),
        Kind::Triage(context, attachments) => ("triage", Some(context), Some(attachments)),
        Kind::Diagnostic(context) => ("diagnostic", Some(context), None),
    };
    Ok(ReportV2 {
        contract_version: "testing.report.v2".into(),
        report_id,
        channel: channel.into(),
        title,
        body,
        consent: true,
        idempotency_key,
        variant: variant.into(),
        context,
        attachments,
    })
}

pub(crate) fn valid_id(id: &str) -> bool {
    id.len() == 36
        && id.chars().enumerate().all(|(index, c)| {
            if [8, 13, 18, 23].contains(&index) {
                c == '-'
            } else if index == 14 {
                ('1'..='5').contains(&c)
            } else if index == 19 {
                matches!(c, '8' | '9' | 'a' | 'b')
            } else {
                c.is_ascii_hexdigit()
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_constructor_closes_all_three_shapes_without_account_field() {
        let id = "18960000-0000-4000-8000-000000000072".to_string();
        let key = key_from_id(&id);
        for (kind, expected) in [
            (Kind::Simple, "simple"),
            (
                Kind::Triage(serde_json::json!({}), serde_json::json!([])),
                "triage",
            ),
            (
                Kind::Diagnostic(serde_json::json!({"module":"hub"})),
                "diagnostic",
            ),
        ] {
            let dto = build(
                id.clone(),
                "testers",
                "Synthetic".into(),
                "Synthetic".into(),
                key.clone(),
                kind,
            )
            .unwrap();
            let json = serde_json::to_value(dto).unwrap();
            assert_eq!(json["contract_version"], "testing.report.v2");
            assert_eq!(json["variant"], expected);
            assert!(json.get("account_id").is_none());
        }
    }

    #[test]
    fn diagnostic_id_is_stable_and_accepted_by_the_edge() {
        let key = format!("draft_{}", "a".repeat(64));
        let id = id_from_key(&key).unwrap();
        assert!(valid_id(&id));
        assert_eq!(id_from_key(&key).unwrap(), id);
        assert!(id_from_key("draft_invalid").is_err());
    }
}
