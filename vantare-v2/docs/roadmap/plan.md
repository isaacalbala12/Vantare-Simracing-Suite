# Plan del roadmap

Fuente de verdad **manual** del roadmap publico. Lo edita una persona; nadie lo
genera. De aqui salen las fases, las areas y los hitos que pinta la pagina
Roadmap del hub.

El artefacto que consume la app es `roadmap.json`, y **no se edita a mano**: lo
escribe `.github/scripts/roadmap_digest.py` combinando este fichero con los
commits ya mergeados a `nightly`. Para regenerarlo en local:

```sh
python .github/scripts/roadmap_digest.py --repo . --ref origin/nightly
```

## Formato

Deliberadamente plano, para editarlo sin pensar en el parser:

- `##` abre seccion: `Fases`, `Areas` o `Hitos`. Cualquier otra se ignora.
- `###` abre una entrada. El texto del encabezado es su **titulo en espanol**.
- `- clave: valor` declara un campo; el idioma va en la clave
  (`- resumen.en: ...`). Sin sufijo, el valor se usa para los cuatro idiomas.
- `- item:` anade un punto a la fase; `- item.en:` traduce el ultimo anadido.
- Cualquier otra linea es prosa para quien edita y no llega al artefacto.

Claves por seccion:

| Seccion | Claves |
| --- | --- |
| Fases | `id`, `estado`, `etiqueta`, `objetivo`, `progreso`, `resumen`, `titulo`, `item` |
| Areas | `id`, `estado`, `progreso`, `titulo`, `proyectos` |
| Hitos | `id`, `tipo`, `titulo`, `cuerpo`, `etiqueta` |

`estado` es `done`, `in-progress`, `planned` o `future`, y solo una fase puede
estar `in-progress`. `tipo` es `release`, `feature`, `fix` o `plan`.

---

## Fases

### Beta pública

- id: beta-foundation
- estado: done
- progreso: 100
- etiqueta: Fase 1
- etiqueta.en: Phase 1
- objetivo: v0.1.0
- titulo.en: Public beta
- titulo.pt: Beta pública
- titulo.it: Beta pubblica
- resumen: Login Google, plan Free, overlays recomendados, launcher LMU y Hub v5.2.
- resumen.en: Google login, Free plan, recommended overlays, LMU launcher and Hub v5.2.
- resumen.pt: Login Google, plano Free, overlays recomendados, launcher LMU e Hub v5.2.
- resumen.it: Login Google, piano Free, overlay consigliati, launcher LMU e Hub v5.2.
- item: Google OAuth externo y sesión persistente
- item.en: External Google OAuth and persistent session
- item.pt: Google OAuth externo e sessão persistente
- item.it: Google OAuth esterno e sessione persistente
- item: Perfiles recomendados y editor de overlays
- item.en: Recommended profiles and overlay editor
- item.pt: Perfis recomendados e editor de overlays
- item.it: Profili consigliati e editor di overlay
- item: Launcher LMU básico
- item.en: Basic LMU launcher
- item.pt: Launcher LMU básico
- item.it: Launcher LMU di base

### Pulido beta v0.1.x

- id: beta-iteration
- estado: in-progress
- progreso: 75
- etiqueta: Fase 2
- etiqueta.en: Phase 2
- objetivo: v0.1.x
- titulo.en: Beta polish v0.1.x
- titulo.pt: Polimento beta v0.1.x
- titulo.it: Polish beta v0.1.x
- resumen: Command Orbit como única shell, Overlay Studio V3, telemetría LMU en vivo, licencias con credencial offline y Launcher con cadenas de lanzamiento.
- resumen.en: Command Orbit as the only shell, Overlay Studio V3, live LMU telemetry, offline-credential licensing and a Launcher with launch chains.
- resumen.pt: Command Orbit como única shell, Overlay Studio V3, telemetria LMU ao vivo, licenças com credencial offline e Launcher com cadeias de lançamento.
- resumen.it: Command Orbit come unica shell, Overlay Studio V3, telemetria LMU dal vivo, licenze con credenziale offline e Launcher con catene di avvio.
- item: Command Orbit v0.3 portada al hub y V5.2 retirada
- item.en: Command Orbit v0.3 ported to the hub and V5.2 retired
- item.pt: Command Orbit v0.3 portada para o hub e V5.2 retirada
- item.it: Command Orbit v0.3 portata nell'hub e V5.2 ritirata
- item: Overlay Studio V3 con los catálogos Crystal, Neo y Endurance
- item.en: Overlay Studio V3 with the Crystal, Neo and Endurance catalogues
- item.pt: Overlay Studio V3 com os catálogos Crystal, Neo e Endurance
- item.it: Overlay Studio V3 con i cataloghi Crystal, Neo ed Endurance
- item: Telemetría LMU en vivo con transporte acotado dirigido a consumidores y proyecciones
- item.en: Live LMU telemetry with bounded consumer-targeted transport and projections
- item.pt: Telemetria LMU ao vivo com transporte limitado dirigido aos consumidores e projeções
- item.it: Telemetria LMU dal vivo con trasporto limitato diretto ai consumatori e proiezioni
- item: Licencias con credencial offline y arranque desde caché
- item.en: Licensing with offline credentials and cache-first startup
- item.pt: Licenças com credencial offline e arranque a partir da cache
- item.it: Licenze con credenziale offline e avvio dalla cache
- item: Launcher con detección de apps y cadenas de lanzamiento
- item.en: Launcher with app detection and launch chains
- item.pt: Launcher com deteção de apps e cadeias de lançamento
- item.it: Launcher con rilevamento app e catene di avvio
- item: Banco reproducible de huella por hardware para Vantare y el overlay
- item.en: Reproducible hardware footprint bench for Vantare and the overlay
- item.pt: Banco reproduzível de impacto por hardware para Vantare e o overlay
- item.it: Banco riproducibile dell'impronta hardware per Vantare e l'overlay

### Ingeniero y estrategia

- id: engineer
- estado: planned
- progreso: 25
- etiqueta: Fase 3
- etiqueta.en: Phase 3
- objetivo: Por planear
- objetivo.en: To plan
- objetivo.pt: Por planear
- objetivo.it: Da pianificare
- titulo.en: Engineer and strategy
- titulo.pt: Engenheiro e estratégia
- titulo.it: Engineer e strategia
- resumen: Ingeniero y estrategia con avisos útiles sobre datos ya validados; la voz llega cuando los datos la sostengan.
- resumen.en: Engineer and strategy with useful alerts over validated data; voice arrives once the data supports it.
- resumen.pt: Engenheiro e estratégia com avisos úteis sobre dados validados; a voz chega quando os dados a sustentarem.
- resumen.it: Engineer e strategia con avvisi utili su dati validati; la voce arriva quando i dati la sostengono.
- item: Proyecciones de ingeniero y estrategia sobre telemetría real
- item.en: Engineer and strategy projections over real telemetry
- item.pt: Projeções de engenheiro e estratégia sobre telemetria real
- item.it: Proiezioni engineer e strategia su telemetria reale
- item: Suite de análisis sobre la grabación DuckDB (ADR 0004/0005)
- item.en: Analysis suite over the DuckDB recording (ADR 0004/0005)
- item.pt: Suite de análise sobre a gravação DuckDB (ADR 0004/0005)
- item.it: Suite di analisi sulla registrazione DuckDB (ADR 0004/0005)
- item: Reglas locales primero
- item.en: Local rules first
- item.pt: Regras locais primeiro
- item.it: Regole locali prima
- item: Voz y perfiles avanzados después
- item.en: Voice and advanced profiles later
- item.pt: Voz e perfis avançados depois
- item.it: Voce e profili avanzati dopo

