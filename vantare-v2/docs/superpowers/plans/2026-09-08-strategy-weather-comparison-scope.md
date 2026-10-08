# ISA-1042 — alcance explícito del comparador de clima

Base `686b1c23`, rama `vantareapp/isa-1042-weather-comparison-scope`.
Ejecución personal. Este corte no implementa optimización temporal multiescenario.

- Reproducir comparación con diez vueltas calculadas sin boxes frente a nueve
  del plan normal evaluado: 10 min, 60 s/vuelta, parada de 90 s, tanque 6 L.
- Pasar las vueltas evaluadas de la variante activa al comparador existente;
  retirar el cálculo temporal duplicado con pérdida cero de boxes.
- Contrato explícito `comparisonBasis: fixed_distance`, `comparisonLaps` y aviso
  visible ES/EN/PT/IT: comparación de distancia fija, no predicción de carrera
  cronometrada ni óptimo temporal. No altera la autoridad del plan principal.
- Tests de contrato, panel y aplicación. Archivos previstos: orbit_calculation.go,
  types.go y test; cliente TS/test, WeatherPanel/test, fixture wiring y cuatro locales.
- Build/Go completo/frontend completo/typecheck/lint, revisión, evidencia,
  handoff y roadmap. Comparación temporal avanzada permanece aplazada.
