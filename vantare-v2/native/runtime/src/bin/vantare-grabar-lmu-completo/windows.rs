#![allow(unsafe_code)]
use serde_json::json;
use std::{
    fs::{self, File},
    io::{self, Read},
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use vantare_runtime::lmu_recording::{Record, SCHEMA, Writer};
use windows_sys::Win32::{
    Foundation::CloseHandle,
    System::{
        Console::{CTRL_BREAK_EVENT, CTRL_C_EVENT, SetConsoleCtrlHandler},
        Memory::{
            FILE_MAP_READ, MEMORY_BASIC_INFORMATION, MapViewOfFile, OpenFileMappingW,
            UnmapViewOfFile, VirtualQuery,
        },
    },
};

static STOP: AtomicBool = AtomicBool::new(false);
unsafe extern "system" fn control(code: u32) -> i32 {
    if code == CTRL_C_EVENT || code == CTRL_BREAK_EVENT {
        STOP.store(true, Ordering::Relaxed);
        1
    } else {
        0
    }
}
fn ns(start: Instant) -> u64 {
    u64::try_from(start.elapsed().as_nanos()).unwrap_or(u64::MAX)
}

/// Mapea el objeto completo (longitud 0), consulta sus páginas legibles y copia
/// dos veces. Nunca crea mappings, adquiere el lock del juego ni lee procesos.
fn mapping(name: &str) -> io::Result<(Vec<u8>, bool)> {
    let name: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    // SAFETY: nombre NUL; handles y vista se cierran incluso al fallar la consulta.
    unsafe {
        let handle = OpenFileMappingW(FILE_MAP_READ, 0, name.as_ptr());
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        let view = MapViewOfFile(handle, FILE_MAP_READ, 0, 0, 0);
        if view.Value.is_null() {
            CloseHandle(handle);
            return Err(io::Error::last_os_error());
        }
        let mut info: MEMORY_BASIC_INFORMATION = std::mem::zeroed();
        let queried = VirtualQuery(view.Value, &raw mut info, std::mem::size_of_val(&info));
        let result = if queried == 0 || info.RegionSize == 0 || info.RegionSize > (16 << 20) {
            Err(io::Error::other("mapping sin tamaño legible acotado"))
        } else {
            let mut first = vec![0; info.RegionSize];
            let mut second = first.clone();
            std::ptr::copy_nonoverlapping(view.Value.cast::<u8>(), first.as_mut_ptr(), first.len());
            let mut stable = false;
            for _ in 0..3 {
                std::ptr::copy_nonoverlapping(
                    view.Value.cast::<u8>(),
                    second.as_mut_ptr(),
                    second.len(),
                );
                if first == second {
                    stable = true;
                    break;
                }
                std::mem::swap(&mut first, &mut second);
            }
            Ok((first, stable))
        };
        UnmapViewOfFile(view);
        CloseHandle(handle);
        result
    }
}

fn rest_worker(
    mut paths: Vec<String>,
    interval: Duration,
    start: Instant,
    stop: Arc<AtomicBool>,
    tx: mpsc::SyncSender<Record>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .proxy(None)
            .max_redirects(0)
            .http_status_as_error(false)
            .timeout_global(Some(Duration::from_millis(750)))
            .build()
            .into();
        while !stop.load(Ordering::Relaxed) {
            let round = Instant::now();
            let mut discovered = Vec::new();
            for path in &paths {
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                let started_ns = ns(start);
                let mut record = Record {
                    kind: "rest".into(),
                    key: path.clone(),
                    started_ns,
                    ..Record::default()
                };
                match agent.get(format!("http://127.0.0.1:6397{path}")).call() {
                    Ok(mut response) => {
                        record.status = Some(response.status().as_u16());
                        match response
                            .body_mut()
                            .as_reader()
                            .take((16 << 20) + 1)
                            .read_to_end(&mut record.body)
                        {
                            Ok(_) if record.body.len() <= (16 << 20) => {}
                            Ok(_) => {
                                record.body.truncate(16 << 20);
                                record.error = Some("respuesta truncada: supera 16 MiB".into());
                            }
                            Err(error) => record.error = Some(error.to_string()),
                        }
                    }
                    Err(error) => record.error = Some(error.to_string()),
                }
                record.at_ns = ns(start);
                if path == "/navigation/GetLoadingScreen"
                    && record.status == Some(200)
                    && let Ok(value) = serde_json::from_slice::<serde_json::Value>(&record.body)
                {
                    let id = value["trackInfo"]["id"]
                        .as_str()
                        .or_else(|| value["trackInfo"]["trackId"].as_str());
                    if let Some(id) = id
                        && id.len() <= 128
                        && !id.is_empty()
                        && id
                            .bytes()
                            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_'))
                    {
                        let route = format!("/rest/race/track/{id}/trackmap");
                        if paths.len() < 128 && !paths.contains(&route) {
                            discovered.push(route);
                        }
                    }
                }
                // Cola acotada: presión de disco frena REST; no descarta respuestas.
                if tx.send(record).is_err() {
                    return;
                }
            }
            paths.extend(discovered);
            while round.elapsed() < interval && !stop.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(25));
            }
        }
    })
}