### Ecosistema

- id: ecosystem
- estado: future
- progreso: 10
- etiqueta: Fase 4
- etiqueta.en: Phase 4
- objetivo: Futuro
- objetivo.en: Future
- objetivo.pt: Futuro
- objetivo.it: Futuro
- titulo.en: Ecosystem
- titulo.pt: Ecossistema
- titulo.it: Ecosistema
- resumen: Comunidad, planes de pago, multisim y analíticas reales cuando la base esté estable.
- resumen.en: Community, paid plans, multisim and real analytics once the base is stable.
- resumen.pt: Comunidade, planos pagos, multisim e analíticas reais quando a base estiver estável.
- resumen.it: Community, piani a pagamento, multisim e analitiche reali quando la base è stabile.
- item: Comunidad de overlays
- item.en: Overlay community
- item.pt: Comunidade de overlays
- item.it: Community di overlay
- item: Planes de pago y suite reales
- item.en: Real paid and suite plans
- item.pt: Planos pagos e suite reais
- item.it: Piani a pagamento e suite reali
- item: Datos reales de carrera y progresión
- item.en: Real race and progression data
- item.pt: Dados reais de corrida e progressão
- item.it: Dati reali di gara e progressione

---

## Areas

### Overlays Studio

- id: overlays-studio
- estado: in-progress
- progreso: 75
- proyectos: overlay-studio-v3

### Launcher

- id: launcher-lmu
- estado: in-progress
- progreso: 75
- proyectos: launcher

### Telemetría

- id: telemetry
- estado: in-progress
- progreso: 25
- titulo.en: Telemetry
- titulo.pt: Telemetria
- titulo.it: Telemetria
- proyectos: telemetry-core, telemetry-analysis

### Calendario

- id: calendar-local
- estado: in-progress
- progreso: 50
- titulo.en: Calendar
- titulo.pt: Calendário
- titulo.it: Calendario
- proyectos: calendar

### Ingeniero

- id: engineer
- estado: in-progress
- progreso: 50
- titulo.en: Engineer
- titulo.pt: Engenheiro
- titulo.it: Engineer
- proyectos: engineer-spotter

### Estrategia

- id: strategy
- estado: in-progress
- progreso: 25
- titulo.en: Strategy
- titulo.pt: Estratégia
- titulo.it: Strategia
- proyectos: strategy-planner

### Licencias y cuenta

- id: licensing
- estado: in-progress
- progreso: 50
- titulo.en: Licensing and account
- titulo.pt: Licenças e conta
- titulo.it: Licenze e account
- proyectos: billing

### Plataforma

- id: platform
- estado: in-progress
- progreso: 25
- titulo.en: Platform
- titulo.pt: Plataforma
- titulo.it: Piattaforma
- proyectos: roadmap-governance, huella-minima-banco

---

## Hitos

### Banco reproducible de huella por hardware

- id: huella-minima-banco
- tipo: feature
- titulo.en: Reproducible hardware footprint bench
- titulo.pt: Banco reproduzível de impacto por hardware
- titulo.it: Banco riproducibile dell'impronta hardware
- cuerpo: Un banco Windows mide RAM, CPU y GPU por proceso, atribuye Hub y overlay con PID confirmados por CDP, excluye muestras GPU inválidas, recupera sesiones ETW huérfanas y solo publica frametime de LMU cuando PresentMon entrega frames válidos. El nuevo programa reutilizará este banco para auditar y optimizar Telemetría V2, comparando también Vantare con información equivalente del HUD de LMU. Las mejoras requieren medidas repetidas, control de ruido y ausencia de regresiones relevantes; no están demostradas por aprobar el plan.
- cuerpo.en: A Windows bench measures RAM, CPU and GPU per process, attributes Hub and overlay with CDP-confirmed PIDs, excludes invalid GPU samples, recovers orphaned ETW sessions, and only publishes LMU frame time when PresentMon provides valid frames. The new programme will reuse this bench to audit and optimise Telemetry V2, also comparing Vantare with equivalent LMU HUD information. Gains require repeated measurements, noise control and no meaningful regressions; approving the plan does not prove them.
- cuerpo.pt: Um banco Windows mede RAM, CPU e GPU por processo, atribui Hub e overlay com PIDs confirmados por CDP, exclui amostras GPU inválidas, recupera sessões ETW órfãs e só publica o tempo de frame do LMU quando o PresentMon fornece frames válidos. O novo programa reutilizará este banco para auditar e otimizar a Telemetria V2, comparando também Vantare com informação equivalente do HUD do LMU. Os ganhos exigem medições repetidas, controlo de ruído e ausência de regressões relevantes; aprovar o plano não os demonstra.
- cuerpo.it: Un banco Windows misura RAM, CPU e GPU per processo, attribuisce Hub e overlay con PID confermati da CDP, esclude i campioni GPU non validi, recupera le sessioni ETW orfane e pubblica il frame time di LMU solo quando PresentMon fornisce frame validi. Il nuovo programma riutilizzerà questo banco per verificare e ottimizzare Telemetry V2, confrontando anche Vantare con informazioni equivalenti dell'HUD di LMU. I miglioramenti richiedono misure ripetute, controllo del rumore e nessuna regressione significativa; l'approvazione del piano non li dimostra.
- etiqueta: Feature

### Preferencias y prueba de notificaciones

- id: notification-system
- tipo: fix
- titulo.en: Notification preferences and test
- titulo.pt: Preferências e teste de notificações
- titulo.it: Preferenze e prova delle notifiche
- cuerpo: Los avisos de actualización respetan la preferencia guardada y Ajustes permite enviar una prueba de Windows con resultado visible; Spotter permanece en su overlay y audio de carrera, fuera de los canales de notificación del producto.
- cuerpo.en: Update alerts respect the saved preference and Settings can send a Windows test with a visible result; Spotter remains in its race overlay and audio, outside the product notification channels.
- cuerpo.pt: Os avisos de atualização respeitam a preferência guardada e as Definições permitem enviar um teste do Windows com resultado visível; o Spotter permanece no overlay e áudio de corrida, fora dos canais de notificação do produto.
- cuerpo.it: Gli avvisi di aggiornamento rispettano la preferenza salvata e le Impostazioni possono inviare una prova Windows con risultato visibile; Spotter resta nell'overlay e nell'audio di gara, fuori dai canali di notifica del prodotto.
- etiqueta: Corregido
- etiqueta.en: Fixed
- etiqueta.pt: Corrigido
- etiqueta.it: Corretto

### Calendario LMU desde Discord

