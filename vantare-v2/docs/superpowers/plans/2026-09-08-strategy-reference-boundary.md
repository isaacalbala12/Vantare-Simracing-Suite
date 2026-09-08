# ISA-445 — referencias en la frontera de producción

Base `b1211c99`, rama `vantareapp/isa-445-reference-boundary`, ejecución personal.

1. Extraer opciones actuales de composición para probarlas; RED: un arranque
   normal acepta fixture TEST y una caché TEST válida en su ventana temporal.
2. Retirar fixture y clave TEST de composición. Catálogo vacío sin una confianza
   de producción aprobada; no borrar caché ni publicar/firmar nada.
3. RED/GREEN de compatibilidad: combinación canónica presente e idéntica antes
   de guardar perfil/variante. La estrategia debe pertenecer a esa combinación.
   Panel muestra solo referencias de la combinación elegida. No cotejar nombres.
4. Go completo, frontend focal/completo, build/typecheck/lint, diff personal,
   evidencia, handoff y roadmap/digest. No certificar condiciones de evento que
   el payload todavía no representa ni presentar referencia como óptimo.

Archivos: main.go + test de composición, comentario de fixture en consumer.go;
strategy-reference-catalog.ts y test, StrategyReferencePanel.tsx y test.
Sin dependencias, schema, nuevo catálogo, claves o red habilitada por este corte.
