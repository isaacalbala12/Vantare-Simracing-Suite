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
- item: Telemetría LMU en vivo con transporte compartido y proyecciones
- item.en: Live LMU telemetry with a shared transport and projections
- item.pt: Telemetria LMU ao vivo com transporte partilhado e projeções
- item.it: Telemetria LMU dal vivo con trasporto condiviso e proiezioni
- item: Licencias con credencial offline y arranque desde caché
- item.en: Licensing with offline credentials and cache-first startup
- item.pt: Licenças com credencial offline e arranque a partir da cache
- item.it: Licenze con credenziale offline e avvio dalla cache
- item: Launcher con detección de apps y cadenas de lanzamiento
- item.en: Launcher with app detection and launch chains
- item.pt: Launcher com deteção de apps e cadeias de lançamento
- item.it: Launcher con rilevamento app e catene di avvio

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
- estado: planned
- progreso: 25
- titulo.en: Platform
- titulo.pt: Plataforma
- titulo.it: Piattaforma
- proyectos: roadmap-governance

---

## Hitos

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

### Overlay Studio V3 en marcha

- id: overlay-studio-v3
- tipo: feature
- titulo.en: Overlay Studio V3 under way
- titulo.pt: Overlay Studio V3 em curso
- titulo.it: Overlay Studio V3 in corso
- cuerpo: Un único límite de render para estudio, runtime y previsualización, con guardado automático, historial de deshacer/rehacer y los catálogos Crystal, Neo y Endurance.
- cuerpo.en: A single render boundary for studio, runtime and preview, with autosave, undo/redo history and the Crystal, Neo and Endurance catalogues.
- cuerpo.pt: Um único limite de render para estúdio, runtime e pré-visualização, com gravação automática, histórico de desfazer/refazer e os catálogos Crystal, Neo e Endurance.
- cuerpo.it: Un unico confine di render per studio, runtime e anteprima, con salvataggio automatico, cronologia annulla/ripristina e i cataloghi Crystal, Neo ed Endurance.
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
- cuerpo: Driver LMU con reconexión acotada, transporte compartido entre ventanas y proyecciones de overlay, ingeniero y estrategia.
- cuerpo.en: LMU driver with bounded reconnects, a transport shared across windows and overlay, engineer and strategy projections.
- cuerpo.pt: Driver LMU com reconexão limitada, transporte partilhado entre janelas e projeções de overlay, engenheiro e estratégia.
- cuerpo.it: Driver LMU con riconnessione limitata, trasporto condiviso tra finestre e proiezioni di overlay, engineer e strategia.
- etiqueta: En desarrollo
- etiqueta.en: In progress
- etiqueta.pt: Em desenvolvimento
- etiqueta.it: In corso

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
