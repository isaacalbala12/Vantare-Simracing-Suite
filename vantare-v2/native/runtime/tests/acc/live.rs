//! Prueba de transporte en loopback; el servidor es un vector, no ACC real.
use super::*;

fn idle_acc() -> Acc {
    let mut acc = Acc::new();
    acc.retry = Duration::MAX; // Solo fuentes propias: nunca abrir ACC/config real.
    acc.next_register = Duration::MAX;
    let mut s = vec![0; PAGE_SIZES[2]];
    for (offset, text) in [(0, "1.9"), (30, "1.7")] {
        for (i, unit) in text.encode_utf16().enumerate() {
            s[offset + i * 2..offset + i * 2 + 2].copy_from_slice(&unit.to_le_bytes());
        }
    }
    acc.translator
        .shm(2, s, Duration::ZERO)
        .expect("static propia");
    acc
}

fn car_in(observation: &Observation, id: u32) -> &vantare_domain::Car {
    observation
        .state
        .cars
        .iter()
        .find(|car| car.id == vantare_domain::CarId(id))
        .expect("coche de test")
}

#[test]
fn unchanged_live_poll_skips_reconstruction_but_publishes_shm_expiry_once() {
    let mut acc = idle_acc();
    for (kind, size, at) in [(0, 800, 0), (1, 1588, 100)] {
        let mut bytes = vec![0; size];
        bytes[..4].copy_from_slice(&1_i32.to_le_bytes());
        if kind == 0 {
            bytes[4..8].copy_from_slice(&0.75_f32.to_le_bytes());
        } else {
            bytes[4..8].copy_from_slice(&2_i32.to_le_bytes());
        }
        acc.translator
            .shm(kind, bytes, Duration::from_millis(at))
            .expect("página propia");
    }
    assert!(acc.poll(Duration::from_millis(100)).unwrap().is_some());
    for ms in [105, 200, 495] {
        assert!(acc.poll(Duration::from_millis(ms)).unwrap().is_none());
    }
    assert_eq!(
        acc.translator.observations, 1,
        "no reconstruir cada poll quieto"
    );
    let expired = acc.poll(Duration::from_millis(500)).unwrap().unwrap();
    assert_eq!(
        expired.state.player.unwrap().telemetry.throttle,
        vantare_domain::Quality::Stale(0.75)
    );
    assert!(acc.poll(Duration::from_millis(505)).unwrap().is_none());
    assert_eq!(acc.translator.observations, 2);
    assert!(acc.poll(Duration::from_millis(600)).unwrap().is_some());
    assert!(acc.poll(Duration::from_millis(605)).unwrap().is_none());
    assert_eq!(
        acc.translator.observations, 3,
        "graphics caduca por su propio reloj"
    );
}

#[test]
fn invisible_expiry_is_not_reconstructed_forever() {
    let mut acc = idle_acc();
    let mut p = vec![0; 800]; // Sin graphics/jugador; temperaturas ausentes.
    p[..4].copy_from_slice(&1_i32.to_le_bytes());
    for at in [288, 292] {
        p[at..at + 4].copy_from_slice(&f32::NAN.to_le_bytes());
    }
    acc.translator.shm(0, p, Duration::ZERO).unwrap();
    assert!(acc.poll(Duration::ZERO).unwrap().is_some());
    for ms in [500, 505, 600] {
        assert!(acc.poll(Duration::from_millis(ms)).unwrap().is_none());
    }
    assert_eq!(
        acc.translator.observations, 2,
        "la caducidad invisible se confirma una vez"
    );
}

