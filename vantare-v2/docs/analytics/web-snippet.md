# Descarga web · entrega al chat de Marketing

El sitio vive en otro repo: integrar allí en su PR, no desplegado desde #1609.
No cargar PostHog ni crear cookies/localStorage de analítica hasta que el CMP
informe aceptación explícita de **analítica** (casilla apagada, rechazo igualmente
accesible). Revocar llama `setConsent(false)`. Consentimiento web y nativo son
decisiones distintas. El CMP gestiona su propia cookie estrictamente necesaria.

Este snippet sin SDK/autocapture registra solo el clic de descarga, no URL,
referrer, título, email, texto, IP en propiedades ni sesiones grabadas. No pretende
certificar que el archivo se descargó completo. La clave es la pública de captura
del mismo proyecto UE; nunca la personal ni una service role.

```js
// Instanciar sin efectos de red/almacenamiento; conectar al CMP de Marketing.
function vantareDownloads(publicCaptureKey) {
  let consent = false;
  let installationCandidate = null;
  const pending = new Set();
  const storageKey = "vantare-analytics-web-id-v1";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  return {
    setConsent(accepted) {
      consent = accepted === true;
      if (!consent) {
        for (const request of pending) request.abort();
        pending.clear();
        installationCandidate = null;
        // Solo elimina nuestra entrada de analítica, nunca clear() global.
        try { localStorage.removeItem(storageKey); } catch {}
        return;
      }
      try {
        const saved = localStorage.getItem(storageKey);
        installationCandidate = saved && uuid.test(saved) ? saved : crypto.randomUUID();
        localStorage.setItem(storageKey, installationCandidate);
      } catch { installationCandidate = crypto.randomUUID(); }
    },
    async download(platform) {
      if (!consent || !installationCandidate || !publicCaptureKey ||
          !["windows", "linux", "macos"].includes(platform)) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      pending.add(controller);
      try {
        await fetch("https://eu.i.posthog.com/i/v0/e/", {
          method: "POST", credentials: "omit", referrerPolicy: "no-referrer",
          redirect: "error", signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: publicCaptureKey, event: "download_requested",
            distinct_id: installationCandidate,
            properties: { platform, $process_person_profile: false,
              $ip: null, $geoip_disable: true }
          })
        });
      } catch { /* No bloquear la descarga ni reintentar después de revocar. */ }
      finally { clearTimeout(timeout); pending.delete(controller); }
    }
  };
}
```

Conectar `download("windows")` al enlace real sin impedir navegación/descarga.
Pasar el consentimiento actual del CMP, también tras recargar. Si el CMP falla,
el valor queda falso. Política de privacidad: finalidad de uso/embudo, PostHog UE,
UUID pseudónimo, almacenamiento después de aceptar, retirada y canal de borrado;
el responsable fija plazo y condiciones de conservación antes de activar.
Desactivar cualquier otra integración automática de PostHog en el sitio.

QA del PR de Marketing: inspeccionar red y almacenamiento en navegador limpio;
antes de aceptar, rechazo y CMP ausente: cero peticiones/ID de analítica.
Aceptar: solo payload anterior. Revocar: aborta pendientes, elimina su UUID y
clic posterior no envía. Aceptar otra vez: UUID nuevo. Ninguna compra/cuenta real.
Usar endpoint loopback en las pruebas, clave ficticia, nunca PostHog real.

El UUID web **no es** el UUID de instalación. Los paneles separan los recuentos
web y nativos. DUDA: acordar con Marketing y #1591 un puente de atribución
consentido antes de mostrar un porcentaje descarga→instalación. No meter un UUID
en enlaces, nombres del Setup ni comandos sin ese acuerdo.

Referencia oficial consultada: [API PostHog](https://posthog.com/docs/api).
Se usa captura explícita HTTP para evitar propiedades automáticas del SDK.
