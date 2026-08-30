// Package performance resuelve la politica de rendimiento efectiva de la app.
package performance

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/projection/overlayv2"
)

// Level identifica uno de los cinco presupuestos nominales de rendimiento.
type Level int

const (
	LevelMaximum  Level = 1
	LevelHigh     Level = 2
	LevelBalanced Level = 3
	LevelSaving   Level = 4
	LevelMinimum  Level = 5
)

// Mode identifica quien eligio el presupuesto efectivo.
type Mode string

const (
	ModeLevel  Mode = "level"
	ModeCustom Mode = "custom"
	ModeAuto   Mode = "auto"
)

// Effects identifica el presupuesto visual que debe obedecer la web.
type Effects string

const (
	EffectsFull   Effects = "full"
	EffectsNoBlur Effects = "noBlur"
	EffectsFlat   Effects = "flat"
)

const DiagnosticEffectsVariantUnavailable = "variante no disponible"

// Reason explica por qué se eligió la política efectiva. Es vocabulario de
// contrato, no texto de interfaz.
type Reason string

const (
	ReasonCPU         Reason = "cpu"
	ReasonFrameTime   Reason = "frametime"
	ReasonUser        Reason = "user"
	ReasonVR          Reason = "vr"
	ReasonUnavailable Reason = "unavailable"
)

// WidgetRate es un techo numerico o una politica dirigida por cambios/eventos.
// El valor cero representa la tasa del monitor y se publica como null.
type WidgetRate struct {
	hz     int
	signal string
}

func Hertz(value int) WidgetRate           { return WidgetRate{hz: value} }
func Dirty() WidgetRate                    { return WidgetRate{signal: "dirty"} }
func Event() WidgetRate                    { return WidgetRate{signal: "event"} }
func Monitor() WidgetRate                  { return WidgetRate{} }
func (rate WidgetRate) Hertz() (int, bool) { return rate.hz, rate.hz > 0 && rate.signal == "" }
func (rate WidgetRate) Signal() string     { return rate.signal }
func (rate WidgetRate) IsMonitor() bool    { return rate.hz == 0 && rate.signal == "" }

// MarshalJSON conserva el contrato number | "dirty" | "event" | null.
func (rate WidgetRate) MarshalJSON() ([]byte, error) {
	switch {
	case rate.signal == "dirty" || rate.signal == "event":
		return json.Marshal(rate.signal)
	case rate.hz > 0:
		return json.Marshal(rate.hz)
	case rate.IsMonitor():
		return []byte("null"), nil
	default:
		return nil, fmt.Errorf("widget rate invalido: hz=%d signal=%q", rate.hz, rate.signal)
	}
}

// Policy es la unica decision que consumen el scheduler y el frontend.
type Policy struct {
	Level         Level                 `json:"level"`
	Mode          Mode                  `json:"mode"`
	Effects       Effects               `json:"effects"`
	RafCap        *int                  `json:"rafCap"`
	WidgetHz      map[string]WidgetRate `json:"widgetHz"`
	WidgetEffects map[string]Effects    `json:"-"`
	SourceHz      float64               `json:"sourceHz"`
	Reason        Reason                `json:"reason,omitempty"`
}

