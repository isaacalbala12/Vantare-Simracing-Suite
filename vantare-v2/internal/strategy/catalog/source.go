package catalog

import (
	"context"
	"io"
	"net/http"
	"net/url"
)

type Source interface {
	Fetch(context.Context) ([]byte, error)
}

type HTTPSource struct {
	client   http.Client
	endpoint string
}

func NewHTTPSource(client *http.Client, endpoint string) (*HTTPSource, error) {
	return newHTTPSource(client, endpoint, false)
}
func NewHTTPSourceForTesting(client *http.Client, endpoint string) (*HTTPSource, error) {
	return newHTTPSource(client, endpoint, true)
}
func newHTTPSource(client *http.Client, endpoint string, allowHTTP bool) (*HTTPSource, error) {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && !(allowHTTP && parsed.Scheme == "http")) {
		return nil, catalogError(ErrorTransport, "endpoint")
	}
	if client == nil || client.Timeout <= 0 {
		return nil, catalogError(ErrorTransport, "client")
	}
	cloned := *client
	cloned.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &HTTPSource{client: cloned, endpoint: parsed.String()}, nil
}
func (source *HTTPSource) Fetch(ctx context.Context) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, source.endpoint, nil)
	if err != nil {
		return nil, wrapCatalogError(ErrorTransport, "request", err)
	}
	response, err := source.client.Do(request)
	if err != nil {
		return nil, wrapCatalogError(ErrorTransport, "request", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, catalogError(ErrorTransport, "status")
	}
	if response.ContentLength > MaxBundleBytes {
		return nil, catalogError(ErrorTransport, "body")
	}
	limited := io.LimitReader(response.Body, MaxBundleBytes+1)
	document, err := io.ReadAll(limited)
	if err != nil {
		return nil, wrapCatalogError(ErrorTransport, "body", err)
	}
	if len(document) > MaxBundleBytes {
		return nil, catalogError(ErrorTransport, "body")
	}
	return document, nil
}
