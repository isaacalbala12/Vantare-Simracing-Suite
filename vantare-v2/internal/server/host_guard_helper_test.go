package server_test

import (
	"io"
	"net/http"
	"net/http/httptest"
)

// loopbackHost es el Host que envian los clientes reales: OBS carga
// http://127.0.0.1:<puerto>/overlay y la WebView hace lo mismo, asi que el
// header siempre nombra un host de loopback.
const loopbackHost = "127.0.0.1:39261"

// newLoopbackRequest construye una peticion con un Host de loopback.
//
// httptest.NewRequest usa "example.com" cuando el target es una ruta, y el
// guardia de Host (hostGuard) rechaza cualquier Host que no sea de loopback
// para cerrar el DNS rebinding. Las pruebas que ejercitan rutas y middleware
// usan este helper para no chocar con ese control.
func newLoopbackRequest(method, target string, body io.Reader) *http.Request {
	req := httptest.NewRequest(method, target, body)
	req.Host = loopbackHost
	return req
}
