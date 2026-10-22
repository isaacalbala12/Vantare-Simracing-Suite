//! Prueba manual: navegador real únicamente en cuenta y escritorio QA privados.
use std::{
    io::{Read, Write},
    net::TcpListener,
    time::{Duration, Instant},
};

#[test]
#[ignore = "requires a dedicated standard QA account and private desktop; opens Chrome"]
fn chrome_opens_special_url_with_broken_https_on_a_private_desktop() {
    use windows_sys::Win32::System::{
        StationsAndDesktops::{GetThreadDesktop, GetUserObjectInformationW, UOI_NAME},
        Threading::GetCurrentThreadId,
    };
    assert!(
        std::env::var("USERNAME")
            .expect("QA username")
            .starts_with("RC5Browser_")
    );
    let mut name = [0_u16; 256];
    let mut required = 0;
    // SAFETY: solo consulta el escritorio del hilo actual, sin activarlo.
    let success = unsafe {
        GetUserObjectInformationW(
            GetThreadDesktop(GetCurrentThreadId()),
            UOI_NAME,
            name.as_mut_ptr().cast(),
            512,
            &raw mut required,
        )
    };
    assert_ne!(success, 0, "desktop name");
    let end = name.iter().position(|ch| *ch == 0).expect("terminator");
    let desktop = String::from_utf16(&name[..end]).expect("desktop");
    assert!(
        desktop.starts_with("RC5Browser_"),
        "private desktop required"
    );
    assert!(
        !super::super::handler_available("https"),
        "broken HTTPS case required"
    );
    let browsers = super::registered();
    assert!(
        browsers
            .first()
            .is_some_and(|browser| browser.name == "Google Chrome"),
        "actual registered Chrome must be the selected fallback"
    );

    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("local listener");
    listener.set_nonblocking(true).expect("nonblocking");
    let port = listener.local_addr().expect("port").port();
    let target = "/vantare-private-browser-probe?state=a%20b&extra=%22quoted%22%5C%26%7C%3E%25&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback";
    let url = url::Url::parse(&format!("http://127.0.0.1:{port}{target}")).expect("synthetic URL");
    // Exercise the actual broken HTTPS decision with the same fallback launcher.
    super::super::with_fallback(
        || {
            let https = url::Url::parse("https://127.0.0.1/").expect("synthetic HTTPS");
            super::super::open_default(&https)
        },
        || super::open(&url),
    )
    .expect("Chrome launch accepted");
    let deadline = Instant::now() + Duration::from_secs(45);
    let mut socket = loop {
        match listener.accept() {
            Ok((socket, _)) => break socket,
            Err(error)
                if error.kind() == std::io::ErrorKind::WouldBlock && Instant::now() < deadline =>
            {
                // Manual external-process QA: no injected clock can advance Chrome.
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(error) => panic!("Chrome did not reach local probe: {error}"),
        }
    };
    socket
        .set_read_timeout(Some(Duration::from_secs(5)))
        .expect("timeout");
    let mut headers = Vec::new();
    while !headers.ends_with(b"\r\n\r\n") {
        let mut byte = [0];
        socket.read_exact(&mut byte).expect("browser request");
        headers.push(byte[0]);
        assert!(headers.len() <= 8192);
    }
    let headers = String::from_utf8(headers).expect("request");
    assert_eq!(
        headers.lines().next(),
        Some(format!("GET {target} HTTP/1.1").as_str())
    );
    socket
        .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK")
        .expect("reply");
    println!(
        "private-browser-qa: Chrome received the exact special-character target; no OAuth/account used"
    );
}
