use super::*;
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
};

fn serve(status: u16, body: Vec<u8>) -> (Client, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let base = format!("http://{}", listener.local_addr().expect("address"));
    let client = Client::new(
        Url::parse(&format!("{base}/functions/v1/native-admin")).expect("endpoint"),
        Url::parse(&base).expect("origin"),
    )
    .expect("client");
    let task = thread::spawn(move || {
        let (mut socket, _) = listener.accept().expect("accept");
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .expect("timeout");
        let mut bytes = vec![];
        let mut buffer = [0; 4096];
        loop {
            let count = socket.read(&mut buffer).expect("request");
            assert_ne!(count, 0);
            bytes.extend_from_slice(&buffer[..count]);
            if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&bytes[..end]).to_lowercase();
                let length = headers
                    .lines()
                    .find_map(|line| {
                        line.strip_prefix("content-length: ")
                            .and_then(|s| s.parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if bytes.len() >= end + 4 + length {
                    break;
                }
            }
        }
        write!(
            socket,
            "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .expect("headers");
        socket.write_all(&body).expect("body");
        String::from_utf8(bytes).expect("utf8 request")
    });
    (client, task)
}

#[test]
fn local_contract_server_verifies_every_action_and_oauth_header() {
    let id = "11111111-1111-4111-8111-111111111111".to_owned();
    let actions = vec![
        Action::SearchAccounts {
            query: "Ana".into(),
            limit: 50,
        },
        Action::GetAccount {
            account_id: id.clone(),
        },
        Action::SetTester {
            account_id: id.clone(),
            enabled: true,
        },
        Action::SetModule {
            account_id: id,
            module: Module::Engineer,
            enabled: false,
        },
        Action::GetRollout,
        Action::SetRollout {
            module: Module::Calendar,
            enabled_for_all: true,
        },
        Action::ListReports {
            status: Some(Status::Submitted),
            limit: 100,
            cursor: Some("next-page".into()),
        },
        Action::GetReport {
            report_id: "report-1".into(),
        },
        Action::SetReportStatus {
            report_id: "report-1".into(),
            status: Status::Closed,
        },
    ];
    for action in actions {
        let demo = crate::state::State::new(true, crate::state::Screen::Users);
        let mut response = serde_json::json!({"version":1,"ok":true});
        match &action {
            Action::SearchAccounts { .. } => {
                response["accounts"] = serde_json::json!([demo.users[0]]);
            }
            Action::GetAccount { .. } => response["account"] = serde_json::json!(demo.users[0]),
            Action::GetRollout => response["rollout"] = serde_json::json!(demo.rollout),
            Action::ListReports { .. } => {
                response["reports"] = serde_json::json!(demo.reports);
                response["cursor"] = serde_json::Value::Null;
            }
            Action::GetReport { report_id } => {
                let mut report = demo.reports[0].clone();
                report.report_id.clone_from(report_id);
                response["report"] = serde_json::json!(report);
            }
            _ => {}
        }
        let (client, server) = serve(200, serde_json::to_vec(&response).expect("response"));
        let actual = client
            .request("test-oauth-not-a-secret", &action)
            .expect("success");
        assert_eq!(actual, response);
        let mut state = crate::state::State::new(false, crate::state::Screen::Users);
        state
            .accept(&action, &actual)
            .expect("client and UI agree on wire contract");
        let request = server.join().expect("server");
        let (headers, body) = request.split_once("\r\n\r\n").expect("http");
        assert!(
            headers
                .to_lowercase()
                .contains("authorization: bearer test-oauth-not-a-secret")
        );
        assert!(!headers.to_lowercase().contains("apikey:"));
        let mut expected = serde_json::to_value(action).expect("action");
        expected["version"] = 1.into();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(body).expect("body"),
            expected
        );
    }
}
#[test]
fn http_and_contract_errors_are_sanitized() {
    for (status, body, expected) in [
        (401, "token=private", Error::Authentication),
        (403, "private detail", Error::Denied),
        (500, "private detail", Error::Offline),
        (429, "", Error::Offline),
        (302, "", Error::Protocol),
        (200, "not-json", Error::Protocol),
        (200, r#"{"version":2,"ok":true}"#, Error::Version),
        (
            200,
            r#"{"version":1,"ok":false,"error":"secret"}"#,
            Error::Protocol,
        ),
    ] {
        let (client, server) = serve(status, body.as_bytes().to_vec());
        assert_eq!(client.request("test", &Action::GetRollout), Err(expected));
        server.join().expect("server");
        assert!(!expected.to_string().contains("private"));
    }
}
#[test]
fn limits_and_url_guards_reject_before_network() {
    let base = Url::parse("https://example.invalid").expect("base");
    for url in [
        "http://example.invalid/functions/v1/native-admin",
        "https://u:p@example.invalid/functions/v1/native-admin",
        "https://example.invalid/rest/v1/users",
        "https://example.invalid/functions/v1/native-admin?token=x",
        "https://example.invalid/functions/v1/native-admin#x",
    ] {
        assert!(Client::new(Url::parse(url).expect("url"), base.clone()).is_err());
    }
    let client =
        Client::new(base.join("functions/v1/native-admin").expect("join"), base).expect("client");
    assert_eq!(
        client.request("", &Action::GetRollout),
        Err(Error::Authentication)
    );
    for bearer in [" ", "test\r\nheader", &"x".repeat(16 * 1024 + 1)] {
        assert_eq!(
            client.request(bearer, &Action::GetRollout),
            Err(Error::Authentication)
        );
    }
    assert_eq!(
        client.request(
            "test",
            &Action::SearchAccounts {
                query: String::new(),
                limit: 51
            }
        ),
        Err(Error::Protocol)
    );
    assert_eq!(
        client.request(
            "test",
            &Action::ListReports {
                status: None,
                limit: 101,
                cursor: None
            }
        ),
        Err(Error::Protocol)
    );
    for url in [
        "https://evil.invalid/storage/v1/object/sign/testing-center-evidence/x?token=x",
        "https://example.invalid/rest/v1/users?token=x",
        "https://example.invalid/storage/v1/object/sign/testing-center-evidence/x",
    ] {
        assert_eq!(client.screenshot(url), Err(Error::Denied));
    }
}
#[test]
fn screenshots_are_bounded_and_downloaded_without_oauth() {
    let body = include_bytes!("../../fixtures/demo-report.png").to_vec();
    let (client, server) = serve(200, body.clone());
    let url = client
        .evidence_origin
        .join("storage/v1/object/sign/testing-center-evidence/report/a.png?token=signed-test")
        .expect("url");
    assert_eq!(client.screenshot(url.as_str()).expect("image"), body);
    let request = server.join().expect("server");
    assert!(!request.to_lowercase().contains("authorization:"));
    assert!(!request.to_lowercase().contains("apikey:"));
    let (client, server) = serve(200, b"<html>not an image</html>".to_vec());
    let url = client
        .evidence_origin
        .join("storage/v1/object/sign/testing-center-evidence/report/a.png?token=test")
        .expect("url");
    assert_eq!(client.screenshot(url.as_str()), Err(Error::Protocol));
    server.join().expect("server");
}
