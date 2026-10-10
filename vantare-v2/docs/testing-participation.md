# Testing por versión y contribuciones · #1535

Migración preparada: supabase/migrations/20261010000000_testing_participation.sql.
**No aplicada**. El orquestador requiere revisión Sol + Opus antes de producción.
No incluye seeds, correos, nombres, IP, telemetría ni identidad pública.

Catálogo de cuestionarios: UUID, versión, canal, título y una pregunta de
experiencia (escala 1–5, nota opcional). Publicación solo administrativa.
Respuestas privadas por auth.uid() UUID, actualización manual idempotente.
Contribuciones: título/texto y estado recibido/revisión/aceptada/no aceptada;
solo se muestran las propias. Reintento con UUID/payload idénticos no duplica.
Niveles, insignias y leaderboard no se inventan.

RLS forzada; anon sin acceso; authenticated solo lectura de catálogo publicado
y de sus propios datos bajo membership del canal. Sin DML directo. RPCs de
escritura security definer con search_path vacío, identidad derivada del
puente existente, comprobación de membership y catálogo publicado. El lector
usa security invoker. Canal proviene del build services, no del formulario.
Sin confiar en email, metadata ni Clerk sub para elegir cuenta.

Servicios IPC v6: TestingRefresh, TestingAnswer, TestingContribute; DTO sin
tokens ni account_id elegido por Hub. Guardado explícito; no autoenvío.
Una solicitud simultánea se rechaza en UI; errores conservan el texto y permiten
reintentar. Logout/cambio de sesión borra el snapshot y los editores de estas
dos vistas. El envío de bugs conserva la RPC y el flujo de revisión existente.

Catálogo devuelve últimas 10 publicaciones y últimas 20 contribuciones; la UI
informa este alcance, no un total global. Textos/cantidades y marco acotados.
Sin backend/configuración/rol, estado honesto; no rellenar con fixtures reales.

Antes de activar: ejecutar migración y supabase/tests/testing_participation.test.sql
en Supabase local; revisar RLS/identidad en dos cuentas y anon. Aplicación remota
y QA con sesiones reales solo por orquestador tras revisión. Manual: publicar
cuestionario de prueba en entorno local, responder, recargar/reiniciar, comprobar
otra cuenta, revocar membership, repetir contribución y verificar ausencia de
duplicados. Nada de esto acredita producción en el entregable local.