// Resolve aplica primero el override de perfil cuando existe y normaliza el
// resultado. En automático el nivel y la razón proceden del controlador Go.
func Resolve(appDefault Policy, profileOverride *Policy) Policy {
	requested := appDefault
	if profileOverride != nil && profileOverride.Mode != "" {
		requested = *profileOverride
	}

	if requested.Mode == ModeAuto {
		if requested.Level < LevelHigh || requested.Level > LevelMinimum {
			requested.Level = LevelBalanced
		}
	} else if requested.Mode != ModeCustom {
		requested.Mode = ModeLevel
	}
	if requested.Reason != "" && !requested.Reason.valid() {
		requested.Reason = ReasonUnavailable
	}
	if !requested.Level.valid() {
		requested.Level = LevelBalanced
	}

	base := policyForLevel(requested.Level)
	base.Mode = requested.Mode
	base.SourceHz = requested.SourceHz
	base.Reason = requested.Reason
	if requested.Mode == ModeCustom || requested.Mode == ModeAuto {
		if requested.Effects != "" {
			base.Effects = requested.Effects
		}
		if requested.RafCap != nil {
			base.RafCap = intPointer(*requested.RafCap)
		}
		if requested.WidgetHz != nil {
			base.WidgetHz = cloneWidgetRates(requested.WidgetHz)
		}
		if requested.WidgetEffects != nil {
			base.WidgetEffects = cloneWidgetEffects(requested.WidgetEffects)
		}
	}
	if base.Level >= LevelBalanced {
		// D9: Endurance todavía no dispone de las variantes diseñadas. Publicar
		// otro valor prometería un efecto visual que el renderer no puede aplicar.
		base.Effects = EffectsFull
	}
	return base
}

// ResolveAuto convierte una decisión del sensor en la política efectiva sin
// permitir que el llamador publique el nivel 1, reservado al modo manual.
func ResolveAuto(level Level, reason Reason) Policy {
	return Resolve(Policy{Mode: ModeAuto, Level: level, Reason: reason}, nil)
}

// ResolveAutoRequested mueve el nivel automático sin perder los overrides
// explícitos de una política custom solicitada por el perfil.
func ResolveAutoRequested(requested Policy, level Level, reason Reason) Policy {
	automatic := ResolveAuto(level, reason)
	requested = Resolve(requested, nil)
	if requested.Mode != ModeCustom && requested.Mode != ModeAuto {
		return automatic
	}
	baseline := policyForLevel(requested.Level)
	for widget, rate := range requested.WidgetHz {
		if baseRate, ok := baseline.WidgetHz[widget]; !ok || rate != baseRate {
			automatic.WidgetHz[widget] = rate
		}
	}
	if requested.WidgetEffects != nil {
		automatic.WidgetEffects = cloneWidgetEffects(requested.WidgetEffects)
	}
	if !sameOptionalInt(requested.RafCap, baseline.RafCap) {
		automatic.RafCap = cloneOptionalInt(requested.RafCap)
	}
	if requested.Effects != baseline.Effects {
		automatic.Effects = requested.Effects
	}
	return automatic
}

// CadenceFor escala los tres tiers existentes y mantiene el techo de rancio
// en un segundo. Los niveles 1 y 2 son paridad exacta con la cadencia actual.
func CadenceFor(level Level) overlayv2.SectionCadence {
	base := overlayv2.DefaultSectionCadence()
	switch level {
	case LevelBalanced:
		return scaledCadence(base, 3, 2)
	case LevelSaving:
		return scaledCadence(base, 2, 1)
	case LevelMinimum:
		return scaledCadence(base, 3, 1)
	default:
		return base
	}
}

func scaledCadence(base overlayv2.SectionCadence, numerator, denominator int64) overlayv2.SectionCadence {
	scale := func(value time.Duration) time.Duration {
		return time.Duration(int64(value) * numerator / denominator)
	}
	return overlayv2.SectionCadence{
		Fast:         scale(base.Fast),
		Mid:          scale(base.Mid),
		Slow:         scale(base.Slow),
		Spotter:      base.Spotter,
		Session:      base.Session,
		DirtyCeiling: base.DirtyCeiling,
	}
}

