# ui — overlays GPUI

GPUI de Zed (rev `72d28c32`, la del prototipo de paridad ISA-1410) usado
directamente; el crate añade la integración Win32 (`overlay.rs`: transparencia,
click-through, sin foco, sin marco DWM, DPI), el texto Inter con `letter-spacing`
(`text.rs`) y los widgets Standings Eficiencia, radar y pedales.

```powershell
cd vantare-v2/native
cargo run -p vantare-ui --release --bin vantare-overlays -- 4   # 1, 4 o 22 ventanas
```

Sin IPC todavía, el binario se alimenta de `source::local_feed()` (carrera
sintética a 30 Hz). Para conectar el `Subscriber` de `ipc`, pasar su
`flume::Receiver<Arc<Snapshot>>` a `vantare_ui::run` en lugar de `local_feed()`.

Cada ventana proyecta la instantánea con el `ViewModel` de `domain` y solo
repinta cuando ese ViewModel cambia (Standings: solo lo que se dibuja; mientras
haya animación pide fotogramas).

## Paridad visual

`parity.ps1 -Parity <tools/native-ui/parity>` captura la escena `standings-44`
con la feature `parity-capture` (dos pasadas GDI negro/blanco) y la compara con
`reference/standings-44.png` con `diff.py`. Resultado en esta fase: 3,68 %
(6341 / 172536 px, umbral 8), igual que el prototipo; la diferencia es la
rasterización del texto de DirectWrite frente a Chrome. La referencia y
`diff.py` viven en la rama del ensayo ISA-1410, no en esta.
