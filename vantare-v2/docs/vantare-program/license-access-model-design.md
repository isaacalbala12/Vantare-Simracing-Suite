# Recorrido de licencias — diseño (revisión general, frente P1)

> Versionado en VANTA-126 / #1827, paso 0. Análisis original conservado abajo.
> Las preguntas de §4.6 ya están resueltas por las cinco decisiones de #1827;
> manda el [ADR 0102 — Modelo de acceso nativo](../adr/0102-modelo-acceso-nativo.md).
> Las rutas y líneas describen la base histórica indicada, no despliegues reales.
> Implementación por pasos; este documento no cambia comportamiento de producto.

Rol: analista de diseño (advisor) del orquestador. Solo lectura: no se ha editado
código, compilado, ejecutado la app ni leído secretos, `.env*` o datos reales de
licencias/sesiones. Base `origin/nightly` **a64df5c36b1d9435b29aa6c8fa251d97a5c1f161**
(31-oct-2026), leída en el worktree limpio
`D:\VantareServer\worktrees\isa-1782-rc9-rebuild-20261031-071133` (mismo SHA,
sin cambios). Rutas `native/...` relativas a `vantare-v2/`, `supabase/...` a la
raíz Git. Las líneas citadas son de ese SHA.

Fuentes leídas: AGENTS.md (raíz y `vantare-v2`), MAPA.md (R3), informe
`license-pipeline-review-2026-10-30.md`, handoff `platform-commercial.md`
(secciones vigentes de VANTA-105), contrato de producto (Billing), issues
#1814, #1819, #1822, #1823, #1825, #1826, #1799 y #1816, y el código citado
abajo. No repito los hallazgos del informe del 30-oct: los uso como síntomas.

---

## Resumen para Isaac (en sencillo)

- **Lo que está bien y se queda:** la firma de la licencia, que solo el núcleo
  decida qué widgets se abren, el reloj anti-trampas, que cada almacén tenga un
  solo escritor y la forma en que el servidor calcula los derechos (una tabla →
  una vista → una función → una firma). Eso es sólido y no hay que rehacerlo.
- **Lo que falla es el reparto:** la pregunta «¿puede usar Pro ahora mismo?» la
  responde una pieza, pero la pregunta «¿qué hago si algo falla?» la responden
  **cinco sitios distintos**, cada uno con su lista de errores. Y «¿hay sesión
  iniciada?» se calcula en **tres sitios** a partir de mensajes ajenos.
- **La pieza que más problemas da es una copia de más:** la app guarda la
  licencia dos veces (una copia «candidata» en servicios y la buena en el
  núcleo) y en cada arranque la pasa de una a otra. De esa copia salen cuatro
  bugs abiertos (otro PC, otra cuenta, marcador corrupto, cierre sin
  confirmar). Propongo quitarla.
- **#1814 (los 3 días de margen si falla un pago) se arregla en el servidor
  con unas 15 líneas:** el servidor ya calcula hasta cuándo dura ese margen; basta
  con firmarlo como fecha de fin normal. Funciona también en las versiones de la
  app ya instaladas, sin tocar la app.
- **Veredicto: consolidar, no rediseñar.** Diez pasos pequeños, cada uno
  integrable por separado y protegido por tests que fijan el comportamiento
  actual. Cuatro necesitan una decisión tuya (lista en §4.6).
- **Resultado esperado:** de 5 sitios que clasifican fallos a 1, de 3 que
  deducen la sesión a 1, de 4 almacenes de licencia a 2, de 2 puertas de emisión
  en el servidor a 1, y unas 1.300–1.700 líneas menos (sobre todo tests de casos
  que dejan de existir).

---

## 1. Cómo debería funcionar (una página)

**Tres hechos, tres dueños.** Cada hecho tiene un único dueño que lo decide y lo
publica. Los demás lo leen, no lo deducen.

| Hecho | Dueño único | Dónde vive | Naturaleza |
|---|---|---|---|
| Qué ha comprado la cuenta y hasta cuándo (incluido el margen por pago fallido) | Servidor: `normalizeGrants` sobre `billing_effective_access_grants` | Supabase (Polar es la autoridad comercial que lo alimenta) | Definitivo |
| Qué puede usar este PC ahora | Núcleo (`rights::Owner`) | `binding.dpapi` + `authority.dpapi` | Definitivo local (firmado y con reloj anti-retroceso) |
| Si hay sesión de cuenta | Servicios (`Account`) | `account.dpapi` | Definitivo local |
| Cuándo renovar y qué decirle al usuario si falla | Supervisor (`Renewal`) | Memoria | Transitorio |
| Qué se ve en pantalla | Hub/overlays, leyendo la `Policy` | Memoria | Transitorio |

**Estados de la cuenta** (los publica servicios en un solo campo):
`SinSesión` → (login) → `Pendiente` → `Activa{caduca_token}` → (refresh rechazado)
→ `RequiereLogin` → (login con la misma identidad) → `Activa`.
`Activa` → (Cerrar sesión) → `SinSesión`. Un login de **otra** identidad revoca
antes la licencia local. Un token caducado o rechazado **no** borra la licencia:
pide volver a entrar.

**Estados de la licencia en este PC** (los publica el núcleo en `Policy.state`):

| Estado | Qué ve el usuario | Sale por |
|---|---|---|
| `SinLicencia` | Pantalla de acceso; nada de pago | Renovación online correcta |
| `Verificada{plan, hasta}` | Su plan; candados según catálogo | Caducar → `Verificada{Gratis}`; revocación explícita → `SinLicencia` |
| `EnGracia{hasta}` | Sigue en carrera hasta 1 h tras caducar, si la carrera empezó antes | Fin de la sesión o fin de la gracia |
| `Recuperando{motivo}` | Mensaje con la acción concreta: reloj, almacén dañado, otro PC, actualizar app | Renovación online que lo resuelva; nunca borrando ficheros |

