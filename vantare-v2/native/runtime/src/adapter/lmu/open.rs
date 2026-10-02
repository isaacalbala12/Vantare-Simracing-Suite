//! Abre una captura como [`Replay`]: un fixture `.bin` (un solo frame) o el
//! corpus temporal `.tar.gz` (lecturas SHM y rondas REST con sus instantes).
//! El test de conformidad lee el mismo corpus por su cuenta y con más
//! comprobaciones: es el oráculo de este lector.

use std::fs::File;
use std::io::{self, BufReader, Read};
use std::path::Path;
use std::time::Duration;

use flate2::read::GzDecoder;
use serde_json::Value;

use super::replay::{Replay, ReplayEvent};

const CORPUS_SCHEMA: &str = "vantare.lmu-temporal-high-rate.v1";
const REST_SCHEMA: &str = "vantare.lmu-rest-bodies.v1";
// El layout actual mide 324820 bytes; 1 MiB admite extensiones sin leer un .bin
// arbitrario entero. REST conserva las cotas de los dos endpoints productivos.
const MAX_FRAME_BYTES: usize = 1 << 20;
const MAX_REST_BYTES: usize = 2 * super::rest::MAX_RESPONSE_BYTES + 1024;
const MAX_MANIFEST_BYTES: usize = 16 << 20;
const MAX_METADATA_BYTES: usize = 64 << 20;

fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message.into())
}

/// `build`: versión de LMU de la captura. Obligatoria para un `.bin` (el frame
/// no la lleva y una equivocada se leería con otro layout); en un corpus,
/// la del manifiesto salvo que se indique otra.
///
/// # Errors
/// Si el fichero no existe, no es de un tipo conocido o no tiene la forma esperada.
pub fn open_replay(path: &Path, build: Option<&str>) -> io::Result<Replay> {
    let open =
        |error: io::Error| io::Error::new(error.kind(), format!("{}: {error}", path.display()));
    let name = path.to_string_lossy();
    if name.ends_with(".bin") {
        let build =
            build.ok_or_else(|| invalid("un fixture .bin necesita --build <versión de LMU>"))?;
        let mut frame = Vec::new();
        File::open(path)
            .map_err(open)?
            .take((MAX_FRAME_BYTES + 1) as u64)
            .read_to_end(&mut frame)
            .map_err(open)?;
        if frame.len() > MAX_FRAME_BYTES {
            return Err(invalid("fixture LMU supera 1 MiB"));
        }
        Ok(Replay::new(
            build,
            [ReplayEvent::Shm {
                at: Duration::ZERO,
                frame,
            }],
        ))
    } else if name.ends_with(".tar.gz") {
        let file = File::open(path).map_err(open)?;
        corpus(GzDecoder::new(BufReader::new(file)), build)
    } else {
        Err(invalid("se esperaba un fixture .bin o un corpus .tar.gz"))
    }
}

fn corpus(archive: impl Read + Send + 'static, build: Option<&str>) -> io::Result<Replay> {
    let mut entries = tar_entries(archive);
    // El manifiesto y las rondas REST (pequeñas) preceden a las lecturas SHM,
    // que se leen una a una según se reproducen.
    let mut manifest = None;
    let mut rests = Vec::new();
    let mut metadata_bytes = 0_usize;
    let first_shm = loop {
        let (name, content) = entries
            .next()
            .ok_or_else(|| invalid("el corpus no tiene lecturas SHM"))??;
        let file = name.rsplit('/').next().unwrap_or_default().to_owned();
        if file == "manifest.json" || file.starts_with("rest-") {
            metadata_bytes = metadata_bytes
                .checked_add(content.len())
                .filter(|size| *size <= MAX_METADATA_BYTES)
                .ok_or_else(|| invalid("metadatos LMU superan 64 MiB"))?;
        }
        if file == "manifest.json" {
            manifest = Some(serde_json::from_slice::<Value>(&content)?);
        } else if file.starts_with("rest-") {
            rests.push(rest_bodies(&content)?);
        } else if file.starts_with("shm-") {
            break content;
        }
    };
    let manifest =
        manifest.ok_or_else(|| invalid("manifest.json debe preceder a las lecturas SHM"))?;
    if manifest["schema"] != CORPUS_SCHEMA {
        return Err(invalid(format!(
            "esquema de corpus desconocido: {}",
            manifest["schema"]
        )));
    }
    let build = match build {
        Some(build) => build.to_owned(),
        None => text(&manifest, "build")?.to_owned(),
    };
    let events = manifest["events"]
        .as_array()
        .ok_or_else(|| invalid("el manifiesto no tiene events"))?
        .clone();
    let clock = Clock::new(text(
        events
            .first()
            .ok_or_else(|| invalid("corpus sin eventos"))?,
        "atUtc",
    )?)?;

    let mut first_shm = Some(first_shm);
    let events = events
        .into_iter()
        .map(move |event| next_event(&event, &clock, &mut first_shm, &mut entries, &rests));
    Ok(Replay::from_results(build, events))
}

