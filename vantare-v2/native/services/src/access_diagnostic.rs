//! Diagnóstico local cerrado; nunca copia cuerpos, URLs ni identidad remota.
use crate::http::Response;
use std::io::Write;

#[derive(Clone, Copy)]
pub(crate) enum Route {
    License,
    Authorize,
}

fn line(route: Route, response: &Response) -> String {
    let route = match route {
        Route::License => "native-license",
        Route::Authorize => "native-account-authorize",
    };
    let body = response.json::<serde_json::Value>().ok();
    let code = match body
        .as_ref()
        .and_then(|v| v.get("error"))
        .and_then(serde_json::Value::as_str)
    {
        Some(
            code @ ("unauthorized" | "forbidden" | "bridge_unavailable" | "device_limit"
            | "account_conflict" | "invalid_request" | "request_too_large" | "rate_limited"
            | "method_not_allowed"),
        ) => code,
        None if (200..300).contains(&response.status) => "none",
        _ => "unrecognized",
    };
    format!(
        "account-rights: route={route} status={} code={code}",
        response.status
    )
}

pub(crate) fn record(route: Route, response: &Response) {
    let _written = writeln!(std::io::stderr(), "{}", line(route, response));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_text_and_identifiers_never_enter_access_diagnostics() {
        for (status, body, expected) in [
            (
                503,
                r#"{"error":"bridge_unavailable","message":"private@example.invalid"}"#,
                "bridge_unavailable",
            ),
            (
                403,
                r#"{"error":"private@example.invalid","token":"secret"}"#,
                "unrecognized",
            ),
            (
                200,
                r#"{"credential":{"subject":"private-id","signature":"secret"}}"#,
                "none",
            ),
            (502, "private response", "unrecognized"),
        ] {
            let response = Response {
                status,
                body: body.as_bytes().to_vec(),
                client_token: None,
                retry_after: None,
                server_time: None,
            };
            for (route, name) in [
                (Route::License, "native-license"),
                (Route::Authorize, "native-account-authorize"),
            ] {
                assert_eq!(
                    line(route, &response),
                    format!("account-rights: route={name} status={status} code={expected}")
                );
            }
        }
    }
}
