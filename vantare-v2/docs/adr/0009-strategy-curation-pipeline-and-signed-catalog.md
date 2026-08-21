# ADR 0009 — Pipeline editorial, subida opt-in y catálogo firmado de Strategy

**Estado:** Proposed (pendiente de aceptación de Isaac)
**Fecha:** 2026-08-21
**Decisores:** Isaac y Vantare engineering
**Contexto:** ISA-694, decisiones D10–D16, D18–D19 del spec
(`docs/strategy-planner/isa-694-spec.md`)

## Contexto

El corte A+B de Strategy Planner añade un ciclo comunitario: los usuarios
suben derivados anonimizados de su telemetría, un pipeline editorial en el PC
de Isaac los analiza, e Isaac publica un catálogo curado (mejores estrategias
y perfiles de referencia por combinación) que la app descarga. Nada de esto
existía; ADR 0006 fijó galerías como concepto pero no el mecanismo. Este ADR
fija fronteras, seguridad y privacidad. El presupuesto de infraestructura es
el mínimo posible (D10/D11).

## Decisión

### Roles y autoridad

1. **La predigestión es determinista.** El curador (`cmd/vantare-curator`)
   agrega bundles por combinación, deduplica, puntúa por métricas de backtest
   y agrupa estrategias observadas. El LLM del pipeline **solo recibe esos
   resúmenes compactos** — nunca tablas crudas — y **solo redacta y cura**:
   no calcula, no ordena el ranking objetivo, no inventa estrategias
   (coherente con ADR 0006).
2. **Isaac decide qué se publica.** Las primeras semanas mediante un flujo de
   decisión simple sobre el informe del LLM; la automatización posterior es
   progresiva vía skills, siempre con las métricas deterministas como
   autoridad del ranking (D12).
3. El pipeline corre como tarea programada en el PC de Isaac usando sus
   suscripciones; no hay coste de API por review (D13).

### Consentimiento y privacidad (modifica el contrato de producto)

4. El contrato de producto (`docs/vantare-program/product-contract.md`) se
   modifica: además del envío manual con preview, se permite la **subida
   automática bajo consentimiento permanente opt-in y revocable** (D18) con,
   como mínimo: cola de subida visible, historial de lo enviado, pausa
   inmediata y borrado (local y solicitud de borrado remoto por
   `installId`). La revocación detiene futuros envíos sin borrar lo local.
5. El bundle (`CurationBundle v1`) contiene **solo** identidad de combinación
   permitida, agregados de stint/pit, curvas derivadas, estrategias
   observadas y calidad de canal. **Nunca:** telemetría cruda, nombres de
   piloto o equipo, SteamID, rutas locales ni fechas absolutas más finas de
   lo necesario. El identificador es un `installId` aleatorio opt-in, no
   ligado a la licencia. El presupuesto empírico es ~1,3 KB gzip por sesión
   (F0-1), lo que permite validación estricta de tamaño.

### Worker de ingesta (superficie pública mínima)

6. Un Cloudflare Worker (`infra/curation-worker`) con almacenamiento de
   objetos expone un único endpoint de subida. Protocolo:
   - autenticación por token de subida emitido por build/canal (no es un
     secreto fuerte: el control real son cuotas y validación);
   - **idempotencia** por hash de contenido: reenvíos y replays no duplican;
   - validación estricta de schema y de tamaño máximo por bundle y por día
     por `installId`; lo inválido se rechaza, no se almacena "por si acaso";
   - rate-limit por IP e `installId`; dedupe por hash;
   - retención definida (propuesta: 180 días para bundles crudos; los
     agregados curados no caducan) y borrado por `installId` bajo petición;
   - logs sin payload y con `installId` truncado;
   - TLS de extremo a extremo (Cloudflare) y sin CORS abierto.
7. **Publicar el Worker requiere autorización explícita de Isaac** (gate 1).
   El curador sincroniza los bundles del storage al PC de Isaac por pull.

### Catálogo firmado

8. El catálogo (`Catalog v1`) se publica como artefacto estático en GitHub
   (D11) firmado con **Ed25519**. Envelope:
   - `keyId` explícito; la clave pública viaja embebida en la app con una
     lista de claves aceptadas (permite rotación superpuesta);
   - `version` **monotónica** + `publishedAt`; la app rechaza retrocesos
     (anti-rollback) y avisa si el catálogo supera una edad máxima
     (anti-freeze, propuesta: 45 días);
   - la firma cubre los **bytes canónicos** del payload; firma válida con
     schema incompatible ⇒ el catálogo se ignora con aviso, jamás se parsea
     "lo que se pueda";
   - contenido: estrategias curadas y perfiles de referencia por combinación,
     siempre con procedencia `reference` y métricas de muestra/calidad.
9. La clave privada vive únicamente en el PC de Isaac (archivo protegido por
   el sistema; nunca en el repo, CI ni el Worker). **Runbook de compromiso:**
   revocar `keyId` en la lista embebida vía release de la app, rotar clave,
   republicar catálogo con la nueva; mientras tanto la app conserva el último
   catálogo válido en caché. **Publicar el primer catálogo requiere
   autorización explícita de Isaac** (gate 2).

### Ownership del forecast

10. **Telemetry Core** posee la adquisición del forecast: el driver LMU añade
    la consulta REST (`GET /rest/sessions/weather`, verificada en #702) y la
    expone como señal con presencia/freshness. **Strategy** persiste
    `WeatherScenario v1` cuando el usuario captura. Telemetry Analysis no
    interviene. Overlays consume exclusivamente `StrategyWeatherReadModel v1`
    producido por Strategy (nunca Core, REST ni repositorios).

### Perfiles de piloto

11. `PilotProfile v1` (ritmo, consumo, percentiles derivados, por
    combinación y condición) es propiedad de Strategy, alimentado desde la
    proyección de Analysis. Es exportable/importable como archivo (puente de
    equipo sin servidor) y es la unidad que la subida opt-in comparte con el
    pipeline, anonimizada.

## Alternativas descartadas

- **Envío manual por bundle como único modo:** contradice D10/D18; fricción
  que mataría el corpus.
- **Backend con cuentas y API propia:** coste y superficie innecesarios para
  el volumen real (~KB por sesión); Cloudflare Worker + storage basta.
- **Firmar con la infraestructura de release existente / sin firma:** el
  catálogo cambia más rápido que las releases y sin firma un repositorio
  comprometido podría inyectar estrategias; Ed25519 con claves embebidas es
  barato y suficiente.
- **LLM como autoridad de ranking:** rompe ADR 0006 y la reproducibilidad.

## Consecuencias

- Positivas: corpus comunitario desde el día uno de testers; catálogo
  auditable y reproducible; privacidad por construcción; coste ~cero.
- Costes: gestión de clave en el PC de Isaac; dos gates humanos de
  publicación; el contrato de producto debe actualizarse en el mismo PR que
  implemente la subida automática (F6a).

## Verificación

- Tests adversariales del Worker: replay, payload inválido, sobre-tamaño,
  abuso de cuota, `installId` ajeno.
- Tests del consumidor de catálogo: firma inválida, `keyId` desconocido,
  rollback de versión, catálogo caducado, schema incompatible — todos
  degradan al último catálogo válido o a vacío con aviso.
- Auditoría del bundle: fixture que demuestra ausencia de PII y de telemetría
  cruda; el exportador tiene test de denylist de campos.
- Los gates 1 y 2 quedan registrados en la issue correspondiente antes de
  cualquier publicación.
