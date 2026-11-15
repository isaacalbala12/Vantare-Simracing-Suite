//! Compatibility facade; persistence and document data belong to IPC.
use std::{path::PathBuf, time::SystemTime};
pub use vantare_ipc::layout::{
    CanvasResolution, Error, Instance, Layout, MAX_BYTES, OffTrack, Presentation, READ_VERSION,
    VERSION, default_path,
};
pub struct Document(vantare_ipc::layout::Document);
impl Document {
    pub fn open(path: PathBuf) -> Result<Self, Error> {
        vantare_ipc::layout::Document::open(path).map(Self)
    }
    pub fn from_observed(
        path: PathBuf,
        bytes: Option<Vec<u8>>,
        layout: Layout,
        stamp: Option<SystemTime>,
        preserve_backup: bool,
    ) -> Result<Self, Error> {
        vantare_ipc::layout::Document::from_observed(path, bytes, layout, stamp, preserve_backup)
            .map(Self)
    }
    pub fn layout(&self) -> &Layout {
        self.0.layout()
    }
    pub fn exists(&self) -> bool {
        self.0.exists()
    }
    pub fn poll(&mut self) -> Result<bool, Error> {
        self.0.poll()
    }
    pub fn initialize(&mut self, monitor: (f32, f32, f32, f32)) -> Result<(), Error> {
        if self.exists() {
            return Ok(());
        }
        self.0.initialize_with(&crate::app::starter_layout(monitor))
    }
    pub fn save(&mut self, layout: &Layout) -> Result<(), Error> {
        self.0.save(layout)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        sync::atomic::{AtomicU64, Ordering},
    };
    fn directory() -> PathBuf {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "vantare-layout-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).expect("directorio temporal");
        path
    }
    #[test]
    fn initialization_adopts_the_first_writer_and_preserves_explicit_empty_layouts() {
        let dir = directory();
        let path = dir.join("layout.json");
        let monitor = (0.0, 0.0, 1920.0, 1080.0);
        let mut hub = Document::open(path.clone()).expect("Hub antes de overlays");
        let mut overlays = Document::open(path.clone()).expect("overlays antes de Hub");
        overlays.initialize(monitor).expect("primer escritor");
        hub.initialize(monitor).expect("adoptar creación tardía");
        assert_eq!(hub.layout(), overlays.layout());
        assert_eq!(hub.layout().instances.len(), 4);
        let mut changed = hub.layout().clone();
        changed.instances[0].x += 20.0;
        hub.save(&changed).expect("guardar sin falso conflicto");
        // Dos reemplazos rápidos pueden compartir mtime; esta prueba comprueba
        // inicialización/recarga, no la verificación periódica de bytes de IPC.
        fs::File::options()
            .write(true)
            .open(&path)
            .expect("archivo del test")
            .set_modified(SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1))
            .expect("marca de cambio explícita");
        assert!(overlays.poll().expect("recargar en pista"));
        assert_eq!(overlays.layout(), &changed);
        overlays
            .save(&Layout::default())
            .expect("vaciar explícitamente");
        let mut reopened = Document::open(path).expect("vacío guardado por el usuario");
        reopened.initialize(monitor).expect("respetar vacío");
        assert_eq!(
            reopened.layout().instances,
            [] as [crate::layout::Instance; 0]
        );
        fs::remove_dir_all(dir).expect("limpiar");
    }
    #[test]
    fn concurrent_initializers_share_one_layout_without_a_startup_conflict() {
        let dir = directory();
        let path = dir.join("layout.json");
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let other_barrier = barrier.clone();
        let mut hub = Document::open(path.clone()).expect("Hub antes de crear archivo");
        let overlays = std::thread::spawn(move || {
            let mut document = Document::open(path).expect("overlays antes de crear archivo");
            other_barrier.wait();
            document
                .initialize((0.0, 0.0, 1920.0, 1080.0))
                .expect("inicializar overlays");
            document.layout().clone()
        });
        barrier.wait();
        hub.initialize((0.0, 0.0, 1920.0, 1080.0))
            .expect("inicializar Hub");
        assert_eq!(hub.layout(), &overlays.join().expect("hilo overlays"));
        assert_eq!(hub.layout().instances.len(), 4);
        fs::remove_dir_all(dir).expect("limpiar");
    }
}
