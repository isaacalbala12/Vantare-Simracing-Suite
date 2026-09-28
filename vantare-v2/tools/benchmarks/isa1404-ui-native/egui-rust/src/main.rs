use eframe::egui;

#[derive(Default)]
struct Smoke {
    overlay: bool,
}

impl eframe::App for Smoke {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        egui::CentralPanel::default().show(ui, |ui| {
            ui.heading("Vantare native UI · egui");
            ui.checkbox(&mut self.overlay, "Mostrar overlay");
            ui.label("P09  PLAYER  +0.000");
        });
        if self.overlay {
            ctx.show_viewport_deferred(
                egui::ViewportId::from_hash_of("overlay"),
                egui::ViewportBuilder::default()
                    .with_title("Vantare egui Smoke Overlay")
                    .with_inner_size([360.0, 120.0])
                    .with_transparent(true)
                    .with_decorations(false)
                    .with_always_on_top(),
                |ui, _| {
                    ui.label("VANTARE / STANDINGS");
                    ui.label("P09  PLAYER  +0.000");
                },
            );
        }
    }
}

fn main() -> eframe::Result {
    eframe::run_native(
        "Vantare egui Smoke Control",
        eframe::NativeOptions::default(),
        Box::new(|_| Ok(Box::new(Smoke::default()))),
    )
}
