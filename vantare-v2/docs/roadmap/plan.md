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



### Detalle de Calendario coherente con la selección

- id: calendar-detail-selection
- tipo: fix
- titulo.en: Calendar detail follows the selected race
- titulo.pt: Detalhe do Calendário coerente com a seleção
- titulo.it: Dettaglio del Calendario coerente con la selezione
- cuerpo: El detalle marca las duraciones estimadas y valida la hora elegida para la serie y publicación actuales. Cambiar de filtro o navegar desde Inicio no arrastra una hora ajena; las horas históricas aún publicadas se conservan.
- cuerpo.en: Details mark estimated durations and validate the selected time against the current series and publication. Changing filters or navigating from Home does not carry over another race time; valid historical times are preserved.
- cuerpo.pt: O detalhe assinala durações estimadas e valida a hora escolhida para a série e publicação atuais. Mudar o filtro ou navegar desde Início não arrasta outra hora; horários históricos válidos são preservados.
- cuerpo.it: Il dettaglio indica le durate stimate e verifica l'orario scelto per la serie e pubblicazione correnti. Cambiare filtro o navigare da Home non trascina un altro orario; gli orari storici validi vengono conservati.
- etiqueta: ISA-1052

### Mes sin ocurrencias duplicadas como especiales

- id: calendar-month-classification
- tipo: fix
- titulo.en: Month without occurrences duplicated as specials
- titulo.pt: Mês sem ocorrências duplicadas como especiais
- titulo.it: Mese senza occorrenze duplicate come speciali
- cuerpo: Mes distingue las ocurrencias generadas de las series y los eventos especiales mediante su procedencia e identidad. Los filtros no convierten series ocultas en especiales y se conserva el documento compartido. Al abrir un especial o +N, Día conserva los eventos anunciados por Mes, incluso sin series.
- cuerpo.en: Month distinguishes generated series occurrences from special events by source and identity. Filters do not turn hidden series into specials and the shared document is preserved. Opening a special or +N keeps the events shown by Month in Day, even without series.
- cuerpo.pt: O mês distingue ocorrências geradas das séries e eventos especiais pela origem e identidade. Os filtros não convertem séries ocultas em especiais e o documento partilhado é preservado. Ao abrir um especial ou +N, Dia mantém os eventos mostrados pelo Mês, mesmo sem séries.
- cuerpo.it: Il mese distingue le occorrenze generate delle serie dagli eventi speciali tramite origine e identità. I filtri non trasformano serie nascoste in speciali e il documento condiviso resta intatto. Aprendo uno speciale o +N, Giorno conserva gli eventi mostrati da Mese, anche senza serie.
- etiqueta: ISA-1046

### Días locales y salidas completas en Calendario

- id: calendar-local-days-slots
- tipo: fix
- titulo.en: Local days and complete calendar starts
- titulo.pt: Dias locais e partidas completas no calendário
- titulo.it: Giorni locali e partenze complete nel calendario
- cuerpo: Las vistas respetan medianoches locales y cambios de hora, cuentan todas las salidas publicadas y distinguen los instantes de una hora repetida mediante su desplazamiento UTC.
- cuerpo.en: Views respect local midnights and daylight saving changes, count every published start and distinguish repeated-hour instants using their UTC offset.
- cuerpo.pt: As vistas respeitam as meias-noites locais e mudanças de hora, contam todas as partidas publicadas e distinguem instantes de uma hora repetida pelo desvio UTC.
- cuerpo.it: Le viste rispettano le mezzanotti locali e i cambi d'ora, contano tutte le partenze pubblicate e distinguono gli istanti di un'ora ripetuta tramite lo scarto UTC.
- etiqueta: ISA-1044

### Vigencia de las salidas de Calendario

- id: calendar-schedule-validity
- tipo: fix
- titulo.en: Calendar departure validity
- titulo.pt: Validade das saídas do Calendário
- titulo.it: Validità delle partenze del Calendario
- cuerpo: Inicio y el motor de las cinco vistas limitan las salidas al periodo publicado, incluido el detalle y los previews. Sin vigencia verificable no se generan nuevas salidas. Este corte depende de los metadatos del servicio ISA-1029; errores visibles, recordatorios y los demás ajustes de las vistas siguen en el plan ISA-1027.
- cuerpo.en: Home and the five-view engine limit departures to the published period, including details and previews. No new departures are generated without verifiable validity. This cut depends on ISA-1029 service metadata; visible errors, reminders and remaining view fixes continue in ISA-1027.
- cuerpo.pt: Início e o motor das cinco vistas limitam saídas ao período publicado, incluindo detalhe e previews. Sem validade verificável não são geradas novas saídas. Depende dos metadados ISA-1029; erros visíveis, lembretes e restantes correções continuam no plano ISA-1027.
- cuerpo.it: Home e il motore delle cinque viste limitano le partenze al periodo pubblicato, inclusi dettagli e anteprime. Senza validità verificabile non vengono generate nuove partenze. Dipende dai metadati ISA-1029; errori visibili, promemoria e altre correzioni proseguono nel piano ISA-1027.
- etiqueta: ISA-1032