fn next_event(
    event: &Value,
    clock: &Clock,
    first_shm: &mut Option<Vec<u8>>,
    entries: &mut impl Iterator<Item = io::Result<(String, Vec<u8>)>>,
    rests: &[(Vec<u8>, Vec<u8>)],
) -> io::Result<ReplayEvent> {
    let at = clock.at(text(event, "atUtc")?)?;
    match text(event, "kind")? {
        "shm" => {
            let frame = match first_shm.take() {
                Some(frame) => frame,
                None => {
                    entries
                        .next()
                        .ok_or_else(|| invalid("faltan lecturas SHM"))??
                        .1
                }
            };
            Ok(ReplayEvent::Shm { at, frame })
        }
        "rest" => {
            let index = event["index"]
                .as_u64()
                .and_then(|index| usize::try_from(index).ok())
                .ok_or_else(|| invalid("evento REST sin index"))?;
            let (standings, session) = rests
                .get(index)
                .cloned()
                .ok_or_else(|| invalid(format!("falta la ronda REST {index}")))?;
            Ok(ReplayEvent::Rest {
                at,
                standings,
                standings_started: clock.at(text(event, "standingsStartedUtc")?)?,
                session,
                session_started: clock.at(text(event, "sessionStartedUtc")?)?,
            })
        }
        other => Err(invalid(format!("evento de corpus desconocido: {other}"))),
    }
}

fn text<'a>(value: &'a Value, key: &str) -> io::Result<&'a str> {
    value[key]
        .as_str()
        .ok_or_else(|| invalid(format!("falta el campo {key}")))
}

/// Cuerpos `standings` y `sessionInfo` de una ronda REST, ya como JSON de cable.
fn rest_bodies(content: &[u8]) -> io::Result<(Vec<u8>, Vec<u8>)> {
    let body: Value = serde_json::from_slice(content)?;
    if body["schema"] != REST_SCHEMA {
        return Err(invalid("esquema de ronda REST desconocido"));
    }
    Ok((
        serde_json::to_vec(&body["standings"])?,
        serde_json::to_vec(&body["sessionInfo"])?,
    ))
}

/// Instantes UTC del corpus (`AAAA-MM-DDThh:mm:ss.fffffffZ`) llevados al reloj
/// del núcleo: cero es el primer evento, más un segundo de margen para que
/// ningún instante de consulta sea negativo.
struct Clock {
    date: String,
    origin_ns: i128,
}

impl Clock {
    fn new(first: &str) -> io::Result<Self> {
        let (date, ns) = split_utc(first)?;
        Ok(Self {
            date: date.to_owned(),
            origin_ns: ns,
        })
    }

    fn at(&self, value: &str) -> io::Result<Duration> {
        let (date, ns) = split_utc(value)?;
        if date != self.date {
            return Err(invalid("el corpus no debe cruzar de día"));
        }
        let elapsed = ns - self.origin_ns + 1_000_000_000;
        u64::try_from(elapsed)
            .map(Duration::from_nanos)
            .map_err(|_| invalid("instante anterior al origen"))
    }
}

/// (fecha, nanosegundos desde la medianoche).
fn split_utc(value: &str) -> io::Result<(&str, i128)> {
    let bad = || invalid(format!("instante UTC inválido: {value}"));
    let (date, time) = value.split_once('T').ok_or_else(bad)?;
    let (whole, fraction) = time
        .strip_suffix('Z')
        .and_then(|time| time.split_once('.'))
        .ok_or_else(bad)?;
    let mut parts = whole.split(':').map(|part| part.parse::<i128>().ok());
    let (Some(Some(h)), Some(Some(m)), Some(Some(s))) = (parts.next(), parts.next(), parts.next())
    else {
        return Err(bad());
    };
    let fraction = format!("{fraction:0<9}");
    let nanos = fraction
        .get(..9)
        .and_then(|digits| digits.parse::<i128>().ok())
        .ok_or_else(bad)?;
    Ok((date, (h * 3600 + m * 60 + s) * 1_000_000_000 + nanos))
}

