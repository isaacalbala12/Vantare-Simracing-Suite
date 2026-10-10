//! Prueba de transporte en loopback; el servidor es un vector, no ACC real.
use super::*;

#[test]
fn malformed_udp_preserves_the_connection_and_drains_the_next_valid_packet() {
    let server = UdpSocket::bind("127.0.0.1:0").expect("vector UDP");
    let socket = UdpSocket::bind("127.0.0.1:0").expect("adaptador");
    socket
        .connect(server.local_addr().expect("servidor"))
        .expect("peer");
    socket.set_nonblocking(true).expect("no bloquear");
    let peer = socket.local_addr().expect("puerto original");
    let mut acc = Acc::new();
    acc.socket = Some(socket);
    acc.retry = Duration::MAX;
    acc.next_register = Duration::MAX;
    acc.next_entries = Duration::MAX;
    acc.next_track = Duration::MAX;
    acc.translator.connection = Some(42);
    acc.last_udp = Some(Duration::ZERO);
    server.send_to(&[1], peer).expect("ACK truncado");
    let now = Duration::from_millis(100);
    acc.poll(now).expect_err("no hay SHM en este vector");
    assert_eq!(
        acc.translator.connection,
        Some(42),
        "un datagrama no desconecta"
    );
    assert_eq!(
        acc.last_udp,
        Some(Duration::ZERO),
        "bytes inválidos no refrescan UDP"
    );
    assert_eq!(
        acc.socket
            .as_ref()
            .expect("socket conservado")
            .local_addr()
            .expect("puerto"),
        peer
    );

    server.send_to(&[1], peer).expect("otro ACK truncado");
    server
        .send_to(&[1, 43, 0, 0, 0, 1, 0, 0, 0], peer)
        .expect("ACK válido detrás");
    acc.receive(now).expect("drenaje continúa");
    assert_eq!(acc.translator.connection, Some(43));
    assert_eq!(acc.last_udp, Some(now));
}

