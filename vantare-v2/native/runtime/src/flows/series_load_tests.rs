//! Carga sintética explícita: contrato de no espera, no presupuesto LMU/OBS.
#![allow(clippy::unwrap_used)]

use std::mem::size_of;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use vantare_domain::{CarId, Observation, Quality};

use super::*;
use crate::core::Core;

const FRAMES: u32 = 36_000;
const LAP_SAMPLES: u32 = 12_000;
const CARS: u32 = 104;
const CAPACITY: usize = 2;

/// 100 Hz lógicos, vueltas de 120 s, SI y reloj determinista. No captura LMU.
fn photo(index: u32) -> Observation {
    let mut photo = super::series_feed_tests::photo(index, index / LAP_SAMPLES);
    let car = &mut photo.state.cars[0];
    car.lap_distance_m = Quality::Reliable(f64::from(index % LAP_SAMPLES) * 0.5);
    car.lap_elapsed_s = Quality::Reliable(f64::from(index % LAP_SAMPLES) / 100.0);
    photo.state.cars = (0..CARS)
        .map(|id| {
            let mut car = car.clone();
            car.id = CarId(id);
            car
        })
        .collect();
    photo
}

fn acquire(core: &mut Core) -> Duration {
    let started = Instant::now();
    for index in 0..FRAMES {
        core.observe(photo(index)).unwrap();
    }
    core.series_mut().flush();
    started.elapsed()
}

#[test]
fn saturated_delivery_keeps_acquisition_progress_without_the_storage_owner_draining() {
    // Pareja secuencial; tiempos de debug informativos, incluyen generador y
    // Core. Otros workers compilan: no usar ratio como gate de rendimiento.
    let baseline = acquire(&mut Core::new(1));
    let mut core = Core::new(1);
    let receiver = core.series_mut().subscribe(CAPACITY).unwrap();
    let (done, progress) = mpsc::channel();
    let producer = thread::spawn(move || {
        let elapsed = acquire(&mut core);
        done.send((core, elapsed)).unwrap();
    });
    // El receptor permanece vivo y nadie lo lee hasta acabar la adquisición.
    // Si se cambia try_send por send, esto vence y falla: no pasa en vacío.
    let (mut core, saturated) = progress
        .recv_timeout(Duration::from_mins(1))
        .expect("adquisición esperó al receptor saturado, o excedió el plazo diagnóstico");
    producer.join().unwrap();
    assert_eq!(core.snapshot().sequence, u64::from(FRAMES));
    assert_eq!(
        core.snapshot().state.cars.len(),
        usize::try_from(CARS).unwrap()
    );
    assert!(core.series().active().unwrap().samples.len() <= MAX_LAP_SAMPLES);
    assert!(core.series().sealed().unwrap().samples.len() <= MAX_LAP_SAMPLES);
    let status = core.series().publication_status().unwrap();
    assert_eq!(status.delivered, u64::try_from(CAPACITY).unwrap());
    assert_eq!(status.dropped, status.attempted - status.delivered);
    assert!(
        status.dropped > 500,
        "carga real del contrato, no una muestra"
    );
    assert!(!status.disconnected);

    let queued: Vec<_> = receiver.try_iter().collect();
    assert_eq!(queued.len(), CAPACITY);
    let queued_samples: usize = queued.iter().map(|chunk| chunk.block.samples.len()).sum();
    assert_eq!(queued_samples, CAPACITY * MAX_CHUNK_SAMPLES);
    let mut analysis = SeriesAnalysis::new(2).unwrap();
    for chunk in queued {
        analysis.consume(&chunk).unwrap();
    }
    // Tras liberar la cola, el siguiente seal hace visible todo lo perdido,
    // sin detener/reiniciar Core ni rellenar las vueltas no recibidas.
    core.observe(photo(FRAMES)).unwrap();
    let after_loss = receiver.try_recv().unwrap();
    assert_eq!(after_loss.lost_before, status.dropped);
    assert_eq!(after_loss.index, status.attempted + 1);
    assert_eq!(after_loss.block.sealed_at, Some(u64::from(FRAMES) + 1));
    analysis.consume(&after_loss).unwrap();
    assert!(analysis.recent().iter().all(|summary| summary.gap));
    assert!(
        analysis
            .recent()
            .iter()
            .all(|summary| summary.continuous_span_s().is_none())
    );
    assert_eq!(analysis.recent().back().unwrap().samples, 0);

    eprintln!(
        "ISA-1429 carga sintética debug: frames={FRAMES}, coches={CARS}, hz_lógicos=100, \
         baseline_ms={:.3}, receptor_saturado_ms={:.3}, intentos={}, entregados={}, \
         perdidos={}, cola_muestras={}, cola_payload_bytes={}; sin DuckDB/LMU/OBS",
        baseline.as_secs_f64() * 1000.0,
        saturated.as_secs_f64() * 1000.0,
        status.attempted,
        status.delivered,
        status.dropped,
        queued_samples,
        queued_samples * size_of::<LapSample>(),
    );
}