/// Entradas de un `.tar` ustar en streaming: (nombre, contenido).
fn tar_entries(mut reader: impl Read) -> impl Iterator<Item = io::Result<(String, Vec<u8>)>> {
    let mut read_entry = move || -> io::Result<Option<(String, Vec<u8>)>> {
        loop {
            let mut header = [0_u8; 512];
            reader.read_exact(&mut header)?;
            if header.iter().all(|byte| *byte == 0) {
                return Ok(None);
            }
            let field = |range: std::ops::Range<usize>| {
                let bytes = &header[range];
                let end = bytes
                    .iter()
                    .position(|byte| *byte == 0)
                    .unwrap_or(bytes.len());
                String::from_utf8_lossy(&bytes[..end]).into_owned()
            };
            let name = field(0..100);
            let size = usize::from_str_radix(field(124..136).trim(), 8)
                .map_err(|_| invalid(format!("tamaño tar inválido en {name}")))?;
            let file = name.rsplit('/').next().unwrap_or_default();
            let limit = if file.starts_with("shm-") {
                MAX_FRAME_BYTES
            } else if file == "manifest.json" {
                MAX_MANIFEST_BYTES
            } else if file.starts_with("rest-") {
                MAX_REST_BYTES
            } else {
                // Respuestas crudas y entradas ajenas tienen la cota REST.
                super::rest::MAX_RESPONSE_BYTES
            };
            match header[156] {
                b'0' | 0 => {}
                b'5' if size == 0 => continue,
                other => {
                    return Err(invalid(format!(
                        "entrada tar {other:#x} inesperada en {name}"
                    )));
                }
            }
            if size > limit {
                return Err(invalid(format!("miembro LMU demasiado grande: {name}")));
            }
            let padding = (512 - size % 512) % 512;
            let mut content = vec![0; size];
            reader.read_exact(&mut content)?;
            let mut tail = [0; 512];
            reader.read_exact(&mut tail[..padding])?;
            return Ok(Some((name, content)));
        }
    };
    let mut done = false;
    std::iter::from_fn(move || {
        if done {
            return None;
        }
        let entry = read_entry().transpose();
        // Tras un error o el final, el flujo ya no es fiable.
        done = !matches!(entry, Some(Ok(_)));
        entry
    })
}

#[cfg(test)]
mod tests {
    use vantare_domain::Adapter;

    use super::*;

    fn tar(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut out = Vec::new();
        for (name, content) in files {
            let mut header = [0_u8; 512];
            header[..name.len()].copy_from_slice(name.as_bytes());
            let size = format!("{:011o}", content.len());
            header[124..135].copy_from_slice(size.as_bytes());
            header[156] = b'0';
            out.extend_from_slice(&header);
            out.extend_from_slice(content);
            out.resize(out.len().div_ceil(512) * 512, 0);
        }
        out.extend_from_slice(&[0; 1024]);
        out
    }

    #[test]
    fn utc_instants_become_offsets_from_the_first_event() {
        let clock = Clock::new("2026-09-29T10:00:00.5Z").unwrap();
        let at = |value| clock.at(value).unwrap();
        assert_eq!(at("2026-09-29T10:00:00.5Z"), Duration::from_secs(1));
        assert_eq!(
            at("2026-09-29T10:01:01.0000000Z"),
            Duration::from_millis(61_500)
        );
        assert!(clock.at("2026-09-30T10:00:00.5Z").is_err());
        assert!(clock.at("2026-09-29T09:00:00.0Z").is_err());
        assert!(clock.at("mañana").is_err());
    }

    #[test]
    fn tar_entries_stream_files_and_stop_at_the_end() {
        let bytes = tar(&[("a/x.txt", b"hola"), ("b.bin", &[7; 600])]);
        let got: Vec<_> = tar_entries(bytes.as_slice()).map(Result::unwrap).collect();
        assert_eq!(got.len(), 2);
        assert_eq!(got[0], ("a/x.txt".to_owned(), b"hola".to_vec()));
        assert_eq!(got[1].1.len(), 600);
        // Un tar truncado da un error y ahí termina.
        let cut = &bytes[..1100]; // la primera entrada entera y media cabecera
        let mut cut = tar_entries(cut);
        assert!(cut.next().unwrap().is_ok());
        assert!(cut.next().unwrap().is_err());
        assert!(cut.next().is_none());
    }

