# ISA-1043 — boxes dentro de una vuelta

Base `1ac45d69`, rama `vantareapp/isa-1043-pit-lap-overlap`, worktree
`C:/tmp/vantare-isa1043`. Saneamiento autorizado; ejecución personal.

1. RED con la reproducción #1038 y fronteras, varias vueltas, dato inválido.
2. Mantener las etiquetas existentes por estado y añadir las transiciones
   dentro de vuelta. Reusar lapIndexAt y firstBoolean, respetando el reloj
   ya normalizado. No cambiar umbrales/MAD/tráfico ni autoridad de datos.
3. Probar exclusión de ritmo y conservación de FamilyPit/ObservedStrategy.
4. Tests del paquete, Go completo, build de assets; revisión personal,
   evidencia, handoff y roadmap/digest. No analizar ni modificar originales.

Archivos productivos previstos: lapvalidity.go y test de regresión específico.
