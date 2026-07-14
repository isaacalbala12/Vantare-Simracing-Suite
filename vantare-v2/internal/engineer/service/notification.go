package service

type EngineerNotification struct {
	ID        string `json:"id"`
	Category  string `json:"category"`
	Severity  string `json:"severity"`
	TextKey   string `json:"textKey"`
	Text      string `json:"text"`
	Priority  int    `json:"priority"`
	CreatedAt int64  `json:"createdAt"`
	ExpiresAt int64  `json:"expiresAt,omitempty"`
	Source    string `json:"source"`
}

type EngineerStatus struct {
	Enabled        bool                   `json:"enabled"`
	Connected      bool                   `json:"connected"`
	Source         string                 `json:"source"`
	SpotterEnabled bool                   `json:"spotterEnabled"`
	Sensitivity    string                 `json:"sensitivity"`
	TTSCacheCount  int                    `json:"ttsCacheCount"`
	RecentMessages []EngineerNotification `json:"recentMessages"`
	LastError      string                 `json:"lastError,omitempty"`
}

// Translations holds localized spotter phrases in Spanish.
// Includes entries for engine, tyre, and opponents monitors so the
// frontend displays human-readable text instead of raw text keys.
var Translations = map[string]string{
	"spotter.car_left":    "Coche a la izquierda",
	"spotter.car_right":   "Coche a la derecha",
	"spotter.still_there": "Sigue ahí",
	"spotter.clear_left":  "Libre izquierda",
	"spotter.clear_right": "Libre derecha",
	"spotter.all_clear":   "Libre",
	"spotter.three_wide":  "Tres en paralelo",

	// Engine monitor (CrewChief parity).
	"engine.water_temp_high":      "Temperatura del agua alta",
	"engine.water_temp_critical":  "Temperatura del agua crítica",
	"engine.water_temp_all_clear": "Temperatura del agua normalizada",
	"engine.oil_temp_high":        "Temperatura del aceite alta",
	"engine.oil_temp_critical":    "Temperatura del aceite crítica",
	"engine.oil_temp_all_clear":   "Temperatura del aceite normalizada",
	"engine.stalled":              "Motor calado",
	"engine.oil_pressure_low":     "Presión de aceite baja",
	"engine.fuel_pressure_low":    "Presión de combustible baja",

	// Tyre monitor (CrewChief parity).
	"tyre.temp_high":        "Neumáticos calientes",
	"tyre.temp_optimal":     "Neumáticos en ventana óptima",
	"tyre.temp_overheating": "Neumáticos sobrecalentados",
	"tyre.wear_high":        "Neumáticos muy gastados",
	"tyre.wear_minor":       "Neumáticos empezando a desgastarse",

	// Opponents monitor.
	"opponents.pitted":            "Rival entró a boxes",
	"opponents.best_lap":          "Rival marca vuelta rápida",
	"opponents.class_different":   "Rival de otra clase",
	"opponents.leader_pitted":     "El líder entró a boxes",
	"opponents.car_ahead_pitted":  "El rival de delante entró a boxes",
	"opponents.car_behind_pitted": "El rival de detrás entró a boxes",
	"opponents.lead_changed":      "Ahora lideras la carrera",
	"opponents.retired":           "Rival abandonó la carrera",
	"opponents.disqualified":      "Rival descalificado",
	"opponents.driver_swapped":    "Posible cambio de piloto en rival",

	// Multiclass monitor (full CC parity).
	"multiclass.faster_behind":              "Un coche más rápido se acerca por detrás",
	"multiclass.faster_behind_fighting":     "Coches más rápidos luchando por posición detrás",
	"multiclass.faster_behind_class_leader": "El líder de la clase más rápida está detrás",
	"multiclass.faster_cars_behind":         "Varios coches más rápidos se acercan por detrás",
	"multiclass.slower_ahead":               "Un coche más lento adelante",
	"multiclass.slower_ahead_fighting":      "Coches más lentos luchando por posición adelante",
	"multiclass.slower_ahead_class_leader":  "El líder de la clase más lenta está adelante",
	"multiclass.slower_cars_ahead":          "Varios coches más lentos adelante",
	"multiclass.caught_by_faster_cars":      "Te están alcanzando los coches más rápidos",
	"multiclass.catching_slower_cars":       "Estás alcanzando a los coches más lentos",

	// Flags monitor.
	"flags.fcy_started":             "Bandera amarilla en toda la pista",
	"flags.fcy_ended":               "Bandera verde, pista libre",
	"flags.blue_flag":               "Bandera azul, deja pasar",
	"flags.yellow_flag":             "Bandera amarilla en este sector",
	"flags.double_yellow_flag":      "Doble bandera amarilla",
	"flags.white_flag":              "Bandera blanca, vehículo lento adelante",
	"flags.black_flag":              "Bandera negra, vuelve a boxes",
	"flags.yellow_sector_1":         "Amarillo en sector 1",
	"flags.yellow_sector_2":         "Amarillo en sector 2",
	"flags.yellow_sector_3":         "Amarillo en sector 3",
	"flags.yellow_sector_all_clear": "Todos los sectores en verde",

	// Fuel monitor.
	"fuel.low_half_tank":    "Medio depósito",
	"fuel.low_2l":           "Quedan 2 litros",
	"fuel.low_1l":           "Queda 1 litro",
	"fuel.laps_remaining_4": "Quedan 4 vueltas de combustible",
	"fuel.laps_remaining_3": "Quedan 3 vueltas de combustible",
	"fuel.laps_remaining_2": "Quedan 2 vueltas de combustible",
	"fuel.laps_remaining_1": "Queda 1 vuelta de combustible",
	"fuel.for_pit_now":      "Combustible justo, entra a boxes",

	// Penalties monitor.
	"penalties.new_drivethrough": "Drive-through penalty",
	"penalties.new_stopgo":       "Stop & Go penalty",
	"penalties.penalty_served":   "Penalización cumplida",

	// Laps monitor.
	"laps.lap_completed":    "Vuelta completada",
	"laps.fastest_lap":      "Vuelta rápida",
	"laps.last_lap":         "Última vuelta",
	"laps.last_lap_leader":  "Última vuelta, lideras la carrera",
	"laps.last_lap_top3":    "Última vuelta, estás en el podio",
	"laps.two_to_go":        "Dos vueltas para el final",
	"laps.two_to_go_leader": "Dos vueltas, lideras la carrera",
	"laps.two_to_go_top3":   "Dos vueltas, estás en el podio",
	"laps.consistent":       "Ritmo consistente",
	"laps.improving":        "Mejorando ritmo",
	"laps.worsening":        "Perdiendo ritmo",

	// Position monitor.
	"position.gained":                 "Posición ganada",
	"position.lost":                   "Posición perdida",
	"position.start_terrible":         "Salida muy mala",
	"position.start_bad":              "Salida mala",
	"position.start_good":             "Buena salida",
	"position.start_ok":               "Salida aceptable",
	"position.overtake_completed":     "Adelantamiento completado",
	"position.overtake_lost":          "Te han adelantado",
	"position.last_place_many_laps":   "Llevas varias vueltas en última posición",
	"position.give_position_back":     "Devuelve la posición",
	"position.give_position_back_now": "Devuelve la posición ahora",

	// Push monitor.
	"push.push_now":              "Empujar ahora",
	"push.push_to_improve":       "Empuja para mejorar posición",
	"push.push_to_get_win":       "Empuja para ganar la carrera",
	"push.push_to_get_second":    "Empuja para el segundo puesto",
	"push.push_to_get_third":     "Empuja para el podio",
	"push.push_to_hold_position": "Mantén la posición",

	// RaceTime monitor.
	"racetime.20min_remaining": "Quedan 20 minutos",
	"racetime.15min_remaining": "Quedan 15 minutos",
	"racetime.10min_remaining": "Quedan 10 minutos",
	"racetime.5min_remaining":  "Quedan 5 minutos",
	"racetime.2min_remaining":  "Quedan 2 minutos",
	"racetime.0min_remaining":  "Tiempo cumplido",
	"racetime.halfway":         "Mitad de carrera",
	"racetime.pearls_disable":  "Perlas de sabiduría desactivadas",
	"racetime.pre_race_2min":   "2 minutos para la salida",
	"racetime.pre_race_1min":   "1 minuto para la salida",
	"racetime.pre_race_30s":    "30 segundos para la salida",

	// SessionEnd monitor.
	"session.ended":         "Sesión terminada",
	"session.won":           "¡Victoria!",
	"session.podium":        "¡En el podio!",
	"session.finished":      "Has terminado",
	"session.good_finish":   "Buen resultado",
	"session.finished_last": "Último puesto",
	"session.dnf":           "No has terminado",
	"session.disqualified":  "Descalificado",
	"session.pole":          "Pole position",
	"session.ended_qual":    "Sesión de clasificación terminada",

	// Timings monitor.
	"timings.gap_report":      "Informe de diferencias",
	"timings.gap_report_freq": "Frecuencia de informes actualizada",

	// Pearls monitor.
	"pearls.pearl": "Perla de sabiduría",

	// WatchedOpponents monitor.
	"watched.new_opponent":   "Nuevo rival vigilado",
	"watched.opponent_gone":  "Rival vigilado fuera de rango",
	"watched.gap_increasing": "La distancia con el rival vigilado aumenta",
	"watched.gap_decreasing": "La distancia con el rival vigilado disminuye",

	// PitStops monitor.
	"pitstops.entry":              "Entrando en boxes",
	"pitstops.exit":               "Saliendo de boxes",
	"pitstops.engage_limiter":     "Activa el limitador de velocidad",
	"pitstops.disengage_limiter":  "Desactiva el limitador de velocidad",
	"pitstops.watch_your_speed":   "Atención, velocidad en boxes",
	"pitstops.one_hundred_metres": "100 metros para la entrada de boxes",
	"pitstops.fifty_metres":       "50 metros para la entrada de boxes",
	"pitstops.box_now":            "Entra a boxes ahora",
	"pitstops.pit_window_open":    "Ventana de boxes abierta",
	"pitstops.pit_window_close":   "Ventana de boxes cerrando",
	"pitstops.window_opens_in_5":  "Ventana de boxes abre en 5 vueltas",
	"pitstops.window_opens_in_3":  "Ventana de boxes abre en 3 vueltas",
	"pitstops.window_opens_in_1":  "Ventana de boxes abre en 1 vuelta",
	"pitstops.window_closes_in_3": "Ventana de boxes cierra en 3 vueltas",
	"pitstops.window_closes_in_1": "Ventana de boxes cierra en 1 vuelta",

	// Strategy monitor (G2.10).
	"strategy.sector_fuel_low": "Combustible insuficiente para el ritmo de este sector",
	"strategy.fuel_ok":         "Combustible suficiente",

	// DriverSwaps monitor (G2.12).
	"driverswaps.stint_halfway":     "Mitad del relevo",
	"driverswaps.stint_long":        "Relevo largo",
	"driverswaps.stint_will_exceed": "El relevo excederá el límite",
	"fuel.half_time":                "Mitad de combustible",
	"fuel.minutes_10":               "Quedan 10 minutos de combustible",
	"fuel.minutes_5":                "Quedan 5 minutos de combustible",
	"racetime.1min_remaining":       "Queda 1 minuto",
	"racetime.30s_remaining":        "Quedan 30 segundos",
	"flags.get_ready":               "Preparate",
	"flags.green_flag":              "Bandera verde",
	"laps.formation_lap":            "Vuelta de formacion",
	"position.formation":            "Vuelta de formacion",
	"opponents.exited_pits":         "Rival saliendo de boxes",
	"push.qual_exit":                "Saliendo de boxes en clasificacion",
	"push.corner_attack":            "Ataca en la proxima curva",
	"push.corner_defend":            "Defiende en la proxima curva",
	"timings.being_held_up":         "Detenido por coche lento",
	"timings.being_pressured":       "Presionado por detras",
	"pitstops.exit_traffic_clear":   "Salida de boxes limpia",
	"pitstops.exit_traffic_behind":  "Trafico cerca al salir",
	"strategy.pit_position_gain":    "Ganaras posiciones en boxes",
	"strategy.pit_position_loss":    "Perderas posiciones en boxes",

	// Damage monitor (G1.3).
	"damage.aero_minor":        "Daño aerodinámico menor",
	"damage.aero_severe":       "Daño aerodinámico severo",
	"damage.suspension_minor":  "Daño en suspensión menor",
	"damage.suspension_severe": "Daño en suspensión severo",
	"damage.engine_minor":      "Daño en motor menor",
	"damage.engine_severe":     "Daño en motor severo",
	"damage.component_busted":  "Componente destruido",
	"damage.detached_part":     "Parte desprendida del coche",

	// Conditions monitor (G1.4).
	"conditions.rain_started":    "Ha empezado a llover",
	"conditions.rain_stopped":    "Ha dejado de llover",
	"conditions.track_temp_high": "Temperatura de pista muy alta",
	"conditions.track_freezing":  "Pista helada, cuidado",
}

// Translate translates a text key to Spanish. If the key is not found, it returns the key itself.
func Translate(key string) string {
	if val, ok := Translations[key]; ok {
		return val
	}
	return key
}