#[test]
fn live_fast_path_preserves_udp_velocity_and_each_car_expiry() {
    use vantare_domain::Quality;
    let mut acc = idle_acc();
    let mut g = vec![0; 1588];
    g[..4].copy_from_slice(&1_i32.to_le_bytes());
    g[4..8].copy_from_slice(&2_i32.to_le_bytes());
    g[1216..1220].copy_from_slice(&1005_i32.to_le_bytes());
    acc.translator.shm(1, g, Duration::ZERO).unwrap();
    // Vector v4 con tres laps de tres splits (25 bytes cada una).
    let mut car = vec![3, 0, 0, 0, 0, 1, 4];
    for v in [0.0_f32, 0.0, 0.0] {
        car.extend_from_slice(&v.to_le_bytes());
    }
    car.push(1); // Track.
    for n in [144_u16, 1, 1, 0] {
        car.extend_from_slice(&n.to_le_bytes());
    }
    car.extend_from_slice(&0.5_f32.to_le_bytes());
    car.extend_from_slice(&2_u16.to_le_bytes());
    car.extend_from_slice(&0_i32.to_le_bytes());
    for time in [90_000_i32, 90_000, 1000] {
        car.extend_from_slice(&time.to_le_bytes());
        car.extend_from_slice(&[0, 0, 0, 0, 3]);
        for n in [30_000_i32; 3] {
            car.extend_from_slice(&n.to_le_bytes());
        }
        car.extend_from_slice(&[0, 1, 0, 0]);
    }
    car[1..3].copy_from_slice(&8_u16.to_le_bytes());
    for (ms, time, x) in [(0, 1000_i32, 0.0_f32), (100, 1100, 4.0), (200, 1200, 8.0)] {
        car[7..11].copy_from_slice(&x.to_le_bytes());
        car[11..15].copy_from_slice(&0.0_f32.to_le_bytes());
        car[88..92].copy_from_slice(&time.to_le_bytes());
        acc.translator.udp(&car, Duration::from_millis(ms)).unwrap();
    }
    car[1..3].copy_from_slice(&9_u16.to_le_bytes());
    acc.translator
        .udp(&car, Duration::from_millis(250))
        .unwrap();
    let first = acc.poll(Duration::from_millis(250)).unwrap().unwrap();
    assert!(matches!(
        car_in(&first, 8).velocity_mps,
        Quality::Estimated(_)
    ));
    assert!(acc.poll(Duration::from_millis(495)).unwrap().is_none());
    let stale_velocity = acc.poll(Duration::from_millis(500)).unwrap().unwrap();
    let rival = car_in(&stale_velocity, 8);
    assert!(matches!(rival.velocity_mps, Quality::Stale(_)));
    assert!(matches!(rival.pose, Quality::Reliable(_)));
    assert!(acc.poll(Duration::from_millis(505)).unwrap().is_none());
    let stale_car = acc.poll(Duration::from_millis(1200)).unwrap().unwrap();
    assert!(matches!(car_in(&stale_car, 8).pose, Quality::Stale(_)));
    assert!(matches!(car_in(&stale_car, 9).pose, Quality::Reliable(_)));
    assert!(acc.poll(Duration::from_millis(1205)).unwrap().is_none());
    let second = acc.poll(Duration::from_millis(1250)).unwrap().unwrap();
    assert!(matches!(car_in(&second, 9).pose, Quality::Stale(_)));
    assert!(acc.poll(Duration::from_millis(1255)).unwrap().is_none());
    assert_eq!(acc.translator.observations, 4);
    // Un poll puede aceptar un coche y fallar después: no perder el cambio
    // anterior al error ni la retirada de velocidades por un registro fallido.
    let server = UdpSocket::bind("127.0.0.1:0").unwrap();
    let socket = UdpSocket::bind("127.0.0.1:0").unwrap();
    socket.connect(server.local_addr().unwrap()).unwrap();
    socket.set_nonblocking(true).unwrap();
    let peer = socket.local_addr().unwrap();
    acc.socket = Some(socket);
    car[1..3].copy_from_slice(&10_u16.to_le_bytes());
    server.send_to(&car, peer).unwrap();
    server.send_to(&[1, 42, 0, 0, 0, 0, 0, 0, 0], peer).unwrap();
    let recovered = acc.poll(Duration::from_millis(1260)).unwrap().unwrap();
    assert!(matches!(car_in(&recovered, 10).pose, Quality::Reliable(_)));
    assert_eq!(car_in(&recovered, 8).velocity_mps, Quality::Unavailable);
    assert_eq!(acc.translator.observations, 5);
    let socket = UdpSocket::bind("127.0.0.1:0").unwrap();
    socket.connect(server.local_addr().unwrap()).unwrap();
    socket.set_nonblocking(true).unwrap();
    let peer = socket.local_addr().unwrap();
    acc.socket = Some(socket);
    server.send_to(&[1, 42, 0, 0, 0, 0, 0, 0, 0], peer).unwrap();
    // El error por sí solo exige comprobar el estado, pero no es una muestra.
    assert!(acc.poll(Duration::from_millis(1265)).unwrap().is_none());
    assert_eq!(acc.translator.observations, 6);
}

