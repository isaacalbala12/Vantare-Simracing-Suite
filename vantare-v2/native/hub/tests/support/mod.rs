// Calloop reinicia stop al entrar en run(): el cierre del harness debe
// ejecutarse desde el bucle, no dentro del callback inicial de lanzamiento.
pub fn quit_headless_test(cx: &mut gpui::App) {
    cx.spawn(async |cx| {
        cx.update(|cx| cx.quit());
    })
    .detach();
}
