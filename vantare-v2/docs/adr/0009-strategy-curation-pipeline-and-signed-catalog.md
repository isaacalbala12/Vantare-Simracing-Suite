# ADR 0009 — Pipeline editorial, subida opt-in y catálogo firmado de Strategy

**Estado:** Accepted (Isaac, 2026-08-22; rev. 2 tras threat-model adversarial
de dos rondas en #724)
**Fecha:** 2026-08-21
**Decisores:** Isaac y Vantare engineering
**Contexto:** ISA-694, decisiones D10–D16, D18–D19 del spec
(`docs/strategy-planner/isa-694-spec.md`); review adversarial en issue #724

## Contexto

El corte A+B de Strategy Planner añade un ciclo comunitario: los usuarios
suben derivados seudonimizados de su telemetría, un pipeline editorial en el
PC de Isaac los analiza, e Isaac publica un catálogo curado (mejores
estrategias y perfiles de referencia por combinación) que la app descarga.
Este ADR fija fronteras, seguridad y privacidad con presupuesto mínimo
(D10/D11). La rev. 2 incorpora el threat model adversarial (#724).

## Decisión

### Roles y autoridad

1. **La predigestión es determinista y reutiliza la autoridad única.** El
   curador (`cmd/vantare-curator`) agrega bundles por combinación, deduplica,
   puntúa **llamando al mismo motor y backtest versionados de Strategy**
   (publica versión y hash del motor usado; prohibida cualquier fórmula
   paralela) y agrupa estrategias observadas.
2. **El LLM solo redacta y cura, aislado.** Recibe exclusivamente estructura
   allowlisted de los resúmenes deterministas (sin texto libre de terceros:
   los strings de combinación se normalizan desde catálogos internos), no
   dispone de herramientas de escritura, firma ni publicación, y su salida se
   trata como no confiable hasta la decisión humana. No calcula, no ordena el
   ranking, no inventa estrategias (ADR 0006).
3. **Isaac decide qué se publica.** Flujo de decisión simple sobre el informe;
   la automatización posterior vía skills es una decisión futura separada y
   se adoptará solo si reduce trabajo editorial medido (mitiga
   sobre-ingeniería). El pipeline corre como tarea programada en el PC de
   Isaac con sus suscripciones (D13).

### Consentimiento y privacidad

4. El contrato de producto se actualiza **en este mismo cambio** (no en F6):
   consentimiento permanente **opt-in, versionado, registrado y revocable**
   (D18), con cola de subida visible e inspeccionable antes del despacho,
   historial, pausa y revocación y borrado remoto como acciones separadas.
   **Semántica exacta de pausa (sin promesas imposibles):** pausar detiene la
   cola y cancela reintentos y todo request aún no aceptado por el Worker; un
   request ya aceptado cuenta como enviado, aparece en el historial y su
   eliminación se hace por la vía de borrado remoto (§11), no por la pausa.
5. **El bundle es seudonimizado, no "anónimo".** `CurationBundle v1` se
   define por **allowlist cerrada campo a campo** (`additionalProperties`
   false en todos los niveles): identidad de combinación desde catálogo
   interno, agregados de stint/pit, curvas derivadas cuantizadas, estrategias
   observadas y calidad de canal. Sin fechas absolutas (solo épocas
   cuantizadas, p. ej. semana ISO), sin telemetría cruda, nombres, SteamID ni
   rutas. El identificador administrativo (borrado/cuota) viaja separado del
   payload analítico. Presupuesto empírico ~1,3 KB gzip/sesión (F0-1).
6. **k-anonimato editorial:** ningún perfil de referencia ni estrategia
   curada se publica si su cohorte tiene menos de `k` instalaciones
   distintas (k inicial: 3) o depende de un único origen; las combinaciones
   raras se suprimen. Los fixtures sintéticos y las capturas controladas
   jamás se mezclan con el corpus de producción (ver §9).

### Identidad y credenciales de subida

7. El token de build **solo es filtro de admisión**, nunca identidad. Al
   activar el opt-in, la app genera localmente dos secretos aleatorios
   independientes: `uploadSecret` y `deleteSecret`. El Worker almacena solo
   sus hashes. Toda subida, consulta de cuota o borrado exige prueba de
   posesión del secreto correspondiente; rotación y revocación soportadas.
   Nadie puede consumir cuota ajena ni borrar datos ajenos.

### Worker de ingesta

8. Un Cloudflare Worker (`infra/curation-worker`) con storage de objetos
   **privado** (sin lectura ni listado público). Protocolo de subida:
   - validación estricta de schema con allowlist cerrada, cero coerción,
     rechazo de campos desconocidos, `NaN`/infinitos y strings anómalos;
     límites por campo, profundidad, cardinalidad y tamaño **comprimido y
     descomprimido**; rechazo antes de escribir;
   - **idempotencia por digest semántico** del payload normalizado tras
     validación (reordenar JSON o regzipear no burla el dedupe);
   - cuotas por credencial, por IP y **globales** (objetos y bytes por día y
     mes) con fail-closed y alerta de presupuesto;
   - retención de bundles crudos: 180 días; logs sin payload y con
     identificadores truncados;
   - **procedencia inmutable por entorno** (§9) registrada en cada objeto.
9. **Separación de entornos y anti-poisoning:** `test`,
   `controlled-capture` (campaña D19) y `production-community` son espacios
   físicamente separados con credenciales distintas; en la campaña cerrada
   cada tester recibe credenciales individuales emitidas por Isaac. Límites
   de contribución por credencial y combinación, mínimo de contribuidores
   distintos (§6), agregación robusta con detección de outliers y
   consistencia entre sesiones en el curador. El ranking determinista no
   protege por sí solo: la defensa es procedencia + cohortes + robustez.
10. **Control plane explícito** (mínimo privilegio, credenciales separadas):

    | Frontera | Credencial | Permiso |
    |---|---|---|
    | Cliente → upload | uploadSecret (+ token build) | escribir su objeto |
    | Usuario → delete | deleteSecret | tombstone de lo suyo |
    | Curador → pull | credencial lectura + delete acotado | leer bundles/tombstones y borrar únicamente objetos de bundle ya procesados o marcados por tombstone |
    | Publicador → GitHub | token limitado al artefacto | publicar catálogo |
    | Operador → storage | credencial admin auditada | mantenimiento |

    **Publicar el Worker requiere autorización explícita de Isaac (gate 1).**

### Borrado remoto de ciclo completo

11. El borrado genera una **tombstone autenticada** que el curador consume en
    su siguiente pull: elimina bundles del storage (con su credencial de
    delete acotado, §10), copias locales del PC de Isaac, índices, **cachés
    descargadas y los informes/resúmenes LLM derivados de esos bundles**; los
    agregados afectados se recalculan y, si el catálogo publicado dependía de
    ellos, se republica. **SLA:** la tombstone se aplica en el siguiente ciclo
    del curador y como máximo en 7 días; el recibo de finalización se emite al
    completarse todo el alcance. Política de backups alineada (sin backups
    fuera de la retención). Las salidas agregadas irreversibles (cohortes ya
    publicadas que cumplen §6) se declaran antes del consentimiento.

### Catálogo firmado

12. `Catalog v1` se publica en GitHub (D11) firmado con **Ed25519 con
    separación de dominio**. **La firma cubre el envelope completo**, no solo
    el payload: `domain`, `catalogId/channel`, `schemaId+schemaVersion`,
    `keyEpoch`, `version` (monotónica dentro de la época), `publishedAt`,
    `expiresAt` y `payloadDigest`. Serialización canónica **RFC 8785 (JCS)**;
    claves duplicadas o desconocidas ⇒ rechazo; sin formato criptográfico ad
    hoc más allá de esa composición estándar.
13. Cliente: épocas de clave confiadas embebidas por release (con vigencia
    por clave y **versión/época mínima aceptable** embebida), persistencia
    atómica de época+versión máxima vista, anti-rollback entre y dentro de
    épocas, y purga del caché firmado por claves revocadas. **`expiresAt` es
    duro:** un catálogo expirado deja de usarse para recomendaciones y la app
    degrada a datos locales/vacío con aviso (anti-freeze real). Firma válida
    con schema incompatible ⇒ se ignora completo con aviso.
14. **Cadena de firma aislada del repo:** el pipeline genera el catálogo SIN
    firmar; tras la revisión de Isaac, una herramienta de firma mínima,
    fijada y sin acceso a red (proceso separado del curador y de todo lo que
    toca dependencias del repo) produce el envelope; un tercer paso publica
    con un token GitHub limitado. La clave privada vive cifrada con ACL
    exclusiva y backup protegido en el PC de Isaac; nunca en repo, CI ni
    Worker. **Runbook de compromiso:** revocar época en release, rotar clave,
    republicar; los clientes purgan el caché de la época revocada.
    **Publicar el primer catálogo requiere autorización explícita de Isaac
    (gate 2).**

### Ownership del forecast y perfiles

15. **Telemetry Core** posee la adquisición del forecast (REST
    `GET /rest/sessions/weather`, verificado en #702) y la expone como señal
    con presencia/freshness. **Strategy** persiste `WeatherScenario v1` al
    capturar. Overlays consume exclusivamente `StrategyWeatherReadModel v1`
    de Strategy.
16. `PilotProfile v1` es propiedad de Strategy, exportable/importable como
    archivo (puente de equipo sin servidor) y es la unidad que la subida
    opt-in comparte, seudonimizada según §5.

## Alternativas descartadas

- Envío manual por bundle como único modo: contradice D10/D18.
- Backend con cuentas: coste y superficie innecesarios para ~KB por sesión.
- Sin firma o firma solo del payload: deja versión/fechas/schema falsificables
  (hallazgo #1 del threat model).
- `installId` autodeclarado como identidad: suplantación y borrado ajeno
  (hallazgo #2).
- LLM como autoridad de ranking o con herramientas: rompe ADR 0006 y abre
  prompt injection (hallazgo #13).

## Consecuencias

- Positivas: corpus con procedencia y resistencia a poisoning; privacidad
  verificable por allowlist; catálogo con anti-rollback/freeze reales; coste
  ~cero mantenido.
- Costes: gestión de credenciales por tester en la campaña; firma en dos
  pasos con herramienta aislada; k-anonimato retrasa la publicación de
  combinaciones poco pobladas; dos gates humanos de publicación.

## Verificación

- Worker: tests adversariales de replay, payload inválido/desconocido,
  sobre-tamaño comprimido y descomprimido, abuso de cuota por identidades
  nuevas, prueba de posesión (subida y borrado con secreto ajeno fallan).
- Catálogo: firma inválida, `keyId`/época desconocidos, rollback entre y
  dentro de épocas, expiración dura, schema incompatible — degradan a local
  con aviso; property tests del envelope JCS.
- Privacidad: corpus de canarios PII + fuzz sobre el exportador; test de
  allowlist con `additionalProperties=false`; test de cuantización de fechas.
- Curación: test de que el score procede del motor/backtest versionado de
  Strategy (hash publicado); test de cohorte mínima k y de separación de
  entornos.
- Los gates 1 y 2 quedan registrados en la issue antes de publicar.
