# 09 · Contenido y voz

## Voz
Directa, técnica y tranquila: habla como un ingeniero de pista que sabe lo que dice y no exagera. Segunda persona ("Abre el Studio", "tu vuelta"). Frases cortas. Nada de marketing dentro de la app.

## Caja de texto
- **Sentence case** en títulos, botones, pestañas, filas y menús ("Próximas carreras", "Abrir overlay").
- **Mayúsculas + tracking** solo en `eyebrow`, `stat-k`, etiquetas de campo, chips de estado/licencia, rótulos del keycap.
- Números con `tabular-nums`; tiempos como `1:44.000` / `2:04.5`; horas `14:00`; cuentas atrás `en 07:32` / `en 1h 05m`; unidades con espacio (`90 L`, `2.75 L/v`, `15 Hz`, `240 min`, `+0.53 s`).
- Puntos medios `·` como separador de metadatos ("3 widgets · 1920 × 1080"); flechas `→` en cadenas y rangos horarios.

## Terminología (glosario)
| Usar | No usar |
|---|---|
| Overlay, widget, perfil (de overlay), lienzo, Studio | HUD, capa, layout (para perfil) |
| Carrera, serie, salida, cadencia, licencia (Bronce/Plata/Oro), seguir serie | evento (salvo especiales), suscribirse |
| Estrategia, evento, stint, parada / boxes, ventana de boxes, ritmo, consumo, depósito, Virtual Energy (VE), set/neumático, esquina (FL/FR/RL/RR), piloto | plan de carrera (como pantalla), pit stop (en copy; "PIT" sí en marcas), rueda |
| Ingeniero de pista, spotter, radio, subtítulos, salidas (audio · visual) | asistente, chat |
| Telemetría, sesión, vuelta analizada, referencia, delta, sector, curva (T7), traza | lap (en copy), replay |
| Launcher, aplicación, perfil de lanzamiento, cadena, paso, espera | script, macro |
| Canal (Stable/Testers/Nightly), actualización, versión | release, build (salvo Nightly) |
| Comando de Vantare (paleta) | command palette |
Anglicismos aceptados por ser del dominio: overlay, widget, stint, spotter, delta, setup, launcher, Studio, Roadmap, Testing Center.

## Patrones de copy
- **Estados vacíos**: qué falta + por qué + acción. "Todavía no tienes planes guardados. Crea el primero o importa un archivo compatible."
- **Honestidad**: "horario de muestra", "datos sintéticos", "próximamente", "no disponible en esta exploración".
- **Bloqueos**: "Requiere el plan Overlays · plan actual Free".
- **Explicaciones** de números: siempre la fórmula en el subtítulo ("20 min ÷ 2:04.5", "10 × 2.10 L").
- **Veredictos**: una frase con la causa: "Estrategia #1 completa 138 vueltas frente a 137: la economía ahorra 1 parada pero pierde 171 s de ritmo, así que no compensa."
- **Toasts**: título breve + una frase de contexto; nunca solo "Hecho".
- **Errores**: qué pasó, qué hacer, dónde mirar ("No se pudo abrir el plan local. Reintenta o revisa Diagnóstico si el problema continúa.").

## i18n
- Todas las cadenas por `frontend/src/i18n` (es, en, pt, it). No se localizan ids, nombres de widget, enums, nombres de series/circuitos ni claves de atajo.
- Prever anchura +30 % en en/pt/it: los rótulos de tabla usan elipsis; los botones no tienen ancho fijo.
- Formatos de fecha/hora con `Intl` en la zona del usuario; la zona se muestra junto al reloj del calendario.
- Plurales: usar la API de plurales del i18n, no concatenar ("1 parada" / "2 paradas").