**Qué hace lo automático y qué hace el usuario.**
- **Automático (supervisor):** renueva cuando toca, con espera creciente entre
  intentos (1/2/4/8/15 min) si falla. **Nunca revoca**, nunca cierra sesión y no
  repite acciones con efecto (reset de dispositivo, compra).
- **Usuario:** iniciar o cerrar sesión, comprar, «Comprobar acceso» (fuerza una
  renovación ya; mismo efecto que la automática) y «Restablecer dispositivo».
- **Solo tres cosas revocan la licencia local:** cerrar sesión, entrar con otra
  identidad y restablecer el dispositivo. Siempre con confirmación durable del
  núcleo antes de anunciarlo.

**Plazos.**
- **Caducidad:** la marca la firma (`paid_through` de cada derecho). Offline
  funciona hasta esa fecha, tal y como dice el contrato.
- **Margen por pago fallido (72 h):** el servidor lo firma como fecha de fin del
  derecho, contando desde el primer fallo. Si se paga, la renovación trae la
  fecha nueva; si no, al llegar el plazo se baja a Gratis.
- **Renovación:** 1 h antes de la caducidad firmada. Si no hay caducidad
  (Founders o Gratis), una comprobación online al arrancar y otra como máximo
  cada 24 h (decisión pendiente, R1).
- **En carrera (Live):** no se arranca red salvo que la licencia esté a punto de
  caducar o haya una compra en curso. Solo el núcleo decide la gracia de carrera.
- **Reloj:** el núcleo no acepta que el reloj vaya hacia atrás respecto a lo ya
  visto. Corregirlo exige una renovación online, que reancla la hora con la del
  servidor.

---

## 2. Cómo funciona hoy

### 2.1 Sitios que deciden acceso, renovación o revocación

El mapa contaba 9. En el cliente hay más, porque una misma decisión se repite
entre procesos. Los agrupo por **qué** deciden:

**A. Qué derechos existen y con qué forma (2 copias de la misma regla)**

1. Servidor: `supabase/functions/_shared/license-credential.ts:240-351`
   (`normalizeGrants`) — fuentes válidas, perpetuo/temporal, recuperación
   aparte (`:276-289`), canal nightly ligado a Founders (`:310-319`).
2. Cliente: `native/services/src/license.rs:354-417` (`grants`) repite la
   matriz perpetuo/temporal (`:378-410`), incluido el caso nightly+Founders
   (`:384-391`). Es defensa en profundidad razonable; el riesgo es que se
   desincronicen (R15 del informe).

**B. De derechos a catálogo y módulos (núcleo; bien centralizado)**

3. `native/services/src/license/catalog.rs:4-18` — derechos → `CatalogAccess`
   (owner y testers → Pro).
4. `native/runtime/src/rights/mod.rs:388-433` — módulos y tester a partir del
   catálogo y de los roles.
5. `native/ipc/src/control.rs:125-140` — widgets y módulos permitidos por
   catálogo. Lo usan `ui/src/rights.rs:8-10` y `hub/src/shell/navigation.rs:21-51`.
   **Bien:** un solo catálogo para Hub y overlays.

**C. Aceptar o rechazar una credencial en este PC (2 procesos)**

6. Núcleo: `runtime/src/rights/mod.rs:120-203` (`Owner::open`: binding en
   disco → verificar, autoridad, cuarentena) y `:252-307` (`install_from`).
7. Autoridad (código del núcleo que vive en el crate de servicios):
   `services/src/license/authority.rs:156-182` (`observe`, suelo de reloj),
   `:184-235` (`install`), `:239-293` (`install_online`, reanclaje),
   `:440-458` (`invalidate`, lápida), `:460-481` (gracia).
8. Servicios **también** verifica, antes del núcleo:
   `services/src/license_remote.rs:111` (respuesta HTTP) y
   `services/src/app.rs:128-159` (candidate en disco: clave, firma, dispositivo
   propio). De ahí salen #1810, #1825 y #1798: dos verificadores con entradas
   distintas (`candidate.device` frente a la huella del núcleo).

**D. Clasificar un fallo como «definitivo» o «transitorio» (5 sitios)**

9. `services/src/app.rs:342-353` — renovación **manual**: Authentication, Denied,
   Conflict y DeviceLimit **revocan** la licencia local.
10. `services/src/app.rs:603-628` (`automatic_failure`) — renovación automática:
    lista propia de «definitivo» (incluye `Core(Rejected)`).
11. `services/src/app.rs:479-500` — refresh OAuth: si no es automático, revoca y
    cierra sesión.
12. `runtime/src/rights/host.rs:319-338` (`response_error`) — el núcleo traduce
    a `REJECTED`/`UNAVAILABLE`, con un caso especial para Clock de caché
    (`:327`); `ipc/src/control.rs:288-296` lo convierte de nuevo en `Failure`.
13. `runtime/src/services.rs:481-494` (`renewal_outcome`) — el supervisor vuelve
    a clasificar la respuesta, incluido «urgente» (`renewal.rs:23`).

**E. ¿Hay sesión? (3 deducciones)**

14. Servicios: `Account::identity()` (`services/src/account.rs:359`), la verdad.
15. Supervisor: `runtime/src/services/renewal.rs:72-89` la **deduce** de los
    `Reply::Account` que pasan hacia el Hub, con una regla propia sobre `error`
    y `expires_at`.
