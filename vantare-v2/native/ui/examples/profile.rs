//! QA: asignaciones del hilo UI, acotadas a ingest, frame y pintado productivos.
use std::{
    alloc::{GlobalAlloc, Layout, System},
    cell::Cell,
};
thread_local! {
    static ACTIVE: Cell<bool> = const { Cell::new(false) };
    static COUNTS: Cell<(u64,u64)> = const { Cell::new((0,0)) };
}
struct Counting;
fn record(bytes: usize) {
    if ACTIVE.try_with(Cell::get).unwrap_or(false) {
        let _ = COUNTS.try_with(|counts| {
            let (n, b) = counts.get();
            counts.set((n + 1, b + bytes as u64));
        });
    }
}
// SAFETY: se conserva el contrato y alineación de System; solo se cuentan solicitudes.
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        record(layout.size());
        // SAFETY: el Layout recibido es el mismo que se pasa a System.
        unsafe { System.alloc(layout) }
    }
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        record(layout.size());
        // SAFETY: se delega el mismo Layout y contrato de memoria cero.
        unsafe { System.alloc_zeroed(layout) }
    }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        // SAFETY: todos los bloques proceden de System con este Layout.
        unsafe {
            System.dealloc(ptr, layout);
        }
    }
    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        record(size);
        // SAFETY: se delegan puntero, Layout y tamaño sin alterarlos.
        unsafe { System.realloc(ptr, layout, size) }
    }
}
#[global_allocator]
static ALLOCATOR: Counting = Counting;
#[cfg(feature = "parity-capture")]
fn count(begin: bool) -> (u64, u64) {
    ACTIVE.with(|active| active.set(begin));
    if begin {
        COUNTS.with(|counts| counts.set((0, 0)));
        (0, 0)
    } else {
        COUNTS.with(Cell::get)
    }
}
#[cfg(feature = "parity-capture")]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 3 {
        return Err("uso: profile layout.json fotos.json perfil.json".into());
    }
    let layout = vantare_ui::layout::Layout::from_json(&std::fs::read(&args[0])?)?;
    let settings = layout
        .instances
        .first()
        .ok_or("layout vacío")?
        .settings
        .clone();
    let photos = vantare_ui::workshop::snapshots_from_json(&std::fs::read_to_string(&args[1])?)?;
    let code = vantare_ui::benchmark::run_counted(
        settings,
        layout.preferences,
        photos,
        (&args[2]).into(),
        Some(count),
    );
    if code == std::process::ExitCode::SUCCESS {
        Ok(())
    } else {
        Err("fallo del perfil".into())
    }
}
#[cfg(not(feature = "parity-capture"))]
fn main() {
    eprintln!("requiere parity-capture");
}