#[derive(Default)]
struct Counts {
    frames: u64,
    rests: u64,
    unstable: u64,
}
fn capture(
    writer: &mut Writer<File>,
    output: &std::path::Path,
    start: Instant,
    rx: &mpsc::Receiver<Record>,
    counts: &mut Counts,
) -> io::Result<()> {
    let mut last_status = Instant::now();
    let mut last_missing = start;
    while !STOP.load(Ordering::Relaxed)
        && !output.join("STOP").exists()
        && start.elapsed() < Duration::from_hours(4)
    {
        let tick = Instant::now();
        for name in ["LMU_Data", "LMU_SharedMemoryLockData"] {
            let started_ns = ns(start);
            match mapping(name) {
                Ok((body, stable)) => {
                    if name == "LMU_Data" {
                        counts.frames += 1;
                        if !stable {
                            counts.unstable += 1;
                        }
                    }
                    writer.record(Record {
                        kind: "shm".into(),
                        key: name.into(),
                        started_ns,
                        at_ns: ns(start),
                        body,
                        details: json!({"stable":stable}),
                        ..Record::default()
                    })?;
                }
                Err(error) if last_missing.elapsed() >= Duration::from_secs(1) => {
                    writer.record(Record {
                        kind: "gap".into(),
                        key: name.into(),
                        started_ns,
                        at_ns: ns(start),
                        error: Some(error.to_string()),
                        ..Record::default()
                    })?;
                }
                Err(_) => {}
            }
        }
        if last_missing.elapsed() >= Duration::from_secs(1) {
            last_missing = Instant::now();
        }
        for mut record in rx.try_iter().take(128) {
            counts.rests += 1;
            record.details["completed_ns"] = json!(record.at_ns);
            record.at_ns = ns(start);
            writer.record(record)?;
        }
        if last_status.elapsed() >= Duration::from_secs(1) {
            writer.flush()?;
            let status = json!({"state":"recording","seconds":start.elapsed().as_secs(),"shm_frames":counts.frames,"unstable_frames":counts.unstable,"rest_responses":counts.rests,"compressed_bytes":fs::metadata(output.join("sesion.lmu.gz"))?.len()});
            fs::write(
                output.join("estado.json"),
                serde_json::to_vec_pretty(&status)?,
            )?;
            println!(
                "{} s | SHM {frames} | inestables {unstable} | REST {rests} | {} MiB",
                start.elapsed().as_secs(),
                status["compressed_bytes"].as_u64().unwrap_or(0) / (1 << 20),
                frames = counts.frames,
                rests = counts.rests,
                unstable = counts.unstable
            );
            last_status = Instant::now();
        }
        if let Some(wait) = Duration::from_nanos(1_000_000_000 / 60).checked_sub(tick.elapsed()) {
            thread::sleep(wait);
        }
    }
    Ok(())
}

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 3 {
        return Err(
            "uso: vantare-grabar-lmu-completo <carpeta nueva> <build LMU> <catalogo.json>".into(),
        );
    }
    let output = PathBuf::from(&args[0]);
    fs::create_dir(&output)?;
    let build = args[1].to_string_lossy().into_owned();
    let catalog: serde_json::Value = serde_json::from_slice(&fs::read(&args[2])?)?;
    let paths: Vec<String> = catalog["capture"]
        .as_array()
        .ok_or("catálogo sin capture")?
        .iter()
        .map(|p| p.as_str().map(str::to_owned).ok_or("ruta no textual"))
        .collect::<Result<_, _>>()?;
    if paths.len() > 250
        || paths
            .iter()
            .any(|p| !p.starts_with("/rest/") && !p.starts_with("/navigation/"))
        || paths
            .iter()
            .any(|p| p.contains(['\r', '\n', '?', '#', '\\']) || p.contains(".."))
    {
        return Err("catálogo fuera de límites".into());
    }
    let start = Instant::now();
    let mut writer = Writer::new(
        File::options()
            .write(true)
            .create_new(true)
            .open(output.join("sesion.lmu.gz"))?,
    );
    writer.record(Record {kind:"header".into(),details:json!({"schema":SCHEMA,"build":build,"utc_unix_ns":SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos().to_string(),"catalog":catalog,"shm_hz":60,"rest_core_ms":250,"rest_inventory_min_ms":2000,"privacy":"RAW: nombres de pilotos, rutas locales, configuración. No compartir públicamente.","mappings":["LMU_Data","LMU_SharedMemoryLockData"],"mapping_size":"páginas completas VirtualQuery; incluye padding"}),..Record::default()})?;
    // SAFETY: handler estático; únicamente cambia un AtomicBool.
    if unsafe { SetConsoleCtrlHandler(Some(control), 1) } == 0 {
        return Err(io::Error::last_os_error().into());
    }
    let stop = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::sync_channel(128);
    let core = vec![
        "/rest/watch/standings".into(),
        "/rest/watch/sessionInfo".into(),
    ];
    let other = paths.into_iter().filter(|p| !core.contains(p)).collect();
    let workers = [
        rest_worker(
            core,
            Duration::from_millis(250),
            start,
            stop.clone(),
            tx.clone(),
        ),
        rest_worker(other, Duration::from_secs(2), start, stop.clone(), tx),
    ];
    let mut counts = Counts::default();
    let result = capture(&mut writer, &output, start, &rx, &mut counts);
    stop.store(true, Ordering::Relaxed);
    // Drena antes de join para que una cola llena no bloquee el cierre.
    while workers.iter().any(|w| !w.is_finished()) {
        for mut record in rx.try_iter() {
            counts.rests += 1;
            if result.is_ok() {
                record.details["completed_ns"] = json!(record.at_ns);
                record.at_ns = ns(start);
                writer.record(record)?;
            }
        }
        thread::sleep(Duration::from_millis(20));
    }
    for worker in workers {
        worker.join().map_err(|_| "hilo REST falló")?;
    }
    for mut record in rx.try_iter() {
        counts.rests += 1;
        if result.is_ok() {
            record.details["completed_ns"] = json!(record.at_ns);
            record.at_ns = ns(start);
            writer.record(record)?;
        }
    }
    result?;
    let summary = json!({"state":"complete","seconds":start.elapsed().as_secs(),"shm_frames":counts.frames,"unstable_frames":counts.unstable,"rest_responses":counts.rests,"usable_capture":counts.frames>counts.unstable,"maximum_hours":4});
    writer.record(Record {
        kind: "footer".into(),
        at_ns: ns(start),
        details: summary.clone(),
        ..Record::default()
    })?;
    writer.finish()?.sync_all()?;
    fs::write(
        output.join("estado.json"),
        serde_json::to_vec_pretty(&summary)?,
    )?;
    println!("FINALIZADO: {}", output.join("sesion.lmu.gz").display());
    if counts.frames == 0 {
        return Err("no se grabó LMU_Data; conserva el log para diagnóstico".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::{
        Foundation::INVALID_HANDLE_VALUE,
        System::Memory::{CreateFileMappingW, FILE_MAP_WRITE, PAGE_READWRITE},
    };
    #[test]
    fn captures_the_entire_mapping_read_only_without_fixed_product_layout_size() {
        let name = format!("vantare-lmu-full-test-{}", std::process::id());
        let wide: Vec<_> = name.encode_utf16().chain(Some(0)).collect();
        // SAFETY: objeto privado del test, no LMU_Data; todas las vistas/handles
        // se cierran antes de los asserts sobre la copia propia del lector.
        let result = unsafe {
            let handle = CreateFileMappingW(
                INVALID_HANDLE_VALUE,
                std::ptr::null(),
                PAGE_READWRITE,
                0,
                8192,
                wide.as_ptr(),
            );
            assert!(!handle.is_null());
            let view = MapViewOfFile(handle, FILE_MAP_WRITE, 0, 0, 8192);
            assert!(!view.Value.is_null());
            std::ptr::write_bytes(view.Value, 0xA7, 8192);
            let result = mapping(&name);
            UnmapViewOfFile(view);
            CloseHandle(handle);
            result
        };
        let (bytes, stable) = result.expect("mapping propio legible");
        assert!(stable);
        assert_eq!(bytes.len(), 8192);
        assert!(bytes.iter().all(|b| *b == 0xA7));
        assert!(
            mapping(&name).is_err(),
            "el lector no crea mappings ausentes"
        );
    }
}
