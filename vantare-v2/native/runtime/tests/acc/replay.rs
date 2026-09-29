//! Archivos de protocolo adversariales, pequeños y explícitamente sintéticos.
use super::*;
use std::io::Write;

fn recorded(kind: u8, packet: u32, at: u64, blob: &[u8]) -> Vec<u8> {
    let mut out = vec![kind];
    out.extend_from_slice(&packet.to_le_bytes());
    out.extend_from_slice(&at.to_le_bytes());
    out.extend_from_slice(blob);
    out
}

fn static_page() -> Vec<u8> {
    let mut blob = vec![0; 820];
    for (offset, text) in [(0, "1.9"), (30, "1.7")] {
        for (i, unit) in text.encode_utf16().enumerate() {
            blob[offset + i * 2..offset + i * 2 + 2].copy_from_slice(&unit.to_le_bytes());
        }
    }
    blob
}

fn archive(shm: &[u8], udp: &[u8], bad_hash: bool) -> Vec<u8> {
    let shm_hash = if bad_hash {
        "bad".to_owned()
    } else {
        format!("{:x}", Sha256::digest(shm))
    };
    let manifest = serde_json::to_vec(&serde_json::json!({
        "schema":"vantare.acc-temporal-v1", "smVersion":"1.9",
        "sha256":{"shm.bin":shm_hash,"udp.bin":format!("{:x}",Sha256::digest(udp))}
    }))
    .expect("manifest de test");
    let mut tar = Vec::new();
    for (name, bytes) in [
        ("shm.bin", shm),
        ("udp.bin", udp),
        ("manifest.json", manifest.as_slice()),
    ] {
        let mut h = [0_u8; 512];
        h[..name.len()].copy_from_slice(name.as_bytes());
        let size = format!("{:011o}", bytes.len());
        h[124..135].copy_from_slice(size.as_bytes());
        h[156] = b'0';
        h[148..156].fill(b' ');
        let checksum: u64 = h.iter().map(|b| u64::from(*b)).sum();
        h[148..156].copy_from_slice(format!("{checksum:06o}\0 ").as_bytes());
        tar.extend_from_slice(&h);
        tar.extend_from_slice(bytes);
        tar.resize(tar.len().next_multiple_of(512), 0);
    }
    tar.extend_from_slice(&[0; 1024]);
    let mut gzip = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    gzip.write_all(&tar).expect("gzip");
    gzip.finish().expect("trailer")
}

fn with_archive(name: &str, bytes: &[u8], check: impl FnOnce(&Path)) {
    let path = std::env::temp_dir().join(format!(
        "vantare-acc-replay-{}-{name}.tar.gz",
        std::process::id()
    ));
    std::fs::write(&path, bytes).expect("corpus de test");
    check(&path);
    std::fs::remove_file(path).expect("limpiar corpus propio");
}

#[test]
fn member_hash_gzip_crc_and_truncated_records_fail_closed() {
    let shm = recorded(2, 0, 0, &static_page());
    with_archive("hash", &archive(&shm, &[], true), |p| {
        assert!(open_acc_replay(p).is_err());
    });
    let mut corrupt = archive(&shm, &[], false);
    let i = corrupt.len() - 8;
    corrupt[i] ^= 1;
    with_archive("crc", &corrupt, |p| assert!(open_acc_replay(p).is_err()));
    with_archive("truncated", &archive(&shm[..13], &[], false), |p| {
        assert!(open_acc_replay(p).is_err());
    });
}

#[test]
fn mismatched_packet_is_discarded_and_counted_instead_of_becoming_a_sample() {
    let shm = recorded(0, 42, 0, &vec![0; 800]);
    with_archive("packet", &archive(&shm, &[], false), |p| {
        let mut replay = open_acc_replay(p).expect("contenedor íntegro");
        assert_eq!(
            replay
                .poll(Duration::ZERO)
                .expect("muestra rasgada descartada"),
            None
        );
        assert_eq!(replay.discarded_frames(), 1);
        assert_eq!(
            replay.poll(Duration::from_secs(1)).expect("EOF válido"),
            None
        );
    });
}

#[test]
fn corrupt_udp_is_an_error_and_never_a_successful_eof() {
    let shm = recorded(2, 0, 0, &static_page());
    let mut udp = vec![1, 0, 0, 0];
    udp.extend_from_slice(&1_u64.to_le_bytes());
    udp.push(3); // car truncado
    with_archive("udp", &archive(&shm, &udp, false), |p| {
        let mut r = open_acc_replay(p).expect("contenedores íntegros");
        assert!(r.poll(Duration::ZERO).expect("static").is_some());
        for _ in 0..2 {
            assert!(matches!(
                r.poll(Duration::from_secs(1)),
                Err(AdapterError::Rejected(_))
            ));
        }
    });
}

#[test]
fn captured_times_cannot_run_backwards_and_missing_capture_is_an_error() {
    let mut shm = recorded(2, 0, 10, &static_page());
    shm.extend_from_slice(&recorded(2, 1, 0, &static_page()));
    with_archive("time", &archive(&shm, &[], false), |p| {
        let mut r = open_acc_replay(p).expect("primer registro válido");
        assert!(matches!(
            r.poll(Duration::from_secs(1)),
            Err(AdapterError::Rejected(_))
        ));
    });
    assert!(open_acc_replay(Path::new("capture-that-does-not-exist.acc.tar.gz")).is_err());
}
