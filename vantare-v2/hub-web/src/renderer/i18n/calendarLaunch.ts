import { calendarLaunchLeadMs, type CalendarLaunchStop, type CalendarLaunchUnknown } from "../../contract/generated/calendar";
export const calendarLaunchText = {
  onlyOpen:"Funciona solo mientras el Hub está abierto.",
  ask:"Este perfil puede necesitar tu decisión. Si no respondes, esa petición caduca a los 2 min.",
  armed:(profile:string,time:string)=>`${profile} · lanzamiento programado a las ${time}`,
  automatic:(profile:string)=>`${profile} · lanzamiento automático ${calendarLaunchLeadMs/60000} min antes de tus salidas con aviso`,
  cancel:"Cancelar programación",
  queued:"Enviado al residente; esperando recibo. Aún no está terminado.",
  running:"Secuencia aceptada y en curso.",
  completed:"Secuencia completada.",
  failed:"La secuencia ha fallado.",
  cancelled:"La secuencia se ha cancelado.",
  expiredDecision:"Caducó la petición de decisión (2 min).",
  unknown:"No se puede confirmar el resultado. No se vuelve a enviar automáticamente.",
  noCapability:"El residente no admite lanzamientos comprobados. Actualízalo para programar.",
  noGeneration:"No se puede confirmar la sesión del núcleo.",
  unavailable:"El perfil o el residente no están disponibles para lanzar.",
  live:"No se puede programar mientras estás en pista.",
  tooLate:"Ya pasó la hora de programación; puedes usar Lanzar ahora.",
  stored:"La preferencia está guardada, pero no está armada en esta sesión. Actívala para volver a programar.",
  changed:"El perfil o los avisos han cambiado. Revisa los datos antes de volver a programar.",
  rejected:"No se pudo armar el lanzamiento. Revisa el perfil y la conexión.",
  sentCannotCancel:"Una cadena ya enviada puede continuar; cancelar no la detiene.",
};
export const calendarLaunchStops:Record<CalendarLaunchStop,string>={
  user:"Programación cancelada.",replaced:"La nueva programación ha sustituido a la anterior.",accountChanged:"Programación desarmada: ha cambiado la cuenta.",rightsLost:"Programación desarmada: ya no tienes los derechos necesarios.",live:"Programación desarmada: has entrado en pista.",coreDisconnected:"Programación desarmada: se perdió la conexión con el núcleo.",hubClosed:"Programación desarmada al solicitar el cierre del Hub.",clockChanged:"Programación desarmada: cambió la hora del sistema. Revisa la hora y vuelve a armarla.",residentUnavailable:"Programación desarmada: el residente no está disponible o se ha reiniciado.",revisionChanged:"El perfil cambió desde el armado. No se ha enviado el lanzamiento.",alertsUnavailable:"Programación desarmada: no se pueden leer los avisos.",disabled:"Lanzamiento automático desactivado.",scheduleUnavailable:"El horario o la salida ya no están disponibles.",expired:"La salida ha pasado; no se ha lanzado.",busy:"El residente está ocupado. Esta salida no se vuelve a enviar.",io:"No se pudo preparar el lanzamiento.",
};
export const calendarLaunchUnknowns:Record<CalendarLaunchUnknown,string>={noReceipt:"No llegó el recibo del residente.",ringGap:"Faltan eventos del residente para confirmar el resultado.",residentRestarted:"El residente se ha reiniciado.",residentUnavailable:"El estado del residente dejó de estar disponible.",scopeLost:"Cambió o se perdió la sesión del núcleo.",unconfirmedWrite:"No se pudo confirmar el envío al residente."};
