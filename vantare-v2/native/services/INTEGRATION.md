# Integración pendiente — #1430

Este worker no tiene ownership de runtime/núcleo/IPC/manifests/packaging. Esta
lista es un contrato para Opus, no evidencia de enforcement en esos procesos.
No recuperar el stash anterior para resolver el wiring.

1. Incorporar el miembro `services` al workspace y empaquetar su exe junto al
   Hub. El crate aislado permite verificarlo antes. El núcleo consume la misma
   biblioteca con `default-features = false`: sin ureq, url, IPC ni GPUI.
   Verificar `cargo tree` del target core: Cargo puede unificar features si se
   compila services/network y core juntos en el workspace. Construir el core
   por target separado; si el pipeline exige unión, extraer verificador/Store a
   un paquete puro antes de integrar. El test sin red actual demuestra el perfil
   aislado, no ese futuro grafo del workspace ni el binario core.
2. El build propietario debe proveer el cliente público OAuth Clerk (issuer,
   client ID, redirect registrado de loopback). `BuildConfig::native_oauth`
   permanece `None`: no existe aún contrato de variables del build para ello.
   Publishable key del SDK no es client ID. No Supabase Auth como fallback.
3. Acordar/desplegar la API fina. `bridge::Config::authorize` modela un puente
   explícito, aún no existente: recibe OAuth, valida issuer/audience/scopes con
   Clerk, resuelve `(iss,sub)` a UUID interno (#909), entrega una sesión de datos
   como máximo cinco minutos con rol authenticated/RLS por ese UUID. Nunca
   service_role, claim editable del cliente ni OAuth reenviado a TPA. El backend
   firma/mapea; desktop no puede mintar este token. Alternativa preferible cuando
   la API esté lista: resolver los recursos allí y retirar el intercambio de
   bearer de datos. #1173/#1187 están abiertos; no presumir despliegue.
4. Núcleo inicia su plano de control sin simulador. Posee Store/contexto separado
   para binding admitido, credencial raw, reloj, sesión de juego y invalidación.
   Recibe solo bytes firmados/contexto; `Verifier` reconstruye v1 como Go o
   verifica JWS v2 sobre bytes compactos. No acepta online_capabilities ni bools
   `is_pro` del Hub. Subject esperado procede del binding validado del servidor,
   nunca de email, metadata o convertir `user_...` a UUID.
5. Al admitir credencial: verificar -> `Authority::install` -> persistir raw y
   estado -> publicar. Publicar únicamente tras `rights_and_persist`; error de
   firma/contexto/reloj/disco significa derechos vacíos y error tipado. Snapshot
   a overlays/Engineer incluye versión, época, revisión, origen núcleo y siguiente
   vencimiento. Consumidores rechazan versión/época/revisión antiguas y no hacen
   red. Añadir peer/nonce/ACL al canal de control con el transporte existente.
6. Entrada/salida de juego viene de hechos del núcleo. `enter_game` registra qué
   grants eran válidos a la entrada, y se persiste antes de publicar. Margen
   termina en expiry firmado + una hora, nunca reconnect + una hora. Reinicio
   restaura el registro pero exige confirmar la misma sesión real desde núcleo;
   no basta un ID enviado por Hub. `leave_game` elimina la excepción. Sin juego
   o con grant ya vencido a la entrada: sin gracia. Persistir salidas también.
7. Logout/reset/cambio de cuenta: núcleo invalida y persiste antes de ACK; luego
   servicios limpia sesión/candidate y efectúa reset remoto manual. No mostrar
   éxito de revocación antes del ACK. `invalidate` impide reactivar la credencial
   anterior tras reinicio: se necesita emisión nueva posterior. El host actual
   rechaza renovación/reset con «puente no configurado» mientras falta este
   canal. `license_remote` prueba cliente legacy/firmas, no activa recursos.

JWS v2 es un contrato propuesto: `alg=Ed25519`, `typ=vantare-license+jwt`, kid
de trust roots compiladas, claims version=2, iss=vantare-license,
aud=vantare-native, sub=UUID interno, device_key_id=thumbprint RFC7638 OKP,
iat/exp Unix y capabilities v1. Exp del envelope limita todos los grants.
Revisar este esquema con backend antes de emitirlo; no se autonegocia algoritmo
ni claves de un JWKS remoto. v1 conserva edición perpetua compatible.

Instalación posee key DPAPI y prueba solo dominio enrollment. Core fija key ID
admitido por servidor; v1 usa SHA256 MachineGuid sin fallback a home. Fingerprint
no es atestación. El worker no lee valores de registry ni usa claves reales en
tests. DPAPI/ACL protegen entre usuarios, no contra admin/malware del mismo SID;
restauración de toda una copia antigua del perfil no tiene antirreplay hardware.

Prueba pendiente tras wiring: core/overlays/Engineer reales, Hub cerrado, caducar
durante juego a T+3599 y T+3600, parar juego, reconnect/restart, logout/reset,
rollback/disco lleno e IPC falsificado. Los tests actuales prueban política,
criptografía, DPAPI y HTTP/process local; no sustituyen esa aceptación.

## Testing Center / Hub

El Hub edita texto y presenta revisión; el helper es el único escritor DPAPI del
borrador y del intento. Esa adaptación evita introducir otra dependencia Win32
en GPUI. Son namespaces separados de sesión/roadmap, por proyecto/canal. No se
reutiliza ni modifica el borrador Go. Abrir/cargar/restaurar nunca envía ni concede
consentimiento; solo `ReportSend` con ID de revisión vigente tras el botón de
consentimiento. El RPC exacto del producto es `testing_center_submit_report`.
Clerk OAuth no puede llamarlo directamente: falta el puente y su migración RLS.

`App::configure_bridge` es un hook exclusivo del owner del build (no IPC ni
config editable en UI). Cuentas/licencias/reportes remotos siguen inertes por
defecto. Borradores locales sí funcionan sin configuración. Probar después el
contrato de intercambio del punto 3; si backend elige API que devuelve recursos
directamente, cambiar este adaptador explícito antes de habilitar el build.

Input del Launcher es privado y pertenece a otro worker. Testing usa temporalmente
esa misma fuente con allow `duplicate_mod` solo en ese `mod`, explicado allí;
no copia implementación ni modifica Launcher/widgets. Opus debe cambiar
`launcher::input` a `pub(crate)` y sustituir el `mod` de testing por `use`; retirar
el allow. No hay suppressions globales ni flags laxos del gate.

Límites deliberados: campos UI de una línea (el Input compartido actual), solo
texto, un intento pendiente por proyecto/canal que debe resolverse con su cuenta
original antes de otro; no cola, adjuntos ni agente automático. Edición rota key,
invalida revisión, y las respuestas I/O no pisan texto cambiado mientras estaban
en vuelo. Reintentar muestra los bytes originales incluso si el editor cambió.
Recibo se persiste antes de limpiar borrador; fallo de limpieza no es fallo de
envío. El consentimiento no se guarda, caduca en tres minutos y queda ligado a
la instancia/renovación de sesión (época aleatoria 128 bits) y cuenta/canal.

Helper tiene deadline de cinco minutos para IPC inactivo mientras Hub permanece
abierto; no polling HTTP, residencia en juego ni autoconfirmación tras reinicio.
Hub EOF/cancelación cierra el host. Evaluar ese deadline y presupuesto con Isaac
en runtime real; una caída durante POST queda como intento incierto durable.
