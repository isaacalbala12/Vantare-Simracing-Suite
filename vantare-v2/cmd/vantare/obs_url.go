package main

import (
	"fmt"

	"github.com/vantare/overlays/v2/internal/server"
)

// El hub no conoce el origen HTTP real del servidor de overlays: dentro del
// WebView `window.location.origin` es el esquema de Wails, no `127.0.0.1` donde
// escucha `/overlay` y los SSE. `obs:url:get` -> `obs:url` le da al frontend la
// direccion bound para construir URLs de Browser Source que resuelven fuera.
const obsURLResponseEvent = "obs:url"

type obsURLEmitter interface {
	Emit(name string, data any)
}

func emitObsURL(emitter obsURLEmitter, srv *server.Server) {
	if emitter == nil || srv == nil {
		return
	}
	addr := srv.Addr()
	if addr == "" {
		return
	}
	emitter.Emit(obsURLResponseEvent, map[string]any{
		"baseUrl": fmt.Sprintf("http://%s", addr),
	})
}
