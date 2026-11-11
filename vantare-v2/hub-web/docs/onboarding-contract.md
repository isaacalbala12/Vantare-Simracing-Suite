# Onboarding · contrato del bloque 7a

VANTA-138 / #1995. El módulo `onboarding` aporta lectura del equipo y simuladores, finalización local, escape privado y apertura de precios. Login pertenece a Acceso; no hay un método de login alternativo.

`layoutReady: false` implica `layoutRevision: null`: diseño ausente, protegido, de versión futura o mayor de 1 MiB. No se resume ni se carga el fichero grande. `finish` exige también `null`, toma el cerrojo del documento y vuelve a comprobar su inutilizabilidad; si ya es válido responde `onboardingConflict` con la vista fresca. En el caso no utilizable completa solamente la marca del asistente: no siembra, reescribe ni pone en cuarentena el diseño. El bloque visual debe explicar que el kit/nivel no se aplicaron y ofrecer prepararlo desde Inicio.

Con diseño válido se comprueba su revisión CAS, se conservan campos desconocidos y ajustes existentes, se guarda una copia `.bak` y se añade cada tipo del kit una sola vez. Después se solicita presentación y finalmente se guarda la marca en ajustes. Un fallo parcial conserva lo publicado, no completa la marca y exige releer antes de reintentar. `show.json` usa el límite de 1 MiB de `ui::Presentation`.

El escape privado es de sesión y solo se habilita tras `privacy.update` con `io`, `protected` o `busy`. Conflicto de revisión y limpieza fallida después de un guardado durable no lo habilitan. Un estado de consentimiento coherente releído retira el fallo anterior. El escape rechaza un documento protegido o cualquier permiso activo en disco: no presenta una revocación ficticia. Si otra instancia activa un permiso se retira la máscara privada y se expone el estado efectivo.

Una actualización desde sesión privada persiste también `crashes=false, crashes_decided=true` y `usage=false, usage_decided=true` para la decisión no editada: no revive permisos antiguos. Los consumidores de diagnósticos siguen leyendo `privacy.json` del disco (`services/src/diagnostics/recorder.rs` y `sender.rs`); no consumen la proyección de este asistente.

`privacy.policy` y `onboarding.prices` comparten una guarda en el proceso principal: una apertura en vuelo y al menos dos segundos entre intentos. Solo se abren las constantes de Rust, con HTTPS y host exacto `vantare.app`; no llegan URLs del renderer ni cambian CSP, preload o `security.ts`.

Los kits Pro conservan el comportamiento de GPUI sin guarda de licencia en el asistente; #2096 sigue la verificación del bloqueo efectivo del overlay sin derecho. No se cambia el núcleo en este bloque.

La GPU está omitida conforme a §c.4 de `07-onboarding.md`, pero el código GPUI `shell/onboarding/view.rs` sí muestra `Equipment::labels()[1]`. Es una contradicción del diseño señalada al orquestador; no se añade una detección nueva sin resolverla.

El número v18 sigue siendo provisional para CI sobre nightly v17. El definitivo se confirmará tras la review antes de un único rebase y regeneración final. `OnboardingView.privateSession` y `pending` permiten al dueño de Acceso ordenar onboarding → privacidad → acceso: salir en privado no equivale a completar ajustes y se vuelve a ofrecer el asistente al reiniciar.

El equipo local no se envía a servicios: CPU acotada y sin controles, núcleos y GiB redondeados. Rust conserva los bytes exactos de RAM para recomendar Ahorro con menos de 8 GiB o cuatro núcleos o menos; un dato ausente no inventa insuficiencia. El descubrimiento reutiliza el Reader de Launcher. `mail.set` conserva el origen cerrado onboarding/settings y la cola `Session::request_remote`.

La fixture `native/hub-host/data/onboarding-presentation.json` sigue ligada al API real de `vantare_ui::layout::Presentation::show` mediante exportador y test de UI sin App ni ventana; el anfitrión compara los mismos bytes sin depender de UI. Las referencias de los ocho pasos permanecen en la evidencia de `isa-1995-b-onboarding-datos/references`, con sus recibos. 7b entrega marco y pasos 0–2; 7c reutilizará Apariencia, Privacidad y Cuenta para 3–7. No se incorporan mejoras de §g.
