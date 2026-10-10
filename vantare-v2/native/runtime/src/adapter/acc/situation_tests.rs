//! Páginas reales sin alterar para Live; mutaciones declaradas para transiciones.
use super::translate::{PAGE_SIZES, Translator};
use crate::core::Core;
use flate2::read::GzDecoder;
use std::{
    fs::File,
    io::{self, Read},
    path::Path,
    time::Duration,
};
use vantare_domain::{DrivingSituation as S, SourceKind};

fn pages() -> [Vec<u8>; 3] {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata/acc/acc-sesion-udp-20260929.tar.gz");
    let mut archive = GzDecoder::new(File::open(path).expect("corpus ACC obligatorio"));
    loop {
        let mut h = [0; 512];
        archive.read_exact(&mut h).expect("tar header");
        assert!(h.iter().any(|b| *b != 0), "shm.bin obligatorio");
        let size = u64::from_str_radix(
            std::str::from_utf8(&h[124..136])
                .expect("size")
                .trim_matches(['\0', ' ']),
            8,
        )
        .expect("octal");
        if h[..8] == *b"shm.bin\0" {
            let mut records = archive.take(size);
            let mut pages: [Vec<u8>; 3] = std::array::from_fn(|_| Vec::new());
            while pages.iter().any(Vec::is_empty) {
                let mut h = [0; 13];
                records.read_exact(&mut h).expect("registro real");
                let index = usize::from(h[0]);
                let mut page = vec![0; PAGE_SIZES[index]];
                records.read_exact(&mut page).expect("página completa");
                pages[index] = page;
            }
            return pages;
        }
        io::copy(
            &mut (&mut archive).take(size.next_multiple_of(512)),
            &mut io::sink(),
        )
        .expect("saltar");
    }
}

fn feed(t: &mut Translator, core: &mut Core, pages: &[Vec<u8>; 3], at: u64, packet: i32) -> S {
    let now = Duration::from_millis(at);
    for index in [2, 0, 1] {
        let mut page = pages[index].clone();
        if index != 2 {
            page[..4].copy_from_slice(&packet.to_le_bytes());
        }
        t.shm(u8::try_from(index).expect("index"), page, now)
            .expect("SHM");
    }
    core.observe(t.observe(now).expect("observación"))
        .expect("núcleo");
    core.snapshot().state.driving_situation
}

#[test]
fn real_acc_live_and_explicit_pause_replay_pit_stop_moving_and_absence_transitions() {
    let mut p = pages();
    assert_eq!(
        i32::from_le_bytes(p[1][4..8].try_into().expect("status")),
        2,
        "corpus Live"
    );
    let mut t = Translator::new(SourceKind::Live);
    let mut core = Core::new(1562);
    assert_eq!(feed(&mut t, &mut core, &p, 0, 1), S::Unknown);
    assert_eq!(
        feed(&mut t, &mut core, &p, 250, 250),
        S::Garage,
        "corpus real: parado en pit lane"
    );
    for (status, expected, start) in [(3_i32, S::Paused, 260), (1, S::Replay, 520)] {
        p[1][4..8].copy_from_slice(&status.to_le_bytes());
        feed(
            &mut t,
            &mut core,
            &p,
            start,
            i32::try_from(start).expect("packet"),
        );
        assert_eq!(
            feed(
                &mut t,
                &mut core,
                &p,
                start + 250,
                i32::try_from(start + 250).expect("packet")
            ),
            expected
        );
    }
    p[1][4..8].copy_from_slice(&2_i32.to_le_bytes());
    p[1][1236..1240].copy_from_slice(&1_i32.to_le_bytes());
    p[0][28..32].copy_from_slice(&18.0_f32.to_le_bytes());
    assert_eq!(
        feed(&mut t, &mut core, &p, 780, 780),
        S::OnTrack,
        "pit lane conduciendo"
    );
    p[0][28..32].copy_from_slice(&0.0_f32.to_le_bytes());
    assert_eq!(feed(&mut t, &mut core, &p, 790, 790), S::OnTrack);
    assert_eq!(feed(&mut t, &mut core, &p, 1040, 1040), S::Garage);
    p[0][28..32].copy_from_slice(&f32::NAN.to_le_bytes());
    assert_eq!(
        feed(&mut t, &mut core, &p, 1050, 1050),
        S::Unknown,
        "velocidad ausente"
    );
    p[1][4..8].copy_from_slice(&1_i32.to_le_bytes());
    feed(&mut t, &mut core, &p, 1060, 1060);
    // La SHM de replay sin renovación vence: UDP no puede rejuvenecer status.
    core.observe(t.observe(Duration::from_secs(2)).expect("obsoleta"))
        .expect("núcleo");
    assert_eq!(core.snapshot().state.driving_situation, S::Unknown);
}
