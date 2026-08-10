package catalog

import "context"

type Status string

const (
	StatusReady     Status = "ready"
	StatusRecovered Status = "recovered"
	StatusStale     Status = "stale"
	StatusOffline   Status = "offline"
)

type Result struct {
	Catalog VerifiedCatalog `json:"catalog"`
	Status  Status          `json:"status"`
	Warning string          `json:"warning,omitempty"`
}
type Service struct {
	source Source
	cache  *Cache
}

func NewService(source Source, cache *Cache) *Service { return &Service{source: source, cache: cache} }
func (service *Service) Load(context.Context) (Result, error) {
	if service == nil || service.cache == nil {
		return Result{}, catalogError(ErrorUnavailable, "service")
	}
	catalog, status, err := service.cache.Load()
	if err != nil {
		return Result{}, err
	}
	resultStatus := StatusReady
	if status == CacheRecovered {
		resultStatus = StatusRecovered
	}
	return Result{Catalog: catalog, Status: resultStatus}, nil
}
func (service *Service) Refresh(ctx context.Context) (Result, error) {
	if service == nil || service.cache == nil || service.source == nil {
		return Result{}, catalogError(ErrorUnavailable, "service")
	}
	document, err := service.source.Fetch(ctx)
	if err != nil {
		return service.fallback(StatusOffline, "No se pudo conectar; se muestra el último catálogo verificado.")
	}
	catalog, _, err := service.cache.Accept(document)
	if err == nil {
		return Result{Catalog: catalog, Status: StatusReady}, nil
	}
	return service.fallback(StatusStale, "La actualización fue rechazada; se mantiene el último catálogo verificado.")
}
func (service *Service) fallback(status Status, warning string) (Result, error) {
	catalog, _, err := service.cache.Load()
	if err != nil {
		return Result{}, err
	}
	return Result{Catalog: catalog, Status: status, Warning: warning}, nil
}
