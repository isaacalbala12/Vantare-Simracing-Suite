# Reglas de la aplicación nativa (#1530)

Estas reglas complementan `../AGENTS.md`. GitHub Issues es el tracker.
Lee `README.md`, el README del módulo y el único handoff vivo aplicable.

## Módulos e interfaces

- `domain`: modelo neutral, Adapter y proyecciones puras; sin I/O, GPUI ni runtime.
- `ipc`: DTO versionados, transporte y control entre procesos; depende de domain.
- `runtime`: adapters privados, núcleo, derivaciones, flujos y supervisor.
- `ui`: widgets y hosts GPUI; sin dependencia directa/transitiva de runtime.
- `hub`: aplicación y Studio; presenta datos/comandos, no autentica ni cobra.
- `services`: Clerk, licencia, Polar y red bajo demanda; sin UI.
- `engineer`: consumidor de eventos/radio/voz; `storage`: único dueño de DuckDB.
- `launcher`: motor y archivos locales; Hub conserva su presentación.
- `profiling`: contadores por proceso; `build-support`: recurso Win32 compartido.
- `strategy`: documento/solver; `admin`: herramienta privada fuera del instalador.

## Revisión de cada PR (auditoría v2, §10)

1. Widget nuevo o portado: una proyección en domain, un módulo en ui y una
   línea en registry.rs. N Looks sobre un estado; unificar existentes está en curso (#1531).
2. Justificar cambios en frame_with_motion, Level::hz o allows_widget.
3. Campo nuevo en SnapshotDto: subir VERSION o explicar por qué no.
   El pipe live es estricto; compatibilidad guardada usa un lector explícito.
4. Ningún #[path] nuevo entre crates; reutilizar la interfaz del crate dueño.
5. Ningún commit en internal/, cmd/, pkg/ o frontend/ salvo hotfix autorizado.
6. Ningún fichero hub/src >2000 LOC sin plan de partición en el mismo PR.
7. Adapter neutral: reglas del simulador dentro de su adapter; widgets reciben
   ViewModels, sin persistencia, permisos, red ni posición espacial.

## Gates y evidencia

- Compilar solo por la cola: `pwsh -NoProfile -File
  C:/tmp/fase2/compilar.ps1 <comando>` en esta ola; después usar la cola del repo.
- Target aislado por worktree, `-j 2`, Rust fijado y dependencias locked/offline.
- Desde native/: cargo fmt --all -- --check; gates.ps1 -Gate clippy
  (-D warnings), test (Nextest) y lifecycle, todos por la cola.
- Añadir gates.ps1 -Gate telemetria si cambia runtime, domain, ipc o testdata.
- Capturas solo con el mutex del comparador y sin pantalla-ocupada;
  inspeccionarlas antes de afirmar paridad. Tests no prueban runtime físico.
- Commits por hito, diff completo y handoff/issue con SHA, gates y límites.
  Implementado, integrado, promocionado y publicado son estados distintos.
