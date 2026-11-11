# Onboarding · contrato local (VANTA-138 / #1995)

Preparación 7a: no añade login ni promueve el protocolo. v21 es provisional y
se exportará una sola vez tras confirmar el turno con el orquestador.

El módulo `onboarding` posee get, finish, skipPrivate y prices. Get proyecta
simuladores encontrados por el Reader del Launcher, equipo local, nivel recomendado,
revisiones opacas y existencia del layout. CPU y RAM exacta no viajan a servicios;
la respuesta solo incluye el nombre acotado, núcleos y GiB redondeados para mostrar.
Un dato ausente no cuenta como hardware insuficiente.

Finish recibe el kit cerrado y sin duplicados, nivel, show, `baseRevision` de
hub-settings y `layoutRevision` del layout leído. Las dos revisiones se revalidan.
Primero guarda el kit y el nivel, luego la presentación si hay layout, y solo al
final marca onboarding_completed. Un layout ausente no se crea ni genera una
solicitud de presentación. Una repetición tras completar es Denied. Un conflicto
obliga a releer get antes de reintentar; no se vuelve a enviar automáticamente.
Se preservan los campos desconocidos del documento existente. Los ajustes de una
instancia nueva proceden de widget_defaults::get; no hay otra tabla de defaults.

La finalización exige que ambos permisos estén decididos, sin protección/limpieza
pendiente ni un último guardado de consentimiento fallido. SkipPrivate solo se
acepta tras ese fallo y mientras el asistente esté pendiente. No escribe archivos:
marca la salida durante esta sesión y aplica ambos permisos apagados en memoria.
Las lecturas posteriores conservan esa decisión; al guardar un permiso nuevo no
se reactiva el otro desde un consentimiento antiguo del disco. Al reiniciar, se
vuelve a ofrecer el asistente porque su marca persistente sigue sin completar.

`OnboardingView.privateSession` y pending permiten al dueño de la puerta de Acceso
componer el orden onboarding → privacidad → acceso. La interfaz y los métodos de
login pertenecen al worker A; 7a no los duplica ni intercepta su flujo.

Mail.set añade source cerrado (onboarding/settings) y mantiene la cola existente
Session::request_remote. El proceso principal abre exclusivamente la URL de precios
exportada desde Rust; el renderer nunca envía una URL ni una ruta de guardado.

Las referencias de los ocho pasos (1440×900, dark/light) se obtuvieron del banco
GPUI ya compilado, sin tocar su binario ni su plantilla. Están en la evidencia de
isa-1995-b-onboarding-datos/references y conservan los recibos nativos y del banco.
Las pantallas visuales se entregan después en 7b (0–2) y 7c (3–7), reutilizando las
piezas existentes de Apariencia, Privacidad y Cuenta. Las mejoras de §g no entran.

La fixture `native/hub-host/data/onboarding-presentation.json` está ligada al API
real de `vantare_ui::layout::Presentation::show` mediante un exportador y un test
sin App ni ventana en `native/ui`. El anfitrión compara sus bytes con esa misma
fixture; cubre ausencia del contador y dos incrementos. Esta prueba nueva queda
pendiente de ejecución en la próxima pasada Rust agrupada; no se afirma que ya
se haya ejecutado el exportador de UI en el servidor.