- id: calendar-discord-review
- tipo: feature
- titulo.en: LMU calendar from Discord
- titulo.pt: Calendário LMU via Discord
- titulo.it: Calendario LMU da Discord
- cuerpo: Un lector restringido al canal oficial deja el mensaje semanal de LMU en una bandeja local; el owner revisa la fuente y los cambios antes de guardar y publicar el borrador.
- cuerpo.en: A reader restricted to the official channel leaves the LMU weekly message in a local inbox; the owner reviews the source and changes before saving and publishing the draft.
- cuerpo.pt: Um leitor limitado ao canal oficial deixa a mensagem semanal do LMU numa caixa de entrada local; o owner revê a fonte e as alterações antes de guardar e publicar o rascunho.
- cuerpo.it: Un lettore limitato al canale ufficiale lascia il messaggio settimanale LMU in una inbox locale; l'owner rivede fonte e modifiche prima di salvare e pubblicare la bozza.
- etiqueta: En revisión
- etiqueta.en: In review
- etiqueta.pt: Em revisão
- etiqueta.it: In revisione

### Contrato de roadmap por issue

- id: roadmap-issue-contract
- tipo: plan
- titulo.en: Per-issue roadmap contract
- titulo.pt: Contrato de roadmap por issue
- titulo.it: Contratto roadmap per issue
- cuerpo: El gate auditará la decisión, los IDs y el artefacto de cada issue; bloquear merges espera migrar las PR vivas, separar autor y reviewer, llegar a master y activar las protecciones remotas.
- cuerpo.en: The gate will audit each issue's decision, IDs and artefact; blocking merges awaits migrating live PRs, separating author and reviewer, reaching master and enabling remote protections.
- cuerpo.pt: O gate auditará a decisão, os IDs e o artefacto de cada issue; bloquear merges aguarda migrar os PR vivos, separar autor e reviewer, chegar a master e ativar as proteções remotas.
- cuerpo.it: Il gate verificherà la decisione, gli ID e l'artefatto di ogni issue; il blocco dei merge attende la migrazione delle PR attive, la separazione tra autore e reviewer, l'arrivo su master e l'attivazione delle protezioni remote.
- etiqueta: Plan
- etiqueta.pt: Plano
- etiqueta.it: Piano

### v0.1.0.5 en nightly

- id: v0105
- tipo: release
- titulo.en: v0.1.0.5 on nightly
- titulo.pt: v0.1.0.5 em nightly
- titulo.it: v0.1.0.5 su nightly
- cuerpo: Lote de launcher de Windows, paneles del hub, servicios internos y documentación de marca y diseño.
- cuerpo.en: Windows launcher batch, hub panels, internal services and brand and design documentation.
- cuerpo.pt: Lote de launcher do Windows, painéis do hub, serviços internos e documentação de marca e design.
- cuerpo.it: Lotto di launcher Windows, pannelli hub, servizi interni e documentazione di brand e design.
- etiqueta: Release

### Command Orbit v0.3 en el hub

- id: orbit-v03
- tipo: release
- titulo.en: Command Orbit v0.3 in the hub
- titulo.pt: Command Orbit v0.3 no hub
- titulo.it: Command Orbit v0.3 nell'hub
- cuerpo: El porte completo de la shell Orbit sustituye a la V5.2 y pasa a ser la única shell del hub.
- cuerpo.en: The full Orbit shell port replaces V5.2 and becomes the hub's only shell.
- cuerpo.pt: O porte completo da shell Orbit substitui a V5.2 e passa a ser a única shell do hub.
- cuerpo.it: Il porting completo della shell Orbit sostituisce la V5.2 e diventa l'unica shell dell'hub.
- etiqueta: Release

### Builds Windows reproducibles del canal Nightly

- id: windows-release-toolchain
- tipo: fix
- titulo.en: Reproducible Windows builds for the Nightly channel
- titulo.pt: Builds Windows reproduzíveis do canal Nightly
- titulo.it: Build Windows riproducibili del canale Nightly
- cuerpo: El pipeline de releases fija PowerShell 7.6.5, instala y verifica el toolchain MSYS2 UCRT64 antes de compilar el reader de telemetría, y valida los seis artefactos oficiales del canal Nightly.
- cuerpo.en: The release pipeline pins PowerShell 7.6.5, installs and verifies the MSYS2 UCRT64 toolchain before compiling the telemetry reader, and validates the six official Nightly channel artifacts.
- cuerpo.pt: O pipeline de releases fixa o PowerShell 7.6.5, instala e verifica o toolchain MSYS2 UCRT64 antes de compilar o reader de telemetria e valida os seis artefactos oficiais do canal Nightly.
- cuerpo.it: La pipeline delle release fissa PowerShell 7.6.5, installa e verifica il toolchain MSYS2 UCRT64 prima di compilare il reader di telemetria e valida i sei artefatti ufficiali del canale Nightly.
- etiqueta: Corregido
- etiqueta.en: Fixed
- etiqueta.pt: Corrigido
- etiqueta.it: Corretto

### Overlay Studio V3 en marcha

- id: overlay-studio-v3
- tipo: feature
- titulo.en: Overlay Studio V3 under way
- titulo.pt: Overlay Studio V3 em curso
- titulo.it: Overlay Studio V3 in corso
- cuerpo: Un único límite de render para estudio, runtime y previsualización, con guardado automático, historial de deshacer/rehacer, Standings Redline configurable y con ancho físico mínimo que preserva columnas y filas completas en perfiles estrechos, pedales Redline contenidos en su frame y con la saturación confinada a sus wells, y Track Map Endurance ajustado al frame sin recortar su pie, dentro de los catálogos Crystal, Neo y Endurance. El candidato Redline conserva su evidencia visual S3 acotada; las comprobaciones restantes pasan a Isaac. El nuevo programa se centra en Telemetría V2 y ya no impone Redline como primera fase; no declara superados los gates pendientes ni amplía otros diseños.
- cuerpo.en: A single render boundary for studio, runtime and preview, with autosave, undo/redo history, configurable Standings Redline with a minimum physical width that preserves complete columns and rows in narrow profiles, Redline pedals contained in their frame with saturation confined to their wells, and Endurance Track Map fitted to its frame without clipping its footer, within the Crystal, Neo and Endurance catalogues. The Redline candidate retains its bounded S3 visual evidence; Isaac owns the remaining manual checks. The new programme focuses on Telemetry V2 rather than requiring Redline as its first phase; pending gates are not declared passed and other designs are not expanded.
- cuerpo.pt: Um único limite de render para estúdio, runtime e pré-visualização, com gravação automática, histórico de desfazer/refazer, Standings Redline configurável e com largura física mínima que preserva colunas e linhas completas em perfis estreitos, pedais Redline contidos no frame e com a saturação confinada aos seus wells, e Track Map Endurance ajustado ao frame sem cortar o rodapé, nos catálogos Crystal, Neo e Endurance. O candidato Redline conserva a evidência visual S3 delimitada; Isaac assume as verificações manuais restantes. O novo programa centra-se na Telemetria V2, sem impor Redline como primeira fase; não declara os gates pendentes aprovados nem amplia outros designs.
- cuerpo.it: Un unico confine di render per studio, runtime e anteprima, con salvataggio automatico, cronologia annulla/ripristina, Standings Redline configurabile e con larghezza fisica minima che preserva colonne e righe complete nei profili stretti, pedali Redline contenuti nel frame e con la saturazione confinata ai propri well, e Track Map Endurance adattato al frame senza tagliare il piè di pagina, nei cataloghi Crystal, Neo ed Endurance. Il candidato Redline conserva l'evidenza visiva S3 circoscritta; Isaac eseguirà le verifiche manuali restanti. Il nuovo programma si concentra su Telemetry V2 senza imporre Redline come prima fase; non dichiara superati i gate pendenti né amplia altri design.
- etiqueta: En desarrollo
- etiqueta.en: In progress
- etiqueta.pt: Em desenvolvimento
- etiqueta.it: In corso

