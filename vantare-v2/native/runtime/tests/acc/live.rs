//! Prueba de transporte en loopback; el servidor es un vector, no ACC real.
use super::*;

#[test]
fn udp_registration_requests_unknown_car_throttling_and_reconnect() {
    let server = UdpSocket::bind("127.0.0.1:0").expect("servidor de test");
    server
        .set_read_timeout(Some(Duration::from_secs(1)))
        .expect("plazo");
    let path = std::env::temp_dir().join(format!("vantare-acc-wire-{}.json", std::process::id()));
    let text = format!(
        "{{\"updListenerPort\":{},\"connectionPassword\":\"test-only\"}}",
        server.local_addr().expect("dirección").port()
    );
    let bytes: Vec<_> = text.encode_utf16().flat_map(u16::to_le_bytes).collect();
    std::fs::write(&path, bytes).expect("config UTF-16 propia");
    let mut acc = Acc::with_config_path(path.clone());
    acc.connect(Duration::ZERO).expect("registro");
    let mut buf = [0; 512];
    let (n, peer) = server.recv_from(&mut buf).expect("REGISTER v4");
    assert_eq!(&buf[..2], &[1, 4]);
    assert!(n > 20);
    server
        .send_to(&[1, 42, 0, 0, 0, 1, 0, 0, 0], peer)
        .expect("resultado");
    acc.receive(Duration::ZERO).expect("handshake");
    for kind in [10, 11] {
        let n = server.recv(&mut buf).expect("petición");
        assert_eq!(&buf[..n], &[kind, 42, 0, 0, 0]);
    }
    assert!(
        acc.translator.request_track,
        "TRACK_DATA pendiente se reintenta"
    );
    // Datagrama real del corpus: carIndex 0, antes de conocer su EntryList.
    let hex = "030000000001016eefa9c3eec4a643faea1d40020000200001000000538b253d000000000000ffffff7f0000000003ffffff7fffffff7fffffff7f00010000ffffff7f000000000000010000e7011800000000000000010001";
    let car: Vec<_> = hex
        .as_bytes()
        .chunks_exact(2)
        .map(|b| u8::from_str_radix(std::str::from_utf8(b).expect("hex"), 16).expect("byte"))
        .collect();
    server.send_to(&car, peer).expect("coche desconocido");
    assert!(
        acc.receive(Duration::from_millis(100))
            .expect("actualización")
    );
    assert!(
        acc.translator.request_entries,
        "se difiere hasta un segundo"
    );
    acc.receive(Duration::from_secs(1)).expect("repetir lista");
    let n = server.recv(&mut buf).expect("REQUEST_ENTRY_LIST");
    assert_eq!(&buf[..n], &[10, 42, 0, 0, 0]);
    let n = server.recv(&mut buf).expect("reintento TRACK_DATA");
    assert_eq!(&buf[..n], &[11, 42, 0, 0, 0]);
    assert!(!acc.translator.request_entries);
    // Silencio: cierre y nuevo registro, usando el reloj inyectado sin sleep.
    acc.receive(Duration::from_secs(3)).expect("silencio");
    assert!(acc.socket.is_none());
    let n = server
        .recv(&mut buf)
        .expect("UNREGISTER antes de reconectar");
    assert_eq!(&buf[..n], &[9]);
    acc.connect(Duration::from_secs(4)).expect("reconexión");
    let (n, _) = server.recv_from(&mut buf).expect("registro nuevo");
    assert_eq!(&buf[..2], &[1, 4]);
    assert!(n > 20);
    std::fs::remove_file(path).expect("limpiar solo config del test");
}

#[test]
fn delayed_handshake_retries_registration_on_the_same_socket() {
    let server = UdpSocket::bind("127.0.0.1:0").expect("servidor");
    server
        .set_read_timeout(Some(Duration::from_secs(1)))
        .expect("plazo");
    let path =
        std::env::temp_dir().join(format!("vantare-acc-delayed-{}.json", std::process::id()));
    std::fs::write(
        &path,
        format!(
            "{{\"udpListenerPort\":{}}}",
            server.local_addr().expect("address").port()
        ),
    )
    .expect("config propia");
    let mut acc = Acc::with_config_path(path.clone());
    acc.connect(Duration::ZERO).expect("registro");
    let mut buf = [0; 512];
    let (_, peer) = server.recv_from(&mut buf).expect("primer registro");
    acc.receive(Duration::from_secs(2))
        .expect("handshake tardío");
    std::fs::remove_file(path).expect("limpiar config del test");
    assert!(
        acc.socket.is_some(),
        "reintentar sin perder la respuesta pendiente"
    );
    let (_, repeated) = server.recv_from(&mut buf).expect("registro repetido");
    assert_eq!(repeated, peer);
}
