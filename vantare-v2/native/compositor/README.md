# compositor — prueba #2022 (VANTA-140)

Prueba acotada, **no producto**: ¿puede un compositor propio (DirectComposition +
Direct2D/DirectWrite) sustituir a GPUI en los overlays? Decisión técnica y
requisitos: issue #2022 y `RECETA.md`.

- Workspace propio: no pertenece al workspace de `native/`, ni a `default-members`,
  ni a la CI, ni al instalador.
- No depende de GPUI ni de `vantare-ui`. `vantare-domain`/`vantare-ipc` solo como
  dev-dependencies del ejemplo, que hace de «doble del núcleo».
- Frontera única entre la parte pura y Windows: `src/escena/capas.rs`.

Compilar siempre por la cola, desde `vantare-v2/`:

```powershell
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo test --manifest-path native/compositor/Cargo.toml --target-dir D:\VantareServer\targets\isa-2022-<slug> -j 4
```