### Telemetría LMU en vivo

- id: telemetry-live
- tipo: feature
- titulo.en: Live LMU telemetry
- titulo.pt: Telemetria LMU ao vivo
- titulo.it: Telemetria LMU dal vivo
- cuerpo: Driver LMU con reconexión acotada, transporte Overlay dirigido con una sola entrega pendiente, generaciones retiradas y recuperación ante timeout compartido por Desktop y Studio, y lifecycle V2 renovado por montaje sin reutilizar recursos dispuestos. OverlayFrame V2 es la única autoridad visual, de layout y visibilidad en Studio, Desktop y OBS para los 18 widgets telemétricos; Calendar y Engineer conservan sus fuentes auxiliares explícitas, y los fallos V2 se muestran en el widget. Standings limita todas las plantillas Endurance a filas completas y, en práctica o clasificación, separa la mejor vuelta de cada coche de su diferencia contra la mejor vuelta de la sesión. Relative Redline ordena el tráfico por topología física, estabiliza la pertenencia por instancia con tiempo monotónico y obtiene posición, gap y última vuelta de una misma fila canónica. Un reemplazo de vecinos requiere siete segundos sólo mientras todas las filas previas sigan canónicas; cualquier ausencia publica inmediatamente la ventana completa. Mirror, Proximity y Traffic representan cada frame sin FLIP ni filas fantasma para impedir saltos, cruces y recortes transitorios. El nuevo plan maestro prevé retirar completamente telemetría V1 con rollback por build anterior, auditar toda la cadena V2 y simplificarla con mejoras medidas, preservando sus garantías y consumidores. R0 reúne la clasificación de dependencias, una copia privada de la build anterior verificada por hash y regresiones focales aprobadas. R1 entrega el pull Wails exclusivamente V2, con ACK, replay, latest-wins, sesiones retiradas, cleanup y estados intactos. R2 retira de Desktop el adapter y shadow V1: un evento legacy ya no alimenta esa superficie y un frame V2 conserva render y cierre del pull. R3 retira el adapter V1 del ciclo productivo de Studio, que conserva reset, restart, errores y cleanup sobre el pull V2. R4 retira de OBS el adapter SSE V1 y el shadow, conservando V2, Engineer, perfil, calendario, Race Schedule, diagnósticos, StrictMode y teardown. R5 retira la ruta SSE pública de Overlay V1 y su configuración de servidor, manteniendo Strategy, Overlay V2 y el lifecycle. R6a retira el productor Overlay V1 y su activación, y R6a.1 retira los constructores huérfanos `overlay.ProjectV1`/`NewOverlayFull` y el export huérfano `FromFreshness`, migrando sus tests a hechos canónicos y Overlay V2. Quedan para R6b/R7 el Hub inerte, los tipos y contratos, el tooling y el frontend legacy; la auditoría V2 y el bucle de rendimiento aún no comienzan; no se certifica rendimiento óptimo.
- cuerpo.en: LMU driver with bounded reconnects, targeted Overlay transport with one pending delivery, bounded retired generations and timeout recovery shared by Desktop and Studio, and a V2 lifecycle renewed per mount without reusing disposed resources. OverlayFrame V2 is the sole rendering, layout, and visibility authority in Studio, Desktop, and OBS for all 18 telemetry widgets; Calendar and Engineer keep their explicit auxiliary sources, and V2 failures are shown in the widget. Standings limits every Endurance template to complete rows and, in practice or qualifying, separates each car's best lap from its gap to the session best. Relative Redline orders traffic by physical topology, stabilizes membership per instance using monotonic time, and takes position, gap, and last lap from one canonical row. A neighbour replacement requires seven seconds only while every previous row remains canonical; any absence publishes the complete window immediately. Mirror, Proximity and Traffic render each frame without FLIP or ghost rows to prevent jumps, crossings and transient clipping. The new master plan calls for complete legacy telemetry V1 removal with rollback to a previous build, an end-to-end V2 audit and simplification through measured improvements while preserving guarantees and consumers. R0 records dependency classifications, a hash-verified private copy of the previous build and passing focused regressions. R1 delivers the Wails pull as V2-only, preserving ACK, replay, latest-wins, retired sessions, cleanup and states. R2 removes the V1 adapter and shadow from Desktop: a legacy event no longer feeds that surface while a V2 frame still renders and closes the pull session. R3 removes the V1 adapter from Studio's production lifecycle while preserving reset, restart, errors and cleanup over the V2 pull. R4 removes the V1 SSE adapter and shadow from OBS while preserving V2, Engineer, profile, calendar, Race Schedule, diagnostics, StrictMode and teardown. R5 removes Overlay V1's public SSE route and server configuration while preserving Strategy, Overlay V2 and lifecycle. R6a removes the Overlay V1 producer and its activation, and R6a.1 removes the orphaned constructors `overlay.ProjectV1`/`NewOverlayFull` and the orphaned export `FromFreshness`, migrating their tests to canonical facts and Overlay V2. The inert Hub, types and contracts, tooling and legacy frontend remain for R6b/R7; the V2 audit and the performance loop have not started yet; optimal performance is not certified.
- cuerpo.pt: Driver LMU com reconexão limitada, transporte Overlay dirigido com uma única entrega pendente, gerações retiradas limitadas e recuperação após timeout partilhada por Desktop e Studio, e lifecycle V2 renovado por montagem sem reutilizar recursos descartados. OverlayFrame V2 é a única autoridade visual, de layout e visibilidade no Studio, Desktop e OBS para os 18 widgets telemétricos; Calendar e Engineer mantêm fontes auxiliares explícitas, e as falhas V2 aparecem no widget. Standings limita todos os modelos Endurance a linhas completas e, em treino ou qualificação, separa a melhor volta de cada carro da diferença para a melhor volta da sessão. O Relative Redline ordena o tráfego pela topologia física, estabiliza a composição por instância com tempo monotónico e obtém posição, gap e última volta da mesma linha canónica. Uma substituição de vizinhos exige sete segundos apenas enquanto todas as linhas anteriores continuam canónicas; qualquer ausência publica imediatamente a janela completa. Mirror, Proximity e Traffic representam cada frame sem FLIP nem linhas fantasma para evitar saltos, cruzamentos e cortes transitórios. O novo plano mestre prevê retirar completamente a telemetria V1 com rollback por build anterior, auditar toda a cadeia V2 e simplificá-la com melhorias medidas, preservando garantias e consumidores. R0 reúne a classificação de dependências, uma cópia privada da build anterior verificada por hash e regressões focais aprovadas. R1 entrega o pull Wails exclusivamente V2, preservando ACK, replay, latest-wins, sessões retiradas, cleanup e estados. R2 remove o adapter e o shadow V1 do Desktop: um evento legacy deixa de alimentar essa superfície, enquanto um frame V2 continua a renderizar e encerra a sessão pull. R3 remove o adapter V1 do ciclo produtivo do Studio, preservando reset, reinício, erros e cleanup sobre o pull V2. R4 remove do OBS o adapter SSE V1 e o shadow, preservando V2, Engineer, perfil, calendário, Race Schedule, diagnósticos, StrictMode e teardown. R5 remove a rota SSE pública do Overlay V1 e a sua configuração de servidor, preservando Strategy, Overlay V2 e lifecycle. R6a remove o produtor Overlay V1 e a sua ativação, e R6a.1 remove os construtores órfãos `overlay.ProjectV1`/`NewOverlayFull` e o export órfão `FromFreshness`, migrando os seus testes para factos canónicos e Overlay V2. Ficam para R6b/R7 o Hub inerte, os tipos e contratos, o tooling e o frontend legacy; a auditoria V2 e o ciclo de desempenho ainda não começaram; não se certifica desempenho ótimo.
- cuerpo.it: Driver LMU con riconnessione limitata, trasporto Overlay diretto con una sola consegna pendente, generazioni ritirate limitate e recupero dopo timeout condiviso da Desktop e Studio, e lifecycle V2 rinnovato a ogni montaggio senza riutilizzare risorse disposte. OverlayFrame V2 è l'unica autorità di rendering, layout e visibilità in Studio, Desktop e OBS per i 18 widget telemetrici; Calendar ed Engineer mantengono fonti ausiliarie esplicite e gli errori V2 compaiono nel widget. Standings limita tutti i template Endurance a righe complete e, in pratica o qualifica, separa il miglior giro di ogni auto dal distacco rispetto al miglior giro della sessione. Relative Redline ordina il traffico per topologia fisica, stabilizza l'appartenenza per istanza con tempo monotono e ricava posizione, gap e ultimo giro dalla stessa riga canonica. Una sostituzione dei vicini richiede sette secondi solo mentre tutte le righe precedenti restano canoniche; ogni assenza pubblica immediatamente la finestra completa. Mirror, Proximity e Traffic rappresentano ogni frame senza FLIP o righe fantasma per evitare salti, incroci e ritagli transitori. Il nuovo piano prevede la rimozione completa della telemetria V1 con rollback a una build precedente, l'audit dell'intera catena V2 e la semplificazione con miglioramenti misurati, preservando garanzie e consumatori. R0 raccoglie la classificazione delle dipendenze, una copia privata della build precedente verificata tramite hash e regressioni mirate superate. R1 consegna il pull Wails esclusivamente V2, preservando ACK, replay, latest-wins, sessioni ritirate, cleanup e stati. R2 rimuove adapter e shadow V1 dal Desktop: un evento legacy non alimenta più quella superficie, mentre un frame V2 continua a renderizzare e chiude la sessione pull. R3 rimuove l'adapter V1 dal ciclo produttivo di Studio, preservando reset, riavvio, errori e cleanup sul pull V2. R4 rimuove da OBS l'adapter SSE V1 e lo shadow, preservando V2, Engineer, profilo, calendario, Race Schedule, diagnostica, StrictMode e teardown. R5 rimuove la rotta SSE pubblica dell'Overlay V1 e la relativa configurazione del server, preservando Strategy, Overlay V2 e lifecycle. R6a rimuove il produttore Overlay V1 e la sua attivazione, e R6a.1 rimuove i costruttori orfani `overlay.ProjectV1`/`NewOverlayFull` e l'export orfano `FromFreshness`, migrando i loro test a fatti canonici e Overlay V2. Restano per R6b/R7 l'Hub inerte, i tipi e i contratti, il tooling e il frontend legacy; l'audit V2 e il ciclo di prestazioni non sono ancora iniziati; non si certificano prestazioni ottimali.
- etiqueta: En desarrollo
- etiqueta.en: In progress
- etiqueta.pt: Em desenvolvimento
- etiqueta.it: In corso

