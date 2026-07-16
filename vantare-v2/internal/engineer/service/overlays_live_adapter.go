package service

import (
	engineerlmu "github.com/vantare/overlays/v2/internal/engineer/lmu"
	engineertelemetry "github.com/vantare/overlays/v2/internal/engineer/telemetry"
)

// BufferProvider entrega el buffer mmap crudo de LMU sin abrir un segundo reader.
// En producción lo implementa *app.EnrichedLMUSource.
type BufferProvider interface {
	Read() []byte
}

// OverlaysLiveAdapter implementa telemetry.Source (de ingeniero) consumiendo
// el buffer mmap de Overlays vía un BufferProvider. No abre ni cierra el mmap:
// esa responsabilidad sigue en TelemetrySourceManager. Close() es no-op.
type OverlaysLiveAdapter struct {
	buf   BufferProvider
	avail bool
	info  engineertelemetry.SourceInfo
}

// NewOverlaysLiveAdapter construye un adapter live a partir de un BufferProvider.
// available indica si la fuente LMU está conectada (lo decide el caller desde
// TelemetrySourceManager/EnrichedLMUSource.Info().Available).
func NewOverlaysLiveAdapter(buf BufferProvider, available bool) *OverlaysLiveAdapter {
	return &OverlaysLiveAdapter{
		buf:   buf,
		avail: available,
		info: engineertelemetry.SourceInfo{
			Kind:      engineertelemetry.KindLMU,
			Name:      "Le Mans Ultimate (live)",
			Live:      true,
			Available: available,
		},
	}
}

// ReadFrame decodifica el buffer en un *telemetry.Frame de ingeniero.
// Devuelve nil sin panic si el buffer es nil/inválido (LMU no disponible),
// permitiendo que EngineerService caiga a simulator con Connected:false.
func (a *OverlaysLiveAdapter) ReadFrame() *engineertelemetry.Frame {
	if a == nil || a.buf == nil {
		return nil
	}
	return engineerlmu.ParseEngineerFrame(a.buf.Read())
}

// Info devuelve metadata de la fuente live.
func (a *OverlaysLiveAdapter) Info() engineertelemetry.SourceInfo {
	if a == nil {
		return engineertelemetry.SourceInfo{Kind: engineertelemetry.KindLMU, Available: false}
	}
	a.info.Available = a.avail
	return a.info
}

// Close es no-op: el mmap lo gestiona TelemetrySourceManager, no el adapter.
func (a *OverlaysLiveAdapter) Close() error {
	return nil
}
