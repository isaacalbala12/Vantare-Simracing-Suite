# Reglas de la aplicación nativa (#1530)

Estas reglas complementan `../AGENTS.md`. GitHub Issues es el tracker.
Lee `README.md`, el README del módulo y el único handoff vivo aplicable.

El mapa de crates y sus fronteras viven en [README.md](README.md),
«Dependencias permitidas»; no mantener otra copia aquí.

## Revisión de cada PR (auditoría v2, §10)

1. Widget nuevo o portado: una proyección en domain, un módulo en ui y una
   línea en registry.rs. N Looks sobre un estado, integrado para los cuatro widgets de #1531.
2. Justificar cambios en frame_with_motion, Level::hz o allows_widget.
3. Campo nuevo en SnapshotDto: subir VERSION o explicar por qué no.
   El pipe live es estricto; compatibilidad guardada usa un lector explícito.
4. Ningún #[path] nuevo entre crates; reutilizar la interfaz del crate dueño.
5. Ningún commit en internal/, cmd/, pkg/ o frontend/ salvo hotfix autorizado.
6. `hub/tests/architecture.rs` vigila 2000 líneas por archivo Rust de hub/src;
   solo analysis/view (2069), launcher/showcase (2139), services/view (1750)
   y settings/view (2145) conservan techo propio (#1561). Bajar es libre;
   subir un techo exige plan de partición en el mismo PR. Studio no tiene excepción.
7. Adapter neutral: reglas del simulador dentro de su adapter; widgets reciben
   ViewModels, sin persistencia, permisos, red ni posición espacial.

## Gates y evidencia

- Compilar solo por la cola desde `vantare-v2/`:
  `pwsh -NoProfile -File native/scripts/compilar.ps1 <comando>`.
- Target aislado por worktree, `-j 2`, Rust fijado y dependencias locked/offline.
- Desde native/: cargo fmt --all -- --check; gates.ps1 -Gate clippy
  (-D warnings), test (Nextest) y lifecycle, todos por la cola.
- Añadir gates.ps1 -Gate telemetria si cambia código/fixtures de runtime, domain, ipc o testdata.
- Capturas solo con el mutex del comparador y sin pantalla-ocupada;
  inspeccionarlas antes de afirmar paridad. Tests no prueban runtime físico.
- Commits por hito, diff completo y handoff/issue con SHA, gates y límites.
  Implementado, integrado, promocionado y publicado son estados distintos.