### Política de rendimiento para overlays

- id: performance-policy
- tipo: feature
- titulo.en: Overlay performance policy
- titulo.pt: Política de desempenho para overlays
- titulo.it: Politica prestazionale per gli overlay
- cuerpo: Go decide uno de cinco niveles efectivos, publica `capabilities.performance` y aplica una cadencia común; Ajustes permite elegirlos y cada perfil v4 puede heredar, fijar un nivel o personalizar Hz por widget con su coste de CPU visible. Studio guarda esa política y deja `updateHz` como dato exclusivo del lector legado. En los niveles eficientes, el overlay usa una entrada propia y una ventana limitada a sus widgets, el Hub se destruye al minimizar solo cuando su registro empujado confirma que no hay borradores, Ingeniero conserva el audio sin presentación visual y Windows aplica una política de energía reversible. Automático mide CPU y memoria del árbol propio a 1 Hz, incorpora frametime de LMU mediante una sesión PresentMon aislada cuando está disponible y ajusta entre los niveles 2 y 5 con histéresis; sin juego o PresentMon continúa por CPU y declara `unavailable`. Los efectos por widget quedan reservados para la issue dedicada a las variantes Endurance `noBlur`/`flat`. D8 está demostrado para spotter por ruta real; banderas no tiene señal canónica en v2 y se verifica en #893. Automático es el defecto desde #948: empieza en 3 y la migración del rollout temporal a nivel 1 muestra un aviso hasta la primera elección explícita. El nuevo programa de Telemetría V2 preserva estas capacidades y mide optimizaciones sin reducir calidad, información o cadencias. El bucle termina tras cinco experimentos consecutivos sin mejora medida u ocho horas de ejecución. Efectos, indicador de coste, informe y recortes generales del Hub quedan fuera de esta secuencia activa, sin darse por entregados.
- cuerpo.en: Go selects one of five effective levels, publishes `capabilities.performance` and applies one shared cadence; Settings exposes those levels and each v4 profile can inherit, select a level, or customise per-widget Hz with visible CPU cost. Studio saves that policy and keeps `updateHz` exclusively in the legacy reader. At efficient levels, the overlay uses its own entry and a window bounded to its widgets, the Hub is destroyed on minimise only when its pushed registry confirms that no drafts exist, Engineer keeps audio without visual presentation, and Windows applies a reversible power policy. Automatic mode samples CPU and memory for Vantare's own process tree at 1 Hz, includes LMU frametime through an isolated PresentMon session when available, and adjusts between levels 2 and 5 with hysteresis; without the game or PresentMon it continues from CPU and reports `unavailable`. Per-widget effects remain reserved for the dedicated Endurance noBlur/flat variants issue. D8 is proven for spotter through the real path; flags have no canonical v2 signal and are verified in #893. Automatic is the default from #948: it starts at 3 and migration from the temporary level-1 rollout shows a notice until the first explicit choice. The new Telemetry V2 programme preserves these capabilities and measures optimisations without reducing quality, information or update rates. The loop stops after five consecutive experiments without measured improvement or eight hours of execution. Effects, the cost indicator, the report and general Hub reductions are outside this active sequence, not marked as delivered.
- cuerpo.pt: O Go decide um de cinco níveis efetivos, publica `capabilities.performance` e aplica uma cadência comum; as Definições permitem escolhê-los e cada perfil v4 pode herdar, fixar um nível ou personalizar Hz por widget com o custo de CPU visível. O Studio guarda essa política e mantém `updateHz` apenas no leitor legado. Nos níveis eficientes, o overlay usa uma entrada própria e uma janela limitada aos seus widgets, o Hub é destruído ao minimizar apenas quando o seu registo enviado confirma que não existem rascunhos, o Engenheiro mantém o áudio sem apresentação visual e o Windows aplica uma política de energia reversível. O modo Automático mede CPU e memória da árvore de processos própria a 1 Hz, inclui o frametime do LMU por uma sessão PresentMon isolada quando disponível e ajusta entre os níveis 2 e 5 com histerese; sem o jogo ou PresentMon continua pela CPU e declara `unavailable`. Os efeitos por widget ficam reservados para a issue dedicada às variantes Endurance `noBlur`/`flat`. D8 está demonstrado para o spotter pela rota real; as bandeiras não têm sinal canónico em v2 e são verificadas em #893. Automático é o padrão desde #948: começa no nível 3 e a migração do rollout temporário no nível 1 mostra um aviso até à primeira escolha explícita. O novo programa de Telemetria V2 preserva estas capacidades e mede otimizações sem reduzir qualidade, informação ou cadências. O ciclo termina após cinco experiências consecutivas sem melhoria medida ou oito horas de execução. Efeitos, indicador de custo, relatório e reduções gerais do Hub ficam fora desta sequência ativa, sem serem considerados entregues.
- cuerpo.it: Go decide uno dei cinque livelli effettivi, pubblica `capabilities.performance` e applica una cadenza comune; le Impostazioni permettono di sceglierli e ogni profilo v4 può ereditare, fissare un livello o personalizzare gli Hz per widget mostrando il costo CPU. Studio salva questa politica e mantiene `updateHz` solo nel lettore legacy. Nei livelli efficienti, l'overlay usa un entry dedicato e una finestra limitata ai suoi widget, l'Hub viene distrutto alla minimizzazione solo quando il registro inviato conferma che non esistono bozze, Engineer mantiene l'audio senza presentazione visiva e Windows applica una politica energetica reversibile. La modalità Automatica campiona CPU e memoria dell'albero di processi Vantare a 1 Hz, include il frametime di LMU tramite una sessione PresentMon isolata quando disponibile e regola i livelli da 2 a 5 con isteresi; senza gioco o PresentMon continua in base alla CPU e dichiara `unavailable`. Gli effetti per widget restano riservati alla issue dedicata alle varianti Endurance `noBlur`/`flat`. D8 è dimostrato per lo spotter tramite il percorso reale; le bandiere non hanno un segnale canonico v2 e sono verificate in #893. Automatico è il valore predefinito da #948: parte dal livello 3 e la migrazione del rollout temporaneo al livello 1 mostra un avviso fino alla prima scelta esplicita. Il nuovo programma Telemetry V2 preserva queste capacità e misura ottimizzazioni senza ridurre qualità, informazioni o frequenze. Il ciclo termina dopo cinque esperimenti consecutivi senza miglioramento misurato oppure otto ore di esecuzione. Effetti, indicatore del costo, rapporto e riduzioni generali dell'Hub restano fuori da questa sequenza attiva, senza considerarli consegnati.
- etiqueta: Feature

