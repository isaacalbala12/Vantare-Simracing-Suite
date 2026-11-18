export const workshopText = {
  title: "Taller",
  rail: "Fotograma y escena",
  frameControls: "Cambiar de fotograma",
  frameTitle: "Fotograma",
  leftKey: "←",
  rightKey: "→",
  widget: "Widget",
  scene: "Escena",
  first: "Inicio",
  previous: "Anterior",
  next: "Siguiente",
  retry: "Volver a generar",
  capture: "Hacer la foto",
  testing: "Ir a Testing Center",
  account: "Ver mi cuenta",
  loose: "Foto suelta",
  empty: "Sin escenas",
  opening: "Abriendo Taller…",
  noFrame: "sin fotogramas",
  firstPhoto: "Haciendo la primera foto…",
  firstHelp: "El pintor dibuja el fotograma 1. Puede tardar hasta 15 segundos.",
  pending: "Espera a que llegue la foto (15 s como máximo).",
  pendingHelp:
    "Mientras tanto ves la anterior, atenuada. Puede tardar hasta 15 segundos.",
  onWay: "En camino",
  watching: "Qué mirar",
  noWatch: "Esta foto no trae indicaciones.",
  factory: "La foto usa los ajustes de fábrica del widget.",
  identifier: "Identificador, para avisar de fallos",
  photo: "Foto del pintor",
  previousPhoto: "Foto anterior",
  frame: (n: number, total: number) => `Fotograma ${n} de ${total}`,
  ready: (n: number, total: number, caption?: string) =>
    `Fotograma ${n} de ${total} listo.${caption ? ` ${caption}` : ""}`,
  count: (n: number, one: string, plural: string) =>
    `${n} ${n === 1 ? one : plural}`,
  photoAlt: (widget: string, label: string, n: number, total: number) =>
    `Foto de ${widget}, escena ${label}, fotograma ${n} de ${total}`,
  pendingFrame: (n: number) => `Haciendo la foto del fotograma ${n}…`,
  failedFrame: (n: number) => `No se pudo hacer la foto del fotograma ${n}`,
  busy: "El pintor está ocupado con otra foto",
  busyDetails:
    "Solo hace una foto a la vez y ahora mismo está con otra, por ejemplo la vista previa de Studio. No se vuelve a intentar sola: espera un momento y pulsa «Volver a generar».",
  timeout:
    "El pintor tardó más de 15 segundos y se ha cancelado. No se vuelve a intentar sola.",
  failedDetails: "No se vuelve a intentar sola.",
  noDemo: "Esta escena no tiene ejemplo real",
  noDemoDetails:
    "El pintor no encuentra los datos de ejemplo para dibujarla. No es un fallo tuyo y volver a intentarlo daría lo mismo. Si te pasa en todas las escenas, avísanos desde Testing Center.",
  noScenes: (name: string) => `${name} no tiene escenas de ejemplo`,
  noScenesDetails:
    "El Taller solo enseña las escenas que vienen con Vantare. Hoy todos los widgets traen al menos dos; si ves esto en todos, faltan los archivos de escenas de la instalación.",
  noScenesFrames: "Sin escenas no hay fotogramas que recorrer.",
  noScene: "Sin escena elegida.",
  oneLoose: "Es una foto suelta: solo tiene un fotograma.",
  oneFrame: "Esta escena solo tiene un fotograma.",
  rights: "Tu cuenta no puede hacer fotos en el Taller",
  rightsDetails:
    "Necesitas iniciar sesión con una cuenta verificada que tenga acceso a Overlays Studio. Mientras tanto puedes ver los widgets, sus escenas y qué mirar en cada una.",
  disconnected: "No se pueden hacer fotos ahora",
  disconnectedDetails:
    "Las fotos volverán a estar disponibles cuando se recupere la conexión.",
  noPhotoRights: "Sin acceso a las fotos",
  noPhotoRightsDetails:
    "Cuando entres con una cuenta que tenga acceso, la foto se hará al elegir widget, escena o fotograma.",
  noFrameRights: "Sin acceso a las fotos no se puede cambiar de fotograma.",
  denied: (widget: string) => `${widget} no está incluido en tu plan`,
  deniedDetails:
    "Puedes probar los demás widgets. De este ves sus escenas y qué mirar, pero no su foto.",
  deniedFrames:
    "Sin acceso a la foto de este widget no se puede cambiar de fotograma.",
  tooLarge: "Esta foto es demasiado grande para el Taller",
  tooLargeDetails:
    "Pasa del límite de 512 KB o de 4.096 píxeles por lado, así que no se puede enseñar. Volver a intentarlo daría lo mismo. Avísanos desde Testing Center con el identificador de la escena.",
  live: "Live está en marcha",
  liveDetails:
    "Mientras Live esté activo, el pintor no hace fotos. Puedes elegir widget y escena; cuando pares Live, pulsa «Hacer la foto».",
  liveFrames: "Sin fotos mientras Live está activo.",
  availableAfterLive: "Disponible al parar Live.",
  graphicsDisabled: "Las fotos están desactivadas en este equipo",
  invalidInput: "Esta escena no se pudo leer",
  unavailable: "El pintor no está disponible en este equipo",
  keyHelp: "cambian de fotograma ·",
  firstKeyHelp: "vuelve al 1",
  frameHelp: "Cada fotograma es una foto nueva del pintor. No es un vídeo.",
} as const;
