struct Idle {
    started: std::time::Instant,
    frames: u64,
}

impl eframe::App for Idle {
    fn ui(&mut self, ui: &mut eframe::egui::Ui, _frame: &mut eframe::Frame) {
        self.frames += 1;
        if self.started.elapsed().as_secs() >= 3 {
            eprintln!("frames/3s: {}", self.frames);
            self.frames = 0;
            self.started = std::time::Instant::now();
        }
        eframe::egui::CentralPanel::default().show(ui, |ui| {
            ui.label("egui idle baseline");
        });
    }
}

fn main() -> eframe::Result {
    eframe::run_native(
        "egui idle baseline",
        eframe::NativeOptions {
            viewport: eframe::egui::ViewportBuilder::default().with_inner_size([1920.0, 1080.0]),
            ..Default::default()
        },
        Box::new(|_| {
            Ok(Box::new(Idle {
                started: std::time::Instant::now(),
                frames: 0,
            }))
        }),
    )
}
