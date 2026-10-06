package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/vantare/overlays/v2/internal/server"
)

// El servidor escucha en loopback y no valida el header Host: eso es
// exactamente lo que necesita un ataque de DNS rebinding, porque convierte al
// atacante en mismo origen y anula la proteccion de CORS. Estas pruebas fijan
// que solo se atienden nombres de loopback.
func TestHostGuardAcceptsOnlyLoopbackHosts(t *testing.T) {
	srv := server.New(server.ServerConfig{Addr: "127.0.0.1:39261"})
	handler := srv.Handler()

	accepted := []string{
		"127.0.0.1:39261",
		"127.0.0.1",
		"localhost:39261",
		"localhost",
		"localhost.", // un punto final es valido en DNS
		"LOCALHOST:39261",
		"[::1]:39261",
		"::1",
	}
	for _, host := range accepted {
		req := httptest.NewRequest(http.MethodGet, "http://"+host+"/health", nil)
		req.Host = host
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("Host %q = %d, se esperaba 200", host, rec.Code)
		}
	}

	rejected := []string{
		"evil.example.com:39261", // DNS rebinding
		"evil.example.com",
		"attacker.test",
		"127.0.0.1.evil.com", // sufijo que empieza por una IP valida
		"localhost.evil.com",
		"", // defensa en profundidad: el servidor ya responde 400 antes
	}
	for _, host := range rejected {
		req := httptest.NewRequest(http.MethodGet, "http://placeholder/health", nil)
		req.Host = host
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Errorf("Host %q = %d, se esperaba 403", host, rec.Code)
		}
	}
}

// El guardia vive por fuera del mux, asi que ninguna ruta puede quedar sin
// cubrir, incluidas las que se anadan en el futuro.
func TestHostGuardCoversEveryRoute(t *testing.T) {
	srv := server.New(server.ServerConfig{Addr: "127.0.0.1:39261"})
	handler := srv.Handler()

	routes := []string{
		"/health",
		"/overlay",
		"/api/profile",
		"/api/profile-v3",
		"/api/calendar",
		"/api/engineer/health",
		"/engineer/stream",
		"/auth/callback",
		"/assets/index.js",
		"/favicon.svg",
	}
	for _, route := range routes {
		req := httptest.NewRequest(http.MethodGet, "http://evil.example.com:39261"+route, nil)
		req.Host = "evil.example.com:39261"
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Errorf("%s con Host ajeno = %d, se esperaba 403", route, rec.Code)
		}
	}
}

// La ruta con metodo de escritura tambien queda cubierta.
func TestHostGuardCoversAuthToken(t *testing.T) {
	srv := server.New(server.ServerConfig{Addr: "127.0.0.1:39261"})
	handler := srv.Handler()

	req := httptest.NewRequest(http.MethodPost, "http://evil.example.com:39261/auth/token", nil)
	req.Host = "evil.example.com:39261"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("POST /auth/token con Host ajeno = %d, se esperaba 403", rec.Code)
	}
}

// El puerto configurado con -http cambia el Host que envia el cliente, asi que
// la allowlist se deriva de la direccion configurada y no de una constante.
func TestHostGuardFollowsConfiguredAddress(t *testing.T) {
	srv := server.New(server.ServerConfig{Addr: "127.0.0.1:45000"})
	handler := srv.Handler()

	for _, host := range []string{"127.0.0.1:45000", "localhost:45000"} {
		req := httptest.NewRequest(http.MethodGet, "http://"+host+"/health", nil)
		req.Host = host
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("Host %q = %d, se esperaba 200", host, rec.Code)
		}
	}
}
