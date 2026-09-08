# ISA-1049 — seguimiento y fallo de escritura

C6a del plan #1027. Base C5 9f3c5447 (C2 incluido), nightly d6d0992f;
rama vantareapp/isa-1049-calendar-follow-persistence. Sin integrar candidatos.

Follow/Unfollow de eventos y series cambiaban memoria antes de guardar. Si la
escritura fallaba, un reintento se convertía en no-op y no guardaba la preferencia.
Las cuatro rutas restauran el estado anterior, incluido Updated, bajo el mismo
mutex. Copia superficial suficiente: solo cambian slice cabecera y timestamp;
append no modifica los elementos anteriores y unfollow crea una nueva slice.
No clona miles de eventos ni introduce otra capa de persistencia.

RED: cuatro casos, memoria incoherente y reintento no persistido. GREEN módulo
Calendar completo. Fallo real de I/O con un archivo como directorio padre en
TempDir; publicación bundled real a fecha histórica; archivo anterior intacto,
reintento exitoso y recarga desde disco. No son datos runtime ni prueba Wails.

Archivos: calendar_service.go, follow_persistence_test.go, este informe, handoff,
plan/roadmap generado. Sin UI/HUD/Studio ni dependencias. Build frontend para embed, go test ./..., roadmap 23+21 y diff PASS.
Review ACCEPT e9dc8ef9. No se repiten tests/lint de frontend: no hay cambios TS/CSS. C6b confirmación UI/permisos, C9 y Wails/rendimiento
continúan pendientes. Verificación manual futura: simular error de guardado en
perfil de prueba y reintentar seguir/dejar de seguir; reiniciar y comprobar estado.
Sin merge, promoción o release.
