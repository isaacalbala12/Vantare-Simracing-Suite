package server

import (
	"io"
	"net/http"
	"net/http/httptest"
)

// loopbackTestHost es el Host que envian los clientes reales: OBS carga
// http://127.0.0.1:<puerto>/overlay y la WebView hace lo mismo, asi que el
// header siempre nombra un host de loopback.
const loopbackTestHost = "127.0.0.1:39261"

// loopbackRequest construye una peticion con un Host de loopback.
//
// httptest.NewRequest usa "example.com" cuando el target es una ruta, y el
// guardia de Host (hostGuard) rechaza cualquier Host que no sea de loopback
// para cerrar el DNS rebinding. Las pruebas internas de este paquete usan este
// helper para no chocar con ese control.
func loopbackRequest(method, target string, body io.Reader) *http.Request {
	req := httptest.NewRequest(method, target, body)
	req.Host = loopbackTestHost
	return req
}