16. Hub: `hub/src/services/access.rs:249-291` (`expires_at`, `session_known`,
    `login_requested`, `transition`) más `view.rs:1015` (`account.signed_in`).

**F. Cuándo renovar y si los servicios siguen vivos (3 bucles)**

17. Supervisor, temporizador: `runtime/src/services.rs:582-646`.
18. Supervisor, admisión: `services.rs:360-407` (se cierra en juego, se exige
    política vigente salvo en comandos de acceso) y `:449-454` (**exige
    TransferRights confirmado antes de atender al Hub**).
19. Hub: `hub/src/services/view.rs:410-419` (LicenseStatus cada 5 s para leer
    avisos) y `:430-446` (LicenseRenewAutomatic cada 5 s mientras espera una
    compra; el temporizador del supervisor ya renueva en esa ventana gracias a
    `purchase_until`, `services.rs:322`).
20. Plazo de renovación: `renewal.rs:154-187` (incluye la consulta inicial si
    `catalog == Free`, `:181`, el caso de #1826) y `renewal.rs:27-36`, que
    **resta la gracia de juego** a `valid_until_ms` porque la `Policy` mezcla
    plazo firmado y gracia.

**G. Qué se ve (Hub)**

21. `hub/src/shell/navigation.rs:31-51` (`from_policy`) y `:53-60`
    (`beta_visible`: Calendar exige tester).
22. `hub/src/services/view/account.rs:143-151`: «Incluido» en Cuenta usa `lock`,
    no `beta_visible` (R8).
23. `hub/src/services/view.rs:89-106` (`PurchaseWait::confirmed`: producto →
    catálogo esperado).
24. `services/src/app.rs:1213-1222` (`has_commercial_license`): vuelve a decidir
    «es de pago» desde los claims, solo para analítica.

**H. Servidor**

25. Dos puertas HTTP a la misma emisión: `native-license/index.ts:42-142`
    (OAuth nativo) y `_shared/license-credential.ts:121-191` + `:388-479`
    (`license-credential`, bearer de sesión/datos de Wails). **Ningún binario
    nativo llama a `license-credential`** (búsqueda en `native/`: solo
    `native-license`). Sus comprobaciones de autorización son distintas (#1815).
26. Estados de suscripción decididos dos veces:
    `billing-webhook/process.ts:330-357` (`subscriptionStatus`, lista propia) y
    `subscription-lifecycle.ts:32-101` (`deriveSubscriptionTransition`, que sí
    sabe revocar). El filtro de `process.ts` pasa primero y manda a cuarentena
    lo que el ciclo de vida sabría tratar (#1813, R14).
27. `billing-reconcile/worker.ts:39-47` fabrica eventos sintéticos
    (`subscription.updated`) que pasan por ese mismo filtro.
28. `billing_effective_access_grants`
    (`migrations/20261015193638_checkout_automatic_compensation.sql:59`): un solo
    filtro de bloqueos, cuentas borradas y compensaciones. **Bien.**
29. Roles operativos: `license-credential.ts:200-238` (alquileres de 14 d, 72 h
    y 30 d). Bien acotado.
30. `native-admin`: escribe roles, bloqueos y reembolsos (fuera de esta lectura
    detallada).

### 2.2 Almacenes

| Almacén (namespace `Store`) | Documentos | Escritor | ¿Hace falta? |
|---|---|---|---|
| `services/<sha(v1\|issuer\|client\|canal\|backend)>` | `account`, `oauth-metadata`, `account-profile`, borradores de compra | services | Sí |
| `services/<sha(license-v1\|backend\|canal)>` | `license-candidate`, `license-transfer-pending` | services | **No** (copia de la credencial + marcador de reintento) |
| `rights/<canal>/<sha(core-rights-v1)>` | `binding`, `authority`, `authority-recovery` | núcleo | Sí |
| `rights/<sha(core-installation-v1)>` | `installation` (semilla Ed25519 v2) | núcleo | **No hoy**: ningún servidor emite v2 (`license.rs:100` «Destination contract… not an existing endpoint»); `proof`/`jws` (`license.rs:203-221`, `:280-328`) solo se usan desde el núcleo (`rights/mod.rs:238`) y en tests |

El `Store` (un escritor, bloqueo exclusivo, ACL privada, DPAPI con contexto) es
un buen patrón y es el mismo para roadmap, informes y pilot. Pero ofrece **cuatro
formas de leer** (`load`, `load_cache`, `restore_cache`, `load_for_restore`,
`storage.rs:133-191`) y **tres de apartar** (`quarantine`,
`quarantine_preserving`, `quarantine_dated`, `:210-290`). Cada llamada elige
una a mano, y esa elección decide si un fichero dañado bloquea para siempre (F1/F3)
o se recupera. Es la causa común de #1806 y #1808.

### 2.3 Capas de derechos y fuentes divergentes

| Capa | Representación | Contradicción o duplicado observado |
|---|---|---|
| Comercial | `billing_access_grants` + bloqueos + recuperación | Recuperación activa (72 h) que **no se firma** (`license-credential.ts:287`, `:597`) → #1814 |
| Firmada | `CredentialV1.claims.capabilities` | Viaja junto a `online_capabilities`, que el cliente valida y descarta (`license_remote.rs:101-107`): un campo sin uso |
| Copia en servicios | `license-candidate` | Puede ser de otro PC o de otra cuenta y bloquear la admisión (#1810) o crear el primer binding (#1825) |
| Local durable | `binding` + `authority` | Correcta; su estado se expresa con 5 booleanos (`invalidated`, `recovery_required`, `confirmed_game`, `denied` en Owner y `damaged` al restaurar) |
| Publicada | `Policy` (TTL 2 s) | `overlays_advanced` + `error: Option<String>` + `online_recovery_required` + `valid_until_ms` (que incluye la gracia). Los consumidores reconstruyen el estado: `renewal.rs:27-36` resta la gracia; `app.rs:207-214` deduce el mensaje; Hub compara cadenas de error |
| Avisos | `state.notice` del supervisor, consumido con `take()` (`services.rs:365`) | El Hub lo pide como Background y lo descarta (`view.rs:931-932`) → R11/#1799 |

**Duplicados textuales:** la «política denegada» (seis booleanos a `false`) se
escribe cuatro veces: `rights/mod.rs:299-304`, `:310-315`, `:367-372` y
`host.rs:206-211`.

**Contradicciones de comportamiento hoy:**

- La misma respuesta del servidor (401/403/409) **revoca** si el usuario pulsó
  «Comprobar acceso» y **conserva** si fue automática (`app.rs:342` frente a
  `:609`). El contrato dice que la firma offline vale hasta su expiración.
- El servicio responde «Sesión Clerk protegida; derechos pendientes del
  núcleo» (`app.rs:954`) aunque el núcleo ya haya verificado (#1801): el mensaje
  de sesión adivina el estado de los derechos.
- El Hub afirma que «nunca inicia una concesión HTTP duplicada»
  (`access.rs:170-171`), pero durante una compra envía LicenseRenewAutomatic cada
  5 s (`view.rs:441-445`) además del temporizador del supervisor.
- `rights/mod.rs:1` («único dueño local de firma… y decisión») y `app.rs:1`
  («nunca decide derechos del núcleo») son ciertos sobre los derechos, pero no
  sobre la caché: servicios decide sola apartar un candidate por dispositivo
  o firma (`app.rs:145-161`).

---

## 3. Veredicto: **consolidar**

**No rediseñar.** El modelo de base es correcto y encaja con el resto de la app:
una credencial firmada que el servidor emite y solo el núcleo acepta, un único
escritor por almacén, IPC tipado y versionado con el mismo `Store` y los mismos
errores cerrados que el resto, y un `Policy` que consumen igual Hub y overlays.
El servidor tiene una sola fuente efectiva de derechos. Rehacerlo costaría meses
y volvería a abrir la seguridad (firma, replay, anti-retroceso) que ya está
probada y sin P0.

**Pero no basta con mantenerlo.** Medido contra los dos criterios:

1. **Encajar con el resto.** Falla en tres puntos: (a) servicios guarda una
   segunda copia de un dato que es del núcleo, cuando en el resto de la app cada
   dato tiene un dueño; (b) el supervisor deduce la sesión espiando respuestas en
   vez de leer un campo; (c) el `Store` deja elegir a mano entre cuatro lecturas.
2. **Fácil de mantener por agentes.** Falla en lo esencial: «¿es definitivo este
   fallo?» se decide en cinco sitios; la revocación tiene una excepción escondida
   (manual frente a automática); el estado de la licencia se reconstruye con
   booleanos y cadenas de error. La prueba son los 17 arreglos y 8 P1 del
   recorrido: casi todos son «caso X no previsto en el sitio Y», y cada parche
   ha añadido un booleano o un marcador (`recovered_renewal_transfer`,
   `license-transfer-pending`, `authority-recovery`, `online_recovery_required`).

Consolidar significa: **una pieza por decisión, estados explícitos y quitar la
copia sobrante.** No cambia la criptografía, el formato de `binding`/`authority`
ni el modelo comercial.

---

## 4. Propuesta

### 4.1 Estructura objetivo: quién decide qué

| Decisión | Pieza única | Qué cambia |
|---|---|---|
| Derechos y plazos, incluida la recuperación | Servidor, `normalizeGrants` | La recuperación se firma como `paid_through` (§4.4) |
| Puerta de emisión | `native-license` | Se retira `license-credential` (#1815) |
| Estado de suscripción | `deriveSubscriptionTransition` | `process.ts` y `reconcile` usan su lista de estados; sin lista paralela (#1813, R14) |
| Aceptar credencial, reloj, lápida, gracia, catálogo | Núcleo `rights::Owner` (+ `Authority`) | Servicios ya no verifica ni guarda credenciales |
| Estado de licencia publicado | `Policy.state` (enum) | Sustituye a la combinación de booleanos y cadenas; un solo constructor `Policy::denied(motivo)` |
| Clasificar un fallo | Una función pura `outcome(Error) -> Outcome` en servicios | La usan app, supervisor y Hub; desaparecen 4 copias |
| Revocar | Solo Logout, cambio de identidad y DeviceReset | Ninguna renovación revoca (decisión §4.6) |
| Sesión | `Account`, publicada como `session: Session` en `Reply::Account` | El supervisor y el Hub leen el campo; no deducen |
| Cuándo renovar | Supervisor `Renewal` | El Hub deja de enviar renovaciones; la `Policy` trae `renew_by` sin mezclar la gracia |
| Aviso al usuario | Último resultado del supervisor, persistente hasta otro resultado | Sin `take()`; lo sirve LicenseStatus sin arrancar el helper |

Estados explícitos propuestos (nombres orientativos):

```text
// ipc::control (protocolo de derechos v7)
enum AccessState { Unconfigured, NoLicense, Verified, Grace, Recovering(Reason) }
enum Reason { ClockBehind { until_ms }, StorageDamaged, DeviceMismatch,
              Revoked, UpdateRequired }
Policy { version, epoch, revision, checked_at_ms, state, catalog,
         modules…, tester, live, signed_until_ms, grace_until_ms }

// ipc::services_protocol (v16)
enum Session { SignedOut, Pending, Active { expires_at }, NeedsSignIn }
enum Outcome { Verified, Retry, NeedsUser(UserAction) }
enum UserAction { SignIn, ResetDevice, UpdateApp, FixClock, Support }
```

### 4.2 Qué se elimina

1. **`license-candidate` y `license-transfer-pending`**, junto con el comando
   `TransferRights` y su exigencia en la admisión (`services.rs:449-454`) y al
   cerrar (`services.rs:529-534`), `transfer_rights_observed`,
   `pending_renewal_transfer`, `quarantine_candidate`,
   `recovered_renewal_transfer` (`app.rs:35`, `:112-258`) y el `Install` de caché
   (queda solo la instalación tras HTTP nuevo). Servicios entrega la credencial
   recién recibida al núcleo y se olvida. Si se pierde el ACK, la siguiente
   renovación pide otra: emitir es idempotente en el servidor (mismo
   dispositivo, sin efectos comerciales). **Cambio de comportamiento justificado:**
   en el caso raro de perder el ACK local hace una petición HTTP más, a cambio de
   eliminar la clase entera de #1810/#1825/#1798, el punto 4 de #1819 y el
   «transferencia final sin confirmar» de #1816.
2. **Verificación en servicios**: `license_remote.rs:101-111` (validar
   `online_capabilities` y firma) y `app.rs:128-159`. Verifica solo el núcleo.
3. **Revocación en renovaciones**: `app.rs:342-353` y la rama manual de
   `refresh_oauth_origin` (`:489-500`). Un refresh rechazado pasa a
   `Session::NeedsSignIn` sin tocar la licencia (cierra R7 y lo que queda de
   R12).
4. **Las cuatro copias de clasificación** (§2.1 D) → `outcome()`. El núcleo
   sigue respondiendo `REJECTED`/`UNAVAILABLE`, pero esa es su única tabla.
5. **Deducción de sesión** en `renewal.rs:72-89` y en `access.rs:249-291`.
6. **Bucle de renovación del Hub durante la compra** (`view.rs:430-446`): el
   Hub solo observa el Feed (ya confirma en `observe_core_policy`, `:369-392`).
7. **`has_commercial_license`** (`app.rs:1213`): la analítica lee
   `policy.catalog` del ACK del núcleo.
8. **Endpoint `license-credential`** (`supabase/functions/license-credential/`,
   `_shared/license-credential.ts:121-198`, `:388-490`): pasa a `_deprecated`
   con 410, tras confirmar que no queda ningún cliente Wails (decisión §4.6).
9. **`online_capabilities`** como contenido: el servidor siempre envía `[]`
   (el campo se mantiene por compatibilidad con clientes instalados, que lo
   exigen por `deny_unknown_fields`).
10. **Opcional, si v2 no está planificado:** `ClaimsV2`/`jws`/`proof`,
    `Installation` y el almacén `core-installation-v1`
    (`license.rs:100-112`, `:203-221`, `:280-328`; `installation.rs:38-88`;
    `rights/mod.rs:31-39`). Si v2 sí está planificado, se conserva fuera del
    camino de arranque y se documenta en el ADR.

### 4.3 Contratos que cambian y compatibilidad

| Contrato | Cambio | Compatibilidad |
|---|---|---|
| Respuesta `native-license` | Sin cambio de forma. La recuperación aparece como `paid_through` del derecho; `online_capabilities: []` | Todos los clientes v1 instalados ya entienden `paid_through`; reciben el margen sin actualizar |
| `license-credential` | Retirado (410) | Solo afecta a clientes Wails retirados (#1533); confirmar antes |
| Control núcleo v6 → v7 | `Policy.state`, `signed_until_ms`/`grace_until_ms` en lugar de `valid_until_ms` + `online_recovery_required`; se retira `Install` de caché | Núcleo, servicios, Hub y overlays se instalan juntos en cada generación; una mezcla ya da `VersionMismatch` explícito (`control.rs:213-227`). Paso transitorio: v7 publica también los campos antiguos durante un corte si se quiere poder bisecar |
| Servicios v15 → v16 | `Reply::Account.session`; `Reply::LicenseFailure` lleva `Outcome`; se retira `TransferRights` | Mismo binario/generación que el supervisor |
| Datos en disco | `binding`/`authority`/`authority-recovery` **sin cambio de formato** | Una generación nueva lee lo de la anterior. `license-candidate`/`-pending` sobrantes: se ignoran (o se apartan una vez con `quarantine_dated`). No hace falta migración de datos |
| Generación anterior leyendo datos de la nueva (rollback del instalador) | La anterior encuentra `binding`/`authority` válidos y sin candidate | Funciona: sin candidate, la generación anterior hace `Read` (`app.rs:198`) y, si toca, renueva por HTTP |

### 4.4 Cómo encaja #1814 (recuperación firmada)

El servidor ya modela bien la recuperación: `deriveSubscriptionTransition`
abre un ciclo en `past_due` (`subscription-lifecycle.ts:69-90`),
`mergeRecoveryCycle` fija `recoveryUntil = primer fallo + 72 h` sin reiniciarlo
con reintentos (`:103-123`) y la vista efectiva excluye la recuperación si la
suscripción está bloqueada por un reembolso (`…compensation.sql:62-64`). Lo único
que falta es firmarlo.

**Diseño:** en `normalizeGrants`, una fila `subscription_recovery` vigente para
la capability X se trata como una fila temporal más con
`valid_until = recovery_until`. Se agrupa con las demás y gana la fecha mayor,
igual que hoy entre suscripciones (`license-credential.ts:324-326`). El derecho
firmado sale como `{key: "vantare.plan.pro", paid_through: recovery_until}`.

- No cambia el `paid_through` comercial de la base de datos: solo la validez
  firmada, que ya significa «válido hasta».
- No es perpetuo ni se reinicia: lo acota `recovery_until`, calculado una sola
  vez en el servidor.
- Exige comprobación online: el cliente renueva 1 h antes de esa fecha. Si se ha
  pagado, recibe el plazo nuevo; si no, la fila ya no está vigente, no se firma y
  el cliente baja a Gratis al caducar.
- Reembolso o bloqueo durante el margen: la vista ya lo excluye en la siguiente
  emisión; offline dura como mucho 72 h, igual que cualquier derecho temporal.
- Cero cambios en el cliente, en el IPC y en el núcleo. Compatible con todas
  las generaciones instaladas.
- Lo que no aporta: la UI no distingue «pagado» de «en margen». Si producto lo
  quiere («pago pendiente»), se añade más tarde como dato informativo de la
  respuesta, sin autoridad, o en `Policy.state` cuando exista.

**Tests de aceptación:** Pro/Plus `past_due` antes, en y después de
`recovery_until`; pago posterior que cierra el ciclo; reembolso que bloquea;
otra fuente intacta; fixture de cliente con la credencial resultante (el
verificador Rust la acepta y la caducidad es exactamente `recovery_until`);
réplica sin ventana nueva. Hay que cambiar el test que hoy exige lo contrario
(`license-credential/index.test.ts:257`, «recovery… never enters the
envelope»): es un cambio de contrato y debe quedar en el ADR.

### 4.5 Plan por pasos (pequeños e integrables)

Cada paso es una issue `area:licencias` con su PR a `nightly`. Los «iguales»
se demuestran con tests de caracterización escritos **antes**, en el paso 0.

| # | Paso | Tipo | Cierra o absorbe | Demostración |
|---|---|---|---|---|
| 0 | **Tests de caracterización.** Matriz en el núcleo (estado × evento → `Policy`: instalar, caducar, gracia, reloj atrás, lápida, invalidar, almacén dañado); matriz en services (`Error` × origen → resultado y efectos: revoca sí/no, candidate sí/no, sesión); matriz `normalizeGrants` en el servidor | Solo tests | Base de todo | Pasan en nightly sin cambios de producto |
| 1 | **Recuperación firmada** (§4.4) | Servidor, cambio de comportamiento acordado por contrato | #1814 | Tests del §4.4 + fixture cruzada con el verificador Rust |
| 2 | **Una lista de estados de suscripción**: `process.ts` y `reconcile` delegan en `deriveSubscriptionTransition`; `revoked` de snapshot → revocación | Servidor, arreglo | #1813; R14 tras decidir política para estados desconocidos | Matriz lifecycle + reconcile `status=revoked`, réplica y desorden |
| 3 | **Retirar `license-credential`** | Servidor | #1815 por eliminación | Inventario de consumidores; test 410; `native-license` sin cambios |
| 4 | **`outcome()` único** y uso en los 4 sitios, conservando aún la diferencia manual/automática como columna explícita | Refactor | Base de R7/R11/R12 | Matriz del paso 0 sin diferencias |
| 5 | **Las renovaciones no revocan**; refresh rechazado → `NeedsSignIn` | Cambio de comportamiento (decisión §4.6) | R7, resto de R12 | Matriz: la columna «revoca» solo es verdadera en Logout, cambio de identidad y DeviceReset |
| 6 | **`Session` explícita** en `Reply::Account`; supervisor y Hub la leen | Refactor (services v16) | R10 cerrado de raíz; #1801 (el mensaje deja de adivinar derechos) | Matriz de sesión del paso 0; GPUI de acceso |
| 7 | **`Policy.state` y `Policy::denied()`** (control v7); `signed_until_ms`/`grace_until_ms`; consumidores migrados; se retiran `online_recovery_required` y las comparaciones de cadenas | Refactor + diagnóstico nuevo | #1822 F2 (motivo `ClockBehind{until}` y freno de reintentos inútiles), base de #1806 | Matriz del núcleo igual; tests de Hub y overlays por estado |
| 8 | **Quitar candidate y TransferRights** (§4.2.1) | Simplificación con un cambio menor justificado | #1810, #1825, #1798, #1819 pt.4, parte de #1816 | Fixtures: ACK perdido → transitorio → una renovación HTTP; restos de candidate ignorados; rollback a la generación anterior |
| 9 | **Aviso persistente**, servido sin arrancar el helper; el Hub deja de renovar durante la compra | Arreglo | #1799 pt.2/pt.5, R11 | Reloj inyectado: aviso visible tras perder una respuesta; compra confirmada solo por el Feed |
| 10 | **Cadencia máxima de comprobación** (24 h sin plazo firmado) | Cambio de comportamiento (decisión §4.6) | R1; criterio claro para #1826 | Reloj inyectado: éxito sin plazo → siguiente comprobación a las 24 h, sin ráfagas |
| 11 | *(Opcional)* Mover `Authority`, `catalog` y `Verifier` a `runtime::rights`; retirar v2 si no está planificado | Movimiento mecánico | Claridad de dueño | Mismos tests, otro crate; test de arquitectura `domain`/`ui` intacto |
| 12 | *(Transversal, issue propia)* `Store`: una lectura `read → {Valor, Falta, Dañado}` y una clase declarada por documento (guarda durable, caché reconstruible o secreto de sesión), con un único `quarantine_dated` | Refactor de storage | Raíz común de #1806/#1808 y #1822 F4 | Tabla de documentos con test por clase; afecta también a roadmap, informes y pilot |
| — | Documentación: README de services/runtime/ipc/hub con **una** sección de contrato vigente en lugar de las secciones fechadas apiladas | Doc | P3 R3 | Revisión del diff |

Orden: 0 → (1, 2, 3 en paralelo, servidor) → 4 → 5 → 6 → 7 → 8 → 9 → 10.
11 y 12 cuando convenga. Los pasos 4, 6 y 7 no cambian comportamiento. Los
pasos 1, 5, 8 y 10 lo cambian a propósito, con su justificación.

Interacción con el trabajo en curso: #1824 (#1810) y #1821 (#1808/#1812) están
en revisión. Si se integran, el paso 8 borra buena parte de #1824. Recomiendo
integrarlos igualmente (arreglan la base de RC9) y que el paso 8 los sustituya,
en lugar de pararlos.

### 4.6 Decisiones que necesito de Isaac (u orquestador)

1. **¿Una renovación manual puede revocar?** Recomiendo que **no** (paso 5): lo
   dice el contrato («la firma offline funciona hasta su expiración real») y
   elimina la excepción escondida. Consecuencia: una cuenta bloqueada conserva
   lo ya firmado hasta que caduque, igual que hoy con la automática.
2. **Retirar `license-credential`** (paso 3): ¿queda algún cliente Wails en uso
   real? Si no, se retira; si sí, se le aplica la misma barrera que a
   `native-license`.
3. **Cadencia sin plazo firmado** (paso 10): recomiendo arrancar más una vez
   cada 24 h para Founders/Gratis/Owner. La alternativa es solo al arrancar
   (lo de hoy).
4. **Gracia en pausa (R5):** ¿una pausa conserva la gracia de la carrera?
   Recomiendo que sí mientras sea la misma sesión del simulador; si producto
   dice que no, se retira R5.
5. *(Menor)* ¿Sigue planificada la credencial v2 (JWS + clave de instalación)?
   Si no, paso 11 la retira.

### 4.7 Riesgos

- **Anti-retroceso y lápida:** son la parte más delicada. Mitigación: el
  formato y la lógica de `Authority` no se tocan salvo para exponer su estado
  (paso 7). La matriz del paso 0 debe incluir los casos de #1784/#1807/#1822.
- **Quitar el candidate:** si el núcleo no está disponible justo al recibir la
  credencial, se pierde esa emisión y se pide otra. Riesgo bajo: sin núcleo no
  hay derechos de todas formas, y emitir no tiene efectos comerciales. Vigilar el
  ritmo frente al rate limit de Clerk (sigue el suelo de 1 min).
- **Cambiar la semántica de revocación** puede sorprender a soporte («pulsé
  Comprobar acceso y sigo con Pro aunque me bloquearon»). Es lo que exige el
  contrato; hay que documentarlo en el runbook.
- **Firmar la recuperación** da hasta 72 h offline a quien no ha pagado. Es
  exactamente el margen del contrato; no es una concesión nueva.
- **Versiones de protocolo:** dos subidas (control v7, servicios v16). El
  instalador ya entrega todo junto; el riesgo real es un QA que mezcle binarios,
  y ese caso ya produce `VersionMismatch` explícito.
- **Tamaño del cambio:** se mitiga con pasos de uno o dos días y tests primero.
  Ningún paso mezcla servidor y cliente.

### 4.8 ADR

**Sí procede.** Un ADR corto, «Modelo de acceso nativo», que fije: los dueños de
§4.1, que solo Logout, cambio de identidad y DeviceReset revocan, que la
recuperación se firma como validez temporal (cambia el test de servidor citado),
que se elimina la copia candidate y que `Policy.state` es el contrato publicado.
Sin ADR, el siguiente arreglo volverá a añadir un booleano en el sitio más
cercano.

---

## 5. Simplificación esperada (estimada)

| Medida | Antes | Después |
|---|---|---|
| Sitios que clasifican definitivo/transitorio | 5 (§2.1 D) | 1 función + la tabla REJECTED/UNAVAILABLE del núcleo |
| Sitios que deducen la sesión | 3 | 1 (campo `session`) |
| Bucles que deciden cuándo renovar | 3 (temporizador, admisión, Hub en compra) | 1 (temporizador) + la admisión ya existente |
| Verificadores de credencial en ejecución | 2 procesos (services y núcleo) | 1 (núcleo) |
| Almacenes del recorrido | 4 namespaces / 9 documentos | 3 namespaces / 7 documentos (2 / 6 si se retira v2) |
| Copias de «política denegada» | 4 | 1 constructor |
| Booleanos de estado en `Policy` y `Owner` | `overlays_advanced`, `online_recovery_required`, `denied` + `error: String` | `state` (enum) + catálogo y módulos |
| Puertas HTTP de emisión | 2 | 1 |
| Listas de estados de suscripción | 2 | 1 |
| Caminos de revocación | 6 (Logout, identidad ×2, DeviceReset, renovación manual, refresh manual) | 4 (Logout, identidad email/OAuth, DeviceReset) |
| Líneas de producción (estimación) | services `app.rs` licencia ≈ 290, `license_remote` 140, supervisor ≈ 60 de transferencia, Hub ≈ 60, servidor legacy ≈ 170 | −450 a −600 |
| Líneas de test (estimación) | `candidate_tests.rs` 477 + ≈ 350 en `app.rs` sobre candidate/marcador + ≈ 150 en `license_remote/tests.rs` y servidor legacy | −700 a −1.000, sustituidas en parte por las matrices del paso 0 (+≈ 300) |
| Issues abiertas absorbidas | — | #1814, #1813, #1815, #1810, #1825, #1798, #1819 pt.4, #1799 pt.2/5, #1822 F2, R1, R7, R10, R11, R12; parte de #1816 y #1801 |

Total neto estimado: **1.300–1.700 líneas menos**, y sobre todo **menos casos**:
desaparecen los estados «candidate de otro PC», «candidate de otra cuenta»,
«marcador corrupto», «transferencia pendiente huérfana» y «revocado por pulsar
un botón».

### Lo que no cambia (y está bien)

- Firma Ed25519 v1, `verify_strict`, orden estricto de capabilities e ignorar
  claves desconocidas sin conceder (`license.rs:354-417`).
- Reloj anti-retroceso, lápida, tolerancia de 300 s y reanclaje online
  (`authority.rs`), con su batería de tests.
- Persistir antes del ACK y ACK antes de anunciar (`rights/mod.rs:279-281`,
  `:316-317`).
- Catálogo único para Hub y overlays (`control.rs:125-140`).
- Servidor: tabla de grants → vista efectiva → normalizador → firma; inbox de
  webhooks con lease; reconciliación por versión. El problema del servidor es de
  costuras (estados y recuperación), no de forma.
- Orden de DeviceReset (revocar antes de la red) y backoff 1/2/4/8/15.

---

## Cómo verificar este documento

```bash
git -C D:/VantareServer/worktrees/isa-1782-rc9-rebuild-20261031-071133 rev-parse HEAD
# a64df5c36b1d9435b29aa6c8fa251d97a5c1f161
# Consumidores de la emisión legacy en la app nativa (debe salir vacío):
grep -rn "license-credential" vantare-v2/native --include=*.rs
# Las copias de «política denegada»:
grep -n "policy.tester = false" vantare-v2/native/runtime/src/rights/*.rs
# Recuperación fuera de la firma:
grep -n "onlineCapabilities.add\|online_capabilities" supabase/functions/_shared/license-credential.ts
```

Límites: lectura estática; no se ejecutaron tests ni se consultó Supabase. Las
estimaciones de líneas son orientativas (conteo de los bloques citados). No se
verificó el bundle desplegado de `license-credential` ni si quedan clientes
Wails en uso.


## Anexo del paso 0 — caracterización ejecutable (#1827)

Las siguientes tablas viven junto al test y mantienen una fila por caso.
Son el comportamiento de la base `a64df5c36`, incluidos los fallos ya conocidos;
no son una implementación anticipada de este diseño.

| Tabla | Casos | Fuente |
| --- | ---: | --- |
| Estado/evento → Policy (Owner y Authority reales, firma y Store aislados) | 21 | [runtime: characterization](../../native/runtime/src/rights/tests/characterization.rs) |
| Error remoto/origen → Error tipado, revocación, candidate y sesión | 34 | [services: characterization](../../native/services/src/app/tests/characterization.rs), `nightly_error_origin_effects_matrix` |
| Error → resultado automático (incluido DeviceLimit) | 26 | mismo archivo, `nightly_automatic_failure_result_matrix` |
| Logout/DeviceReset/TransferRights: ACK correcto/rechazado y efectos | 6 | mismo archivo, `nightly_explicit_revocation_and_transfer_matrix` |
| normalizeGrants: fuentes, forma, plazo y recovery | 28 | [Deno: characterization](../../../supabase/functions/billing-webhook/license-access-characterization.test.ts) |
| Estados de suscripción → transición y normalización de filas de fixture | 12 | mismo archivo Deno |

`User` envía LicenseRenew; `Automatic` y `Purchase` envían
LicenseRenewAutomatic. Purchase no tiene un tercer comando ni una nueva regla
en servicios: el Hub actual usa el camino automático al esperar la compra.
AccountProfileRefresh sirve presentación manual y automática con la misma regla
no destructiva. AccountRenew, Logout y DeviceReset son actos explícitos;
TransferRights es el traspaso local durante admisión/recuperación. No inventamos
orígenes IPC para esos comandos. El error remoto se produce por HTTP loopback
real; CoreStep comprueba el orden y la ausencia de Invalidate en el pipe.

Cobertura complementaria ya existente y conservada:

- [runtime rights/tests.rs](../../native/runtime/src/rights/tests.rs): reinicios
  de gracia, firma HTTP→núcleo→consumidores, lápida tras cuarentena, binding
  dañado, E/S real distinta de corrupción, reanclaje durable y límites de skew.
- [services app.rs](../../native/services/src/app.rs): perfil a través de
  host::session tanto durante refresh OAuth como en userinfo, hint huérfano,
  ACK perdido y orden de invalidación antes de limpiar/cerrar sesión.
- [candidate_tests.rs](../../native/services/src/app/candidate_tests.rs):
  dispositivo y cuenta incompatibles, rechazo de disco y procedencia online.

Las filas User que revocan por renovación/refresh llevan «cambia en paso 5»;
recovery solo online lleva «cambia en paso 1»; candidate apartado lleva
«cambia en paso 8». La lápida futura conserva hoy el diagnóstico genérico
(#1822 F2, cambia en paso 7); la marca corrupta sigue bloqueando tras dos
restauraciones (#1822 F4, optimización de Store posterior).
El test Deno conecta las funciones puras reales de transición y normalización,
pero sus filas efectivas son fixtures: no demuestra process.ts, SQL/RLS ni un
despliegue. Los gates SQL/comerciales existentes conservan esa responsabilidad.
La CI `Polar webhook signatures` descubre el archivo dentro de billing-webhook;
no se añade workflow ni se instala Deno en el servidor local.
