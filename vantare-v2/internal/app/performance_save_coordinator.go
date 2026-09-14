package app

import (
	"fmt"
	"sync"

	"github.com/vantare/overlays/v2/pkg/config"
)

// PerformanceSaveCoordinator is the single commit boundary for app settings
// and active-profile performance writes. Each writer persists first; then the
// coordinator rereads both confirmed snapshots and reconciles that exact pair.
type PerformanceSaveCoordinator struct {
	mu               sync.Mutex
	settingsSnapshot func() *AppSettings
	profileSnapshot  func() *config.ProfileDocumentV4
	reconcile        func(PerformanceSettings, *config.ProfileDocumentV4)
}

func newPerformanceSaveCoordinator(
	settingsSnapshot func() *AppSettings,
	profileSnapshot func() *config.ProfileDocumentV4,
	reconcile func(PerformanceSettings, *config.ProfileDocumentV4),
) *PerformanceSaveCoordinator {
	return &PerformanceSaveCoordinator{
		settingsSnapshot: settingsSnapshot,
		profileSnapshot:  profileSnapshot,
		reconcile:        reconcile,
	}
}

// NewPerformanceSaveCoordinator binds the real settings and Studio services.
func NewPerformanceSaveCoordinator(
	settings *SettingsService,
	profile *StudioProfileService,
	reconcile func(PerformanceSettings, *config.ProfileDocumentV4),
) *PerformanceSaveCoordinator {
	return newPerformanceSaveCoordinator(settings.Settings, profile.PerformanceProfile, reconcile)
}

// Execute serializes one persistence operation and returns the confirmed state
// pair that was used for reconciliation.
func (c *PerformanceSaveCoordinator) Execute(persist func() error) (*AppSettings, *config.ProfileDocumentV4, error) {
	if c == nil || persist == nil {
		return nil, nil, fmt.Errorf("performance save coordinator is not configured")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := persist(); err != nil {
		return nil, nil, err
	}
	settings := c.settingsSnapshot()
	profile := c.profileSnapshot()
	if settings == nil {
		return nil, nil, fmt.Errorf("confirmed settings are unavailable")
	}
	if c.reconcile != nil {
		c.reconcile(settings.Performance, profile)
	}
	return settings, profile, nil
}
