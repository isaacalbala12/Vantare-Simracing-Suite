# Profiling compartido

Instrumentación local consumida por runtime, ipc, ui y el adapter GPUI Windows.
Sin dependencias; conserva `VANTARE_PROFILE_PHASES`, etapas, relojes y formato
de trazas. No transporta datos por IPC. Las consultas Win32 de reloj/CPU están
limitadas al proceso/hilo propio. No demuestra latencia input → Present.
