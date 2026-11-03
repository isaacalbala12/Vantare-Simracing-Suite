# VANTA-131: orden de admisión de informes

Preparación para una activación futura; este PR no aplica SQL ni despliega Edge.

1. Pausar nuevos envíos durante el corte autorizado. Aplicar primero
   `20261103093000_isa_1896_report_admission.sql`: amplía solo el tope IP a
   60 peticiones por día y crea la admisión por cuenta. La Edge antigua sigue
   usando `testing_report_admit` y no depende de la RPC nueva.
2. Desplegar después `testing-report-submit`. La Edge nueva usa
   `testing_report_admit_account`; invertir el orden daría 503 a envíos válidos
   mientras falte esa RPC.
3. Reanudar y verificar con cuentas de prueba distintas tras la autorización
   operativa: 5 peticiones anónimas desde una IP no consumen la cuota de 5
   informes de un tester en esa IP; el intento 61 de la IP se rechaza. Los
   reintentos idénticos no cobran otra cuota de cuenta.

Para revertir, pausar envíos y restaurar **primero** la Edge anterior. Después
ejecutar `20261103093000_isa_1896_report_admission.down.sql` en el entorno
autorizado. El rollback rechaza claves activas y contadores IP mayores de 21;
no se borran para forzarlo. Se espera a que expire la ventana de retención o
se acuerda un plan de conservación de datos antes de reintentar. No se usa
esta secuencia para desplegar desde un agente.
