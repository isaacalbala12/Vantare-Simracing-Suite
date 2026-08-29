package sensor

import (
	"math"
	"sync"
	"time"

	performancepolicy "github.com/vantare/overlays/v2/internal/app/performance"
)

const (
	healthyCPUThreshold        = 70.0
	overloadedCPUThreshold     = 90.0
	healthyFrametimeRatio      = 1.03
	overloadedFrametimeRatio   = 1.05
	healthySamplesForPromotion = 30
	overloadSamplesForDrop     = 2
	promotionHysteresis        = 60 * time.Second
)

type HostPayload struct {
	CPUPct          float64  `json:"cpuPct"`
	VantareCPUPct   float64  `json:"vantareCpuPct"`
	VantareRAMMB    float64  `json:"vantareRamMB"`
	GPUPct          float64  `json:"gpuPct"`
	GameFrametimeMS *float64 `json:"gameFrametimeMs,omitempty"`
}

type Decision struct {
	Level   performancepolicy.Level  `json:"level"`
	Reason  performancepolicy.Reason `json:"reason,omitempty"`
	Host    HostPayload              `json:"host"`
	Changed bool                     `json:"-"`
}

// AutoController implementa D7. RequestedLevel es el techo de rendimiento de
// D4: un perfil puede forzar al automático a ahorrar más, nunca a rendir más.
type AutoController struct {
	mu sync.Mutex

	level           performancepolicy.Level
	requestedLevel  performancepolicy.Level
	reason          performancepolicy.Reason
	healthySamples  int
	overloadSamples int
	lastDrop        time.Time
	referenceFrame  float64
	vr              bool
}

func NewAutoController(requestedLevel performancepolicy.Level) *AutoController {
	requestedLevel = normalizeRequestedLevel(requestedLevel)
	level := performancepolicy.LevelBalanced
	if requestedLevel > level {
		level = requestedLevel
	}
	return &AutoController{level: level, requestedLevel: requestedLevel, reason: performancepolicy.ReasonUnavailable}
}

func (controller *AutoController) Level() performancepolicy.Level {
	controller.mu.Lock()
	defer controller.mu.Unlock()
	return controller.level
}

// SetRequestedLevel aplica en caliente el límite del perfil. Si el perfil pide
// más ahorro, el ajuste es inmediato y queda atribuido al usuario.
func (controller *AutoController) SetRequestedLevel(level performancepolicy.Level) Decision {
	controller.mu.Lock()
	defer controller.mu.Unlock()
	controller.requestedLevel = normalizeRequestedLevel(level)
	changed := false
	if controller.level < controller.requestedLevel {
		controller.level = controller.requestedLevel
		changed = true
	}
	controller.resetEvidence()
	controller.reason = performancepolicy.ReasonUser
	return Decision{Level: controller.level, Reason: controller.reason, Changed: changed}
}

func (controller *AutoController) SetVR(active bool) {
	controller.mu.Lock()
	controller.vr = active
	if active {
		controller.reason = performancepolicy.ReasonVR
	}
	controller.mu.Unlock()
}

func (controller *AutoController) Observe(sample Sample) Decision {
	controller.mu.Lock()
	defer controller.mu.Unlock()
	decision := Decision{Level: controller.level, Reason: controller.reason, Host: hostPayload(sample)}

	// Fuera de foreground no se toma ninguna decisión ni se mueve la referencia.
	if sample.Game.Available && !sample.Game.Foreground {
		return decision
	}
	if controller.vr {
		controller.reason = performancepolicy.ReasonVR
		decision.Reason = controller.reason
		return decision
	}

	frameHealthy, frameOverloaded := controller.classifyFrametime(sample.Game)
	cpuOverloaded := sample.Host.CPUPct > overloadedCPUThreshold
	if cpuOverloaded || frameOverloaded {
		controller.overloadSamples++
		controller.healthySamples = 0
		if controller.overloadSamples >= overloadSamplesForDrop && controller.level < performancepolicy.LevelMinimum {
			controller.level++
			controller.lastDrop = sample.At
			controller.overloadSamples = 0
			controller.reason = performancepolicy.ReasonCPU
			if frameOverloaded {
				controller.reason = performancepolicy.ReasonFrameTime
			}
			decision.Changed = true
		}
	} else {
		controller.overloadSamples = 0
		healthy := sample.Host.CPUPct < healthyCPUThreshold && (!sample.Game.Available || frameHealthy)
		if healthy {
			controller.healthySamples++
		} else {
			controller.healthySamples = 0
		}
		canPromote := controller.lastDrop.IsZero() || sample.At.Sub(controller.lastDrop) >= promotionHysteresis
		if controller.healthySamples >= healthySamplesForPromotion && canPromote && controller.level > controller.requestedLevel {
			controller.level--
			controller.healthySamples = 0
			controller.reason = performancepolicy.ReasonCPU
			if sample.Game.Available {
				controller.reason = performancepolicy.ReasonFrameTime
			}
			decision.Changed = true
		}
	}

	// La ausencia de PresentMon es un hecho más importante para el contrato que
	// atribuir una decisión basada solo en CPU: Automático sigue activo, pero el
	// Hub puede explicar que no está midiendo el juego.
	if !sample.Game.Available {
		controller.reason = performancepolicy.ReasonUnavailable
	}
	decision.Level = controller.level
	decision.Reason = controller.reason
	return decision
}

func (controller *AutoController) classifyFrametime(game GameSample) (healthy, overloaded bool) {
	if !game.Available || game.FrametimeMS <= 0 || math.IsNaN(game.FrametimeMS) || math.IsInf(game.FrametimeMS, 0) {
		return false, false
	}
	if controller.referenceFrame == 0 {
		controller.referenceFrame = game.FrametimeMS
		return true, false
	}
	ratio := game.FrametimeMS / controller.referenceFrame
	healthy = ratio <= healthyFrametimeRatio
	overloaded = ratio > overloadedFrametimeRatio
	if healthy {
		// Una EWMA lenta sigue mejoras sostenidas sin reaccionar a un único mínimo.
		controller.referenceFrame = controller.referenceFrame*0.95 + game.FrametimeMS*0.05
	}
	return healthy, overloaded
}

func (controller *AutoController) resetEvidence() {
	controller.healthySamples = 0
	controller.overloadSamples = 0
	controller.referenceFrame = 0
}

func normalizeRequestedLevel(level performancepolicy.Level) performancepolicy.Level {
	if level < performancepolicy.LevelHigh {
		return performancepolicy.LevelHigh
	}
	if level > performancepolicy.LevelMinimum {
		return performancepolicy.LevelMinimum
	}
	return level
}

func hostPayload(sample Sample) HostPayload {
	payload := HostPayload{
		CPUPct: sample.Host.CPUPct, VantareCPUPct: sample.Host.VantareCPUPct,
		VantareRAMMB: sample.Host.VantareRAMMB, GPUPct: sample.Host.GPUPct,
	}
	if sample.Game.Available && sample.Game.FrametimeMS > 0 {
		value := sample.Game.FrametimeMS
		payload.GameFrametimeMS = &value
	}
	return payload
}
