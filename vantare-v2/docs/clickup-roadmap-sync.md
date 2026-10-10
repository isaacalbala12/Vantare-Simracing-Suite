# ClickUp → roadmap público

Procedimiento vigente: [mantenimiento del roadmap](roadmap-maintenance.md), #1535.
La Action publica el artefacto; Hub, web y digest solo lo leen.

scripts/clickup-roadmap.py conserva el parser y pruebas de la herramienta manual
anterior. Su vía SQL es histórica: no usar --publish ni mantener una segunda
publicación Supabase. publish_clickup_roadmap.py reutiliza su validación y lista
de campos públicos; añade solo fechas/etiquetas explícitas y no escribe remoto.
El workflow invoca únicamente visual_roadmap_sync en Supabase existente,
con rol SQL dedicado. Nada se aplica/configura sin revisión Sol+Opus.

Referencia primaria: [Get Tasks](https://developer.clickup.com/reference/gettasks).