// WidgetHzFor devuelve la tabla cerrada de la spec, indexada por widgetType.
func WidgetHzFor(level Level) map[string]WidgetRate {
	column := map[Level][]WidgetRate{
		LevelMaximum:  {Monitor(), Monitor(), Monitor(), Monitor(), Hertz(60), Hertz(60), Hertz(60), Hertz(60), Hertz(30), Hertz(30), Hertz(30), Hertz(20), Hertz(10), Hertz(5), Hertz(2), Hertz(5), Hertz(5), Hertz(1), Event(), Event()},
		LevelHigh:     {Hertz(60), Hertz(60), Hertz(60), Hertz(60), Hertz(30), Hertz(30), Hertz(30), Hertz(30), Hertz(20), Hertz(20), Hertz(20), Hertz(10), Hertz(5), Hertz(2), Hertz(1), Hertz(2), Hertz(2), Hertz(1), Event(), Event()},
		LevelBalanced: {Hertz(40), Hertz(40), Hertz(40), Hertz(40), Hertz(20), Hertz(20), Hertz(20), Hertz(20), Hertz(15), Hertz(15), Hertz(15), Hertz(5), Hertz(4), Hertz(1), Dirty(), Hertz(1), Hertz(1), Dirty(), Event(), Event()},
		LevelSaving:   {Hertz(30), Hertz(30), Hertz(30), Hertz(30), Hertz(15), Hertz(15), Hertz(10), Hertz(10), Hertz(10), Hertz(10), Hertz(10), Hertz(4), Hertz(2), Dirty(), Dirty(), Dirty(), Dirty(), Dirty(), Event(), Event()},
		LevelMinimum:  {Hertz(20), Hertz(20), Hertz(20), Hertz(20), Hertz(10), Hertz(10), Hertz(5), Hertz(5), Hertz(5), Hertz(5), Hertz(5), Hertz(2), Dirty(), Dirty(), Dirty(), Dirty(), Dirty(), Dirty(), Event(), Event()},
	}
	names := []string{
		"pedals", "pedals-telemetry", "pedals-telemetry-compact", "input-telemetry",
		"delta", "delta-advanced", "delta-trace", "track-map",
		"relative", "multiclass-relative", "head-to-head", "standings", "broadcast-tower",
		"fuel-strategy", "race-schedule", "car-damage-numbers", "car-damage-visual", "track-weather",
		"racing-flags", "engineer-radio",
	}
	rates, ok := column[level]
	if !ok {
		rates = column[LevelBalanced]
	}
	result := make(map[string]WidgetRate, len(names))
	for index, name := range names {
		result[name] = rates[index]
	}
	return result
}

func policyForLevel(level Level) Policy {
	policy := Policy{Level: level, Mode: ModeLevel, Effects: EffectsFull, WidgetHz: WidgetHzFor(level)}
	switch level {
	case LevelHigh:
		policy.RafCap = intPointer(60)
	case LevelBalanced:
		policy.RafCap = intPointer(40)
	case LevelSaving:
		policy.RafCap = intPointer(30)
	case LevelMinimum:
		policy.RafCap = intPointer(20)
	}
	return policy
}

// Diagnostics devuelve incidencias de política que no forman parte del wire.
// El runtime las registra al activar una decisión explícita.
func Diagnostics(policy Policy) []string {
	if policy.Level >= LevelBalanced && policy.Level <= LevelMinimum && policy.Effects == EffectsFull {
		return []string{DiagnosticEffectsVariantUnavailable}
	}
	return nil
}

func (level Level) valid() bool { return level >= LevelMaximum && level <= LevelMinimum }

func (reason Reason) valid() bool {
	switch reason {
	case ReasonCPU, ReasonFrameTime, ReasonUser, ReasonVR, ReasonUnavailable:
		return true
	default:
		return false
	}
}

func intPointer(value int) *int { return &value }

func cloneOptionalInt(value *int) *int {
	if value == nil {
		return nil
	}
	return intPointer(*value)
}

func sameOptionalInt(left, right *int) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}

func cloneWidgetRates(source map[string]WidgetRate) map[string]WidgetRate {
	result := make(map[string]WidgetRate, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

func cloneWidgetEffects(source map[string]Effects) map[string]Effects {
	result := make(map[string]Effects, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}
