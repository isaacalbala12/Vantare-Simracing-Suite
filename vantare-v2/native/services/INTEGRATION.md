# Integración pendiente — #1430

Este worker no tiene ownership de runtime/núcleo/IPC/manifests/packaging. Esta
lista es un contrato para Opus, no evidencia de enforcement en esos procesos.
No recuperar el stash anterior para resolver el wiring.

1. Incorporar el miembro `services` al workspace y empaquetar su exe junto al
   Hub. El crate aislado permite verificarlo antes. El núcleo consume la misma
   biblioteca con `default-features = false`: sin ureq, url, IPC ni GPUI.
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
