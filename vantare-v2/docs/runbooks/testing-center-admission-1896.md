# VANTA-131: orden de admisión de informes

Preparación para una activación futura; este PR no aplica SQL ni despliega Edge.

1. Pausar nuevos envíos durante el corte autorizado. Aplicar primero
   `20261103093000_isa_1896_report_admission.sql`: amplía el tope IP a
   60 peticiones fallidas por día y crea la admisión por cuenta. La Edge antigua sigue
   usando `testing_report_admit` y no depende de la RPC nueva.
2. Desplegar después `testing-report-submit`. La Edge nueva usa
   `testing_report_admit_account`; invertir el orden daría 503 a envíos válidos
   mientras falte esa RPC.
3. Reanudar y verificar con cuentas de prueba distintas tras la autorización
   operativa: 61 peticiones sin bearer desde una IP no impiden el informe de
   un tester autenticado en esa IP. Solo los fallos de autenticación consumen
   el tope IP; el intento fallido 61 se rechaza. Los reintentos idénticos no
   cobran otra cuota de cuenta.

La firma ES256 del bearer y sus claims se verifican localmente, antes de
consultar Clerk y resolver la cuenta en Supabase. Un bearer ausente o inválido
se rechaza sin esas llamadas externas y carga solo el tope IP. Una cuenta
verificada no consulta ni consume el contador IP.

Para revertir, pausar envíos y restaurar **primero** la Edge anterior. Después
ejecutar `20261103093000_isa_1896_report_admission.down.sql` en el entorno
autorizado. El rollback recorta cada contador IP a 21 y descarta las claves
de exención de reintentos; no borra informes ni contadores de cuenta. El
comportamiento de cuotas vuelve al de la Edge y SQL anteriores. No se usa
esta secuencia para desplegar desde un agente.