### Reader histórico LMU y runtime Windows

- id: telemetry-analysis-reader-runtime
- tipo: feature
- titulo.en: LMU historical reader and Windows runtime
- titulo.pt: Reader histórico LMU e runtime Windows
- titulo.it: Reader storico LMU e runtime Windows
- cuerpo: Analysis dispone de un reader LMU autorizado y fail-closed, compuesto en la app y empaquetado en Windows con runtime verificado; la pantalla post-sesión todavía no consume el catálogo real.
- cuerpo.en: Analysis has an authorized fail-closed LMU reader, composed in the app and packaged on Windows with a verified runtime; the post-session screen does not consume the real catalogue yet.
- cuerpo.pt: Analysis dispõe de um reader LMU autorizado e fail-closed, composto na app e empacotado no Windows com runtime verificado; o ecrã pós-sessão ainda não consome o catálogo real.
- cuerpo.it: Analysis dispone di un reader LMU autorizzato e fail-closed, composto nell'app e distribuito su Windows con runtime verificato; la schermata post-sessione non usa ancora il catalogo reale.
- etiqueta: Feature

### Radio bus, Spotter y motor de familias

- id: engineer-radio-spotter
- tipo: feature
- titulo.en: Radio bus, Spotter and family engine
- titulo.pt: Radio bus, Spotter e motor de famílias
- titulo.it: Radio bus, Spotter e motore di famiglie
- cuerpo: Spotter y las familias fuel, sanciones, vueltas, tiempos y boxes consumen telemetría canónica y entregan avisos priorizados por el mismo bus, con rollback exclusivo del stack anterior.
- cuerpo.en: Spotter plus fuel, penalties, laps, timings and pit families consume canonical telemetry and deliver prioritized alerts through the same bus, with an exclusive rollback to the previous stack.
- cuerpo.pt: Spotter e as famílias de combustível, penalizações, voltas, tempos e boxes consomem telemetria canónica e entregam alertas priorizados pelo mesmo bus, com rollback exclusivo para o stack anterior.
- cuerpo.it: Spotter e le famiglie carburante, penalità, giri, tempi e box consumano telemetria canonica e consegnano avvisi prioritari sullo stesso bus, con rollback esclusivo allo stack precedente.
- etiqueta: En revisión
- etiqueta.en: In review
- etiqueta.pt: Em revisão
- etiqueta.it: In revisione

### Carril experimental de voz de entrada

- id: engineer-voice-input-experimental
- tipo: feature
- titulo.en: Experimental voice-input lane
- titulo.pt: Carril experimental de entrada de voz
- titulo.it: Corsia sperimentale di input vocale
- cuerpo: El flag experimental aísla PTT, revalida su reserva F24, usa un host hijo asíncrono y solo publica valores con formato cerrado; WASAPI, Whisper, wake acústico y validación física/humana siguen pendientes y fallan cerrados.
- cuerpo.en: The experimental flag isolates PTT, revalidates its F24 reservation, uses an asynchronous child host and only publishes closed-format values; WASAPI, Whisper, acoustic wake and physical/human validation remain pending and fail closed.
- cuerpo.pt: O flag experimental isola PTT, revalida a reserva F24, usa um host filho assíncrono e só publica valores de formato fechado; WASAPI, Whisper, wake acústico e validação física/humana continuam pendentes e falham de forma fechada.
- cuerpo.it: Il flag sperimentale isola PTT, rivalida la riserva F24, usa un processo figlio asincrono e pubblica solo valori dal formato chiuso; WASAPI, Whisper, wake acustico e validazione fisica/umana restano pendenti e falliscono in modo chiuso.
- etiqueta: En revisión
- etiqueta.en: In review
- etiqueta.pt: Em revisão
- etiqueta.it: In revisione

