// Package clerkproxy exposes the Clerk Frontend API under the app's own
// asset origin at /clerk. Clerk's native channel identifies the client via a
// rotating JWT echoed in the Authorization header, and FAPI rejects any
// request carrying both Origin and Authorization. WebView POSTs always carry
// Origin, so the browser can never talk to FAPI directly: this handler
// forwards /clerk/* server-to-server without an Origin header, which is the
// mechanism that makes the embedded SignIn usable inside Wails.
package clerkproxy

import (
	"encoding/base64"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

// MountPath is the same-origin prefix the frontend points clerk-js at via
// `load({ proxyUrl: "/clerk" })`.
const MountPath = "/clerk"

// FapiHost decodes the Clerk Frontend API host out of a publishable key
// (`pk_(test|live)_<base64 host>$`). It is public client configuration, never
// a secret; an empty or malformed key yields "" so the proxy stays inert.
func FapiHost(publishableKey string) string {
	key := strings.TrimSpace(publishableKey)
	encoded := strings.TrimPrefix(strings.TrimPrefix(key, "pk_test_"), "pk_live_")
	if encoded == "" || encoded == key {
		return ""
	}
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		decoded, err = base64.RawURLEncoding.DecodeString(encoded)
		if err != nil {
			return ""
		}
	}
	return strings.TrimSuffix(string(decoded), "$")
}

// NewHandler wraps next so requests under MountPath are proxied to
// https://<fapiHost>/<path-after-prefix>. An empty or malformed fapiHost
// leaves every request to next, so the proxy stays inert whenever Clerk is
// not configured. The forwarded request never carries Origin, Referer or
// Cookie headers, and the target host is fixed — this is not an open proxy.
func NewHandler(next http.Handler, fapiHost string) http.Handler {
	fapiHost = strings.TrimSpace(fapiHost)
	if fapiHost == "" {
		return next
	}
	target, err := url.Parse("https://" + fapiHost)
	if err != nil || target.Host == "" {
		return next
	}
	return mount(next, target)
}

func mount(next http.Handler, target *url.URL) http.Handler {
	proxy := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = target.Scheme
			req.URL.Host = target.Host
			req.URL.Path = strings.TrimPrefix(req.URL.Path, MountPath)
			if req.URL.Path == "" {
				req.URL.Path = "/"
			}
			req.Host = target.Host
			req.Header.Del("Origin")
			req.Header.Del("Referer")
			req.Header.Del("Cookie")
		},
		Transport: &http.Transport{
			ResponseHeaderTimeout: 30 * time.Second,
		},
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == MountPath || strings.HasPrefix(r.URL.Path, MountPath+"/") {
			proxy.ServeHTTP(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}