#[test]
#[allow(unsafe_code)] // Mapping Win32 privado; no escribir en el mapping del simulador.
fn rejected_static_page_still_drains_udp_and_recovers_when_initialized() {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
    use windows_sys::Win32::System::Memory::{
        CreateFileMappingW, FILE_MAP_WRITE, MapViewOfFile, PAGE_READWRITE, UnmapViewOfFile,
    };
    let name = format!("Local\\vantare-acc-invalid-static-{}", std::process::id());
    let wide: Vec<u16> = name.encode_utf16().chain([0]).collect();
    // SAFETY: nombre NUL válido y mapping anónimo propio del tamaño de static.
    let raw = unsafe {
        CreateFileMappingW(
            INVALID_HANDLE_VALUE,
            std::ptr::null(),
            PAGE_READWRITE,
            0,
            820,
            wide.as_ptr(),
        )
    };
    assert!(!raw.is_null());
    // SAFETY: handle nuevo, único dueño.
    let owner = unsafe { OwnedHandle::from_raw_handle(raw) };
    // SAFETY: owner conserva mapping vivo de 820 bytes.
    let view = unsafe { MapViewOfFile(owner.as_raw_handle(), FILE_MAP_WRITE, 0, 0, 820) };
    assert!(!view.Value.is_null());
    let server = UdpSocket::bind("127.0.0.1:0").unwrap();
    let socket = UdpSocket::bind("127.0.0.1:0").unwrap();
    socket.connect(server.local_addr().unwrap()).unwrap();
    socket.set_nonblocking(true).unwrap();
    let peer = socket.local_addr().unwrap();
    let mut acc = idle_acc();
    acc.socket = Some(socket);
    acc.pages[2] = Some(Page::open(&name, 820).unwrap());
    let mut initialized = vec![0; 820];
    for (offset, text) in [(0, "1.9"), (30, "1.7")] {
        for (i, unit) in text.encode_utf16().enumerate() {
            initialized[offset + i * 2..offset + i * 2 + 2].copy_from_slice(&unit.to_le_bytes());
        }
    }
    for (ms, version) in [(0, None), (5, Some("9.9")), (10, Some("1.9"))] {
        let mut bytes = initialized.clone();
        bytes[..30].fill(0);
        if let Some(version) = version {
            for (i, unit) in version.encode_utf16().enumerate() {
                bytes[i * 2..i * 2 + 2].copy_from_slice(&unit.to_le_bytes());
            }
        }
        // SAFETY: vista propia de 820 bytes, sin escritor concurrente.
        unsafe {
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), view.Value.cast::<u8>(), 820);
        }
        server.send_to(&[1, 42, 0, 0, 0, 1, 0, 0, 0], peer).unwrap();
        let result = acc.poll(Duration::from_millis(ms));
        if ms < 10 {
            assert!(matches!(result, Err(AdapterError::Rejected(_))));
        } else {
            assert!(result.is_ok(), "static reparada");
        }
        assert_eq!(
            acc.last_udp,
            Some(Duration::from_millis(ms)),
            "UDP debe drenarse incluso con static rechazada"
        );
        assert_eq!(acc.translator.connection, Some(42));
    }
    // SAFETY: vista propia, ya no se utilizará.
    assert_ne!(unsafe { UnmapViewOfFile(view) }, 0);
}

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