    #[test]
    fn a_bin_fixture_needs_its_build_and_a_missing_capture_is_an_error() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../testdata");
        let fixture = dir.join("lmu-fixture.bin");
        assert!(open_replay(&fixture, None).is_err());
        let mut replay = open_replay(&fixture, Some("1.3.0.0")).unwrap();
        let observation = replay.poll(Duration::ZERO).unwrap().unwrap();
        assert_eq!(observation.state.cars.len(), 44);
        assert!(open_replay(&dir.join("no-existe.bin"), Some("1.3.0.0")).is_err());
        assert!(open_replay(&dir.join("README.md"), None).is_err());
    }

    #[test]
    fn late_corpus_error_is_not_a_clean_eof() {
        let frame = include_bytes!("../../../../../testdata/lmu-fixture.bin");
        for complete in [false, true] {
            let manifest = serde_json::to_vec(&serde_json::json!({
                "schema": CORPUS_SCHEMA, "build": "1.3.0.0",
                "events": [
                    {"kind": "shm", "atUtc": "2026-10-02T10:00:00.0Z"},
                    {"kind": "shm", "atUtc": "2026-10-02T10:00:01.0Z"}
                ]
            }))
            .expect("manifiesto");
            let mut files = vec![
                ("manifest.json", manifest.as_slice()),
                ("shm-000.bin", frame.as_slice()),
            ];
            if complete {
                files.push(("shm-001.bin", frame.as_slice()));
            }
            let mut replay = corpus(io::Cursor::new(tar(&files)), None).expect("abrir");
            assert!(
                replay
                    .poll(Duration::from_secs(1))
                    .expect("primero")
                    .is_some()
            );
            if complete {
                assert!(
                    replay
                        .poll(Duration::from_secs(2))
                        .expect("segundo")
                        .is_some()
                );
                assert_eq!(replay.poll(Duration::from_secs(3)), Ok(None));
            } else {
                for now in [2, 3] {
                    assert!(matches!(
                        replay.poll(Duration::from_secs(now)),
                        Err(vantare_domain::AdapterError::Rejected(_))
                    ));
                }
            }
        }
    }

    #[test]
    fn oversized_tar_members_are_rejected_before_reading_their_body() {
        for (name, size) in [
            ("shm-000.bin", 2 << 20),
            ("rest-000.json", 10 << 20),
            ("manifest.json", 32 << 20),
        ] {
            // Solo header: el lector anterior reservaba el tamaño y fallaba por EOF.
            let mut header = [0; 512];
            header[..name.len()].copy_from_slice(name.as_bytes());
            header[124..135].copy_from_slice(format!("{size:011o}").as_bytes());
            header[156] = b'0';
            let error = tar_entries(header.as_slice())
                .next()
                .expect("entrada")
                .expect_err("cota previa al cuerpo");
            assert_eq!(error.kind(), io::ErrorKind::InvalidData, "{name}");
        }
    }

    #[test]
    fn oversized_bin_is_rejected_but_a_small_layout_extension_is_accepted() {
        let path =
            std::env::temp_dir().join(format!("vantare-lmu-bounded-{}.bin", std::process::id()));
        let file = File::create(&path).expect("fichero propio");
        file.set_len(2 << 20).expect("fixture disperso");
        drop(file);
        assert!(open_replay(&path, Some("1.3.0.0")).is_err());
        let mut frame = include_bytes!("../../../../../testdata/lmu-fixture.bin").to_vec();
        frame.extend_from_slice(&[0; 512]);
        std::fs::write(&path, frame).expect("extensión pequeña");
        let mut replay = open_replay(&path, Some("1.3.0.0")).expect("extensión compatible");
        assert!(replay.poll(Duration::ZERO).expect("admitido").is_some());
        std::fs::remove_file(path).expect("limpiar fichero propio");
    }

    #[test]
    fn the_real_corpus_opens_with_the_manifest_build_and_47_cars() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../testdata/rust-port/lmu47-high-rate-60s.tar.gz");
        let mut replay = open_replay(&path, None).unwrap();
        let mut cars = 0;
        for millis in (1_000..3_000).step_by(20) {
            if let Some(observation) = replay.poll(Duration::from_millis(millis)).unwrap() {
                cars = observation.state.cars.len();
            }
        }
        assert_eq!(cars, 47);
    }
}