### Licencias con credencial offline

- id: licensing-offline
- tipo: feature
- titulo.en: Licensing with offline credentials
- titulo.pt: Licenças com credencial offline
- titulo.it: Licenze con credenziale offline
- cuerpo: La app arranca desde la credencial en caché y verifica sin red, de modo que una caída del servicio no cierra la sesión.
- cuerpo.en: The app starts from the cached credential and verifies offline, so a service outage does not sign you out.
- cuerpo.pt: A app arranca a partir da credencial em cache e verifica sem rede, para que uma falha do serviço não encerre a sessão.
- cuerpo.it: L'app parte dalla credenziale in cache e verifica offline, così un guasto del servizio non chiude la sessione.
- etiqueta: Feature

### Canales nightly y testers

- id: channels
- tipo: plan
- titulo.en: Nightly and testers channels
- titulo.pt: Canais nightly e testers
- titulo.it: Canali nightly e tester
- cuerpo: Tres canales de actualización (estable, testers y nightly) con acceso según el rol de la cuenta.
- cuerpo.en: Three update channels (stable, testers and nightly) with access driven by the account role.
- cuerpo.pt: Três canais de atualização (estável, testers e nightly) com acesso conforme o papel da conta.
- cuerpo.it: Tre canali di aggiornamento (stabile, tester e nightly) con accesso in base al ruolo dell'account.
- etiqueta: Plan
- etiqueta.pt: Plano
- etiqueta.it: Piano