#[test]
#[allow(unsafe_code)] // Mappings Win32 propios, igual que tests/acc/shm.rs.
fn broken_broadcasting_configuration_does_not_skip_shared_memory() {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
    use windows_sys::Win32::System::Memory::{
        CreateFileMappingW, FILE_MAP_WRITE, MapViewOfFile, PAGE_READWRITE, UnmapViewOfFile,
    };
    let path = std::env::temp_dir().join(format!("vantare-acc-broken-{}.json", std::process::id()));
    let mut acc = Acc::with_config_path(path.clone());
    let mut owners = Vec::new();
    for (i, size) in PAGE_SIZES.into_iter().enumerate() {
        let name = format!("Local\\vantare-acc-partial-{}-{i}", std::process::id());
        let wide: Vec<u16> = name.encode_utf16().chain([0]).collect();
        // SAFETY: mapping anónimo propio del tamaño verificado y nombre NUL válido.
        let raw = unsafe {
            CreateFileMappingW(
                INVALID_HANDLE_VALUE,
                std::ptr::null(),
                PAGE_READWRITE,
                0,
                u32::try_from(size).expect("tamaño de página"),
                wide.as_ptr(),
            )
        };
        assert!(!raw.is_null());
        // SAFETY: handle nuevo con dueño único.
        let owner = unsafe { OwnedHandle::from_raw_handle(raw) };
        // SAFETY: mapping vivo de size bytes; se libera la vista tras la copia.
        let view = unsafe { MapViewOfFile(owner.as_raw_handle(), FILE_MAP_WRITE, 0, 0, size) };
        assert!(!view.Value.is_null());
        let mut bytes = vec![0; size];
        if i == 2 {
            for (offset, text) in [(0, "1.9"), (30, "1.7")] {
                for (j, unit) in text.encode_utf16().enumerate() {
                    bytes[offset + j * 2..offset + j * 2 + 2].copy_from_slice(&unit.to_le_bytes());
                }
            }
        } else {
            bytes[..4].copy_from_slice(&1_i32.to_le_bytes());
            if i == 0 {
                bytes[4..8].copy_from_slice(&0.75_f32.to_le_bytes());
            }
            if i == 1 {
                bytes[4..8].copy_from_slice(&2_i32.to_le_bytes());
            }
        }
        // SAFETY: origen y vista propios, ambos de size bytes, sin escritor concurrente.
        unsafe {
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), view.Value.cast::<u8>(), size);
        }
        // SAFETY: vista propia, ya no se utiliza.
        assert_ne!(unsafe { UnmapViewOfFile(view) }, 0);
        acc.pages[i] = Some(Page::open(&name, size).expect("SHM de test"));
        owners.push(owner);
    }
    for (second, config) in ["{invalid}", "{\"udpListenerPort\":0}"]
        .into_iter()
        .enumerate()
    {
        std::fs::write(&path, config).expect("config defectuosa propia");
        let observation = acc
            .poll(Duration::from_secs(
                u64::try_from(second).expect("instante"),
            ))
            .expect("SHM sigue disponible")
            .expect("foto");
        let expected = if second == 0 {
            vantare_domain::Quality::Reliable(0.75)
        } else {
            vantare_domain::Quality::Stale(0.75)
        };
        assert_eq!(
            observation
                .state
                .player
                .expect("jugador")
                .telemetry
                .throttle,
            expected
        );
        assert!(acc.socket.is_none());
    }
    let server = UdpSocket::bind("127.0.0.1:0").expect("UDP vector");
    server
        .set_read_timeout(Some(Duration::from_secs(1)))
        .expect("plazo");
    std::fs::write(
        &path,
        format!(
            "{{\"udpListenerPort\":{}}}",
            server.local_addr().expect("puerto").port()
        ),
    )
    .expect("reparar");
    let _observation = acc.poll(Duration::from_secs(2)).expect("config reparada");
    assert!(acc.socket.is_some());
    let mut buf = [0; 512];
    assert!(server.recv(&mut buf).expect("registro recuperado") > 2);
    std::fs::remove_file(path).expect("limpiar config propia");
}

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

#[test]
fn unchanged_udp_values_still_advance_reception_in_live_poll() {
    let server = UdpSocket::bind("127.0.0.1:0").expect("servidor vector");
    let socket = UdpSocket::bind("127.0.0.1:0").expect("adaptador");
    socket
        .connect(server.local_addr().expect("dirección"))
        .expect("peer");
    socket.set_nonblocking(true).expect("no bloquear");
    let peer = socket.local_addr().expect("puerto");
    let mut acc = Acc::new();
    acc.socket = Some(socket);
    acc.retry = Duration::MAX; // No abrir SHM/config real en este vector.
    acc.next_register = Duration::MAX;
    let mut s = vec![0; 820];
    for (offset, text) in [(0, "1.9"), (30, "1.7")] {
        for (i, unit) in text.encode_utf16().enumerate() {
            s[offset + i * 2..offset + i * 2 + 2].copy_from_slice(&unit.to_le_bytes());
        }
    }
    acc.translator
        .shm(2, s, Duration::ZERO)
        .expect("static vector");
    let hex = "030000000001016eefa9c3eec4a643faea1d40020000200001000000538b253d000000000000ffffff7f0000000003ffffff7fffffff7fffffff7f00010000ffffff7f000000000000010000e7011800000000000000010001";
    let car: Vec<_> = hex
        .as_bytes()
        .chunks_exact(2)
        .map(|b| u8::from_str_radix(std::str::from_utf8(b).expect("hex"), 16).expect("byte"))
        .collect();
    for ms in [0, 100] {
        server.send_to(&car, peer).expect("UDP con mismos valores");
        let observation = acc
            .poll(Duration::from_millis(ms))
            .expect("poll")
            .expect("una muestra nueva aunque no cambien los valores");
        assert_eq!(observation.origin.received_at, Duration::from_millis(ms));
    }
}