<!--
Los hitos que siguen salen de la auditoria de cableado de Orbit v0.3
(`docs/design/orbit-v03/evidence/porte/wiring-audit.md`, seccion "Pendiente por
decision de producto"): controles que quedaban honestos porque faltaba una
decision o una fuente, no porque faltara codigo. Los dos primeros ya se
entregaron (favoritos y apps propias del Launcher, registros de Diagnostico) y
se conservan aqui como hitos cumplidos; los demas siguen pendientes.
-->

### Favoritos y aplicaciones propias en el Launcher

- id: launcher-favorite-toggle
- tipo: feature
- titulo.en: Favourites and custom apps in the Launcher
- titulo.pt: Favoritos e aplicações próprias no Launcher
- titulo.it: Preferiti e app personalizzate nel Launcher
- cuerpo: La estrella de cada aplicación marca el favorito y manda en el orden, y «Añadir aplicación» da de alta programas que el escaneo no detecta.
- cuerpo.en: Each app's star marks it as a favourite and drives the ordering, and "Add application" registers programs the scan does not detect.
- cuerpo.pt: A estrela de cada aplicação marca o favorito e comanda a ordem, e «Adicionar aplicação» regista programas que a análise não deteta.
- cuerpo.it: La stella di ogni applicazione segna il preferito e comanda l'ordine, e «Aggiungi applicazione» registra programmi che la scansione non rileva.
- etiqueta: Feature

### Estrategias por evento

- id: strategy-multi-event
- tipo: plan
- titulo.en: Per-event strategies
- titulo.pt: Estratégias por evento
- titulo.it: Strategie per evento
- cuerpo: El puente de estrategia publica un único evento activo; «Otros eventos» solo podrá listarlos cuando publique varios.
- cuerpo.en: The strategy bridge publishes a single active event; "Other events" can only list them once it publishes several.
- cuerpo.pt: A ponte de estratégia publica um único evento ativo; «Outros eventos» só os poderá listar quando publicar vários.
- cuerpo.it: Il ponte di strategia pubblica un solo evento attivo; «Altri eventi» potrà elencarli solo quando ne pubblicherà diversi.
- etiqueta: Plan
- etiqueta.pt: Plano
- etiqueta.it: Piano

### Editar pilotos y sus ritmos

- id: strategy-edit-drivers
- tipo: plan
- titulo.en: Editing drivers and their pace
- titulo.pt: Editar pilotos e os seus ritmos
- titulo.it: Modificare i piloti e i loro ritmi
- cuerpo: Los ritmos llegan desde el hub y no hay comando para escribirlos, así que la edición queda pendiente de contrato.
- cuerpo.en: Pace figures arrive from the hub and no command writes them back, so editing waits on a contract.
- cuerpo.pt: Os ritmos chegam do hub e não há comando para os escrever, pelo que a edição fica pendente de contrato.
- cuerpo.it: I ritmi arrivano dall'hub e nessun comando li riscrive, quindi la modifica attende un contratto.
- etiqueta: Plan
- etiqueta.pt: Plano
- etiqueta.it: Piano

### Estrategia definitiva sobre telemetría real

- id: strategy-rework-ab
- tipo: feature
- titulo.en: Definitive strategy over real telemetry
- titulo.pt: Estratégia definitiva sobre telemetria real
- titulo.it: Strategia definitiva su telemetria reale
- cuerpo: El planificador usa una única autoridad de cálculo y guardado sobre las sesiones DuckDB reales de LMU. La entrada asistida parte de las carreras del calendario, cruza sede y clase mediante identidades canónicas declaradas en Go y solo pide trazado cuando el histórico contiene varios; después Orbit aplica inputs y clima, muestra backtests neutrales, ofrece referencias firmadas e importa el histórico local con progreso.
- cuerpo.en: The planner uses one calculation and storage authority over real LMU DuckDB sessions. Assisted entry starts from calendar races, joins venue and class through canonical identities declared in Go, and asks for a layout only when history contains several; Orbit then applies inputs and weather, shows neutral backtests, offers signed references, and imports local history with progress.
- cuerpo.pt: O planeador usa uma única autoridade de cálculo e gravação sobre as sessões DuckDB reais do LMU. A entrada assistida começa nas corridas do calendário, cruza circuito e classe através de identidades canónicas declaradas em Go e só pede o traçado quando o histórico contém vários; depois o Orbit aplica inputs e meteorologia, mostra backtests neutros, oferece referências assinadas e importa o histórico local com progresso.
- cuerpo.it: Il pianificatore usa un'unica autorità di calcolo e salvataggio sulle sessioni DuckDB reali di LMU. L'ingresso assistito parte dalle gare del calendario, collega sede e classe tramite identità canoniche dichiarate in Go e chiede il tracciato solo quando lo storico ne contiene più di uno; Orbit applica poi input e meteo, mostra backtest neutrali, offre riferimenti firmati e importa lo storico locale con avanzamento.
- etiqueta: Feature

### Cálculo Orbit sobre el motor completo

- id: strategy-orbit-solve-v2
- tipo: feature
- titulo.en: Orbit calculation on the full engine
- titulo.pt: Cálculo do Orbit no motor completo
- titulo.it: Calcolo Orbit sul motore completo
- cuerpo: Orbit ya envía los valores manuales, derivados y sus overrides al motor Strategy completo con su procedencia. El plan exige la reserva configurable, publica el margen efectivo, minimiza Fuel/VE inicial entre empates y rechaza con causa un resultado imposible.
- cuerpo.en: Orbit now sends manual and derived values, plus their overrides, to the full Strategy engine with provenance. The plan enforces the configurable reserve, publishes the effective margin, minimizes initial Fuel/VE among ties, and rejects an impossible result with a concrete reason.
- cuerpo.pt: O Orbit agora envia valores manuais e derivados, incluindo os overrides, para o motor Strategy completo com a respetiva procedência. O plano exige a reserva configurável, publica a margem efetiva, minimiza Fuel/VE inicial em empates e rejeita com uma causa concreta um resultado impossível.
- cuerpo.it: Orbit ora invia valori manuali e derivati, inclusi gli override, al motore Strategy completo con la relativa provenienza. Il piano applica la riserva configurabile, pubblica il margine effettivo, minimizza Fuel/VE iniziale nei pareggi e rifiuta con una causa concreta un risultato impossibile.
- etiqueta: Feature

### Contribución seudonimizada de Strategy

- id: strategy-pseudonymous-contribution
- tipo: feature
- titulo.en: Pseudonymous Strategy contribution
- titulo.pt: Contribuição pseudonimizada de Strategy
- titulo.it: Contributo pseudonimizzato di Strategy
- cuerpo: Ajustes > Privacidad permite aceptar una versión del consentimiento, inspeccionar cada bundle y su historial, y pausar la cola. Pausar cancela lo aún no aceptado; lo ya aceptado queda enviado. Revocar el consentimiento y pedir el borrado remoto son acciones separadas. Los envíos nacen desactivados hasta configurar un Worker revisado.
- cuerpo.en: Settings > Privacy lets users accept a consent-text version, inspect every bundle and its history, and pause the queue. Pausing cancels anything not yet accepted; accepted items remain sent. Revoking consent and requesting remote deletion are separate actions. Uploads start disabled until a reviewed Worker is configured.
- cuerpo.pt: Ajustes > Privacidade permite aceitar uma versão do consentimento, inspecionar cada bundle e o seu histórico e pausar a fila. A pausa cancela o que ainda não foi aceite; o que já foi aceite permanece enviado. Revogar o consentimento e pedir a eliminação remota são ações separadas. Os envios começam desativados até configurar um Worker revisto.
- cuerpo.it: Impostazioni > Privacy consente di accettare una versione del consenso, ispezionare ogni bundle e la sua cronologia e mettere in pausa la coda. La pausa annulla ciò che non è ancora stato accettato; gli elementi accettati restano inviati. Revoca del consenso e cancellazione remota sono azioni separate. Gli invii partono disattivati finché non viene configurato un Worker verificato.
- etiqueta: Feature

### Ciclo editorial local de Strategy

- id: strategy-local-editorial-cycle
- tipo: feature
- titulo.en: Local Strategy editorial cycle
- titulo.pt: Ciclo editorial local de Strategy
- titulo.it: Ciclo editoriale locale di Strategy
- cuerpo: Un ciclo local predigiere los bundles, prepara para el LLM un informe sin datos crudos ni identificadores y deja a Isaac aprobar perfiles y estrategias antes de generar un catálogo sin firmar. La sincronización remota, la firma y la publicación siguen detrás de sus gates humanos.
- cuerpo.en: A local cycle predigests bundles, prepares an LLM report without raw data or identifiers, and lets Isaac approve profiles and strategies before generating an unsigned catalogue. Remote synchronization, signing and publication remain behind their human gates.
- cuerpo.pt: Um ciclo local pré-digere os bundles, prepara para o LLM um relatório sem dados brutos nem identificadores e deixa Isaac aprovar perfis e estratégias antes de gerar um catálogo sem assinatura. A sincronização remota, a assinatura e a publicação continuam atrás dos seus gates humanos.
- cuerpo.it: Un ciclo locale predigerisce i bundle, prepara per l'LLM un rapporto senza dati grezzi né identificatori e lascia a Isaac l'approvazione di profili e strategie prima di generare un catalogo non firmato. Sincronizzazione remota, firma e pubblicazione restano dietro i rispettivi gate umani.
- etiqueta: Feature

### Registros y últimos eventos en Diagnóstico

- id: diagnostics-logs
- tipo: feature
- titulo.en: Logs and recent events in Diagnostics
- titulo.pt: Registos e últimos eventos em Diagnóstico
- titulo.it: Log e ultimi eventi in Diagnostica
- cuerpo: La app escribe un registro rotado en disco, Diagnóstico abre su carpeta y lista los últimos eventos con su nivel.
- cuerpo.en: The app writes a rotating log to disk, and Diagnostics opens its folder and lists recent events with their level.
- cuerpo.pt: A app escreve um registo rotativo em disco, e Diagnóstico abre a sua pasta e lista os últimos eventos com o seu nível.
- cuerpo.it: L'app scrive un log rotante su disco, e Diagnostica apre la sua cartella ed elenca gli ultimi eventi con il loro livello.
- etiqueta: Feature

### Zoom global de la interfaz

- id: global-interface-zoom
- tipo: feature
- titulo.en: Global interface zoom
- titulo.pt: Zoom global da interface
- titulo.it: Zoom globale dell'interfaccia
- cuerpo: Ajustes permite ampliar o reducir toda la app en seis pasos, restablecer el tamaño predeterminado y usar Ctrl +, Ctrl −, Ctrl 0 o Ctrl + rueda; la preferencia se recuerda en este equipo y convive con el ajuste responsive de la ventana.
- cuerpo.en: Settings can zoom the whole app through six steps, restore the default size and use Ctrl +, Ctrl −, Ctrl 0 or Ctrl + wheel; the preference is remembered on this device and works alongside responsive window scaling.
- cuerpo.pt: As Definições permitem ampliar ou reduzir toda a app em seis passos, repor o tamanho predefinido e usar Ctrl +, Ctrl −, Ctrl 0 ou Ctrl + roda; a preferência fica guardada neste equipamento e convive com o ajuste responsivo da janela.
- cuerpo.it: Le Impostazioni consentono di ingrandire o ridurre tutta l'app in sei passaggi, ripristinare la dimensione predefinita e usare Ctrl +, Ctrl −, Ctrl 0 o Ctrl + rotellina; la preferenza resta memorizzata su questo dispositivo e convive con l'adattamento responsive della finestra.
- etiqueta: Feature

### Eje temporal en Telemetría y exportar radio

- id: telemetry-timeline-export
- tipo: plan
- titulo.en: Telemetry timeline and radio export
- titulo.pt: Eixo temporal em Telemetria e exportar rádio
- titulo.it: Asse temporale in Telemetria ed esportazione radio
- cuerpo: Ambos dependen de que la grabación DuckDB (ADR 0004/0005) se exponga al frontend.
- cuerpo.en: Both wait on the DuckDB recording (ADR 0004/0005) being exposed to the frontend.
- cuerpo.pt: Ambos dependem de que a gravação DuckDB (ADR 0004/0005) seja exposta ao frontend.
- cuerpo.it: Entrambi dipendono dall'esposizione della registrazione DuckDB (ADR 0004/0005) al frontend.
- etiqueta: Plan
- etiqueta.pt: Plano
- etiqueta.it: Piano
