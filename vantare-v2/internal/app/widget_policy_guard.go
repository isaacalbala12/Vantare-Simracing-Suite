package app

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/vantare/overlays/v2/internal/license"
	"github.com/vantare/overlays/v2/pkg/config"
)

// WidgetPolicySource is the native authority snapshot for save guards.
// *license.Service implements it; the compile-time assertion below pins the
// single source of truth. Tests use a stub.
type WidgetPolicySource interface {
	CurrentWidgetPolicy() license.WidgetPolicy
}

var _ WidgetPolicySource = (*license.Service)(nil)

// WidgetPolicyDeniedError rejects a profile save that would grant widget
// rights the effective policy does not allow. WidgetIDs names the offending
// widgets; the caller surfaces the message without touching the stored
// profile, so downgraded settings are never deleted by a denial.
type WidgetPolicyDeniedError struct {
	WidgetIDs []string
}

func (e *WidgetPolicyDeniedError) Error() string {
	return fmt.Sprintf("widget access denied for widgets: %v", e.WidgetIDs)
}

// widgetPolicyFeature is the side of the native policy a widget type needs,
// mirroring WIDGET_REQUIRED_FEATURE_BY_TYPE on the frontend: Standings and
// Pedals are basic, engineer-radio needs engineer.ai, every other registered
// type needs overlays.advanced.
type widgetPolicyFeature int

const (
	widgetFeatureBasic widgetPolicyFeature = iota
	widgetFeatureAdvanced
	widgetFeatureEngineer
)

func widgetRequiredFeature(widgetType config.WidgetTypeV3) (widgetPolicyFeature, bool) {
	switch widgetType {
	case "standings", "pedals":
		return widgetFeatureBasic, true
	case "engineer-radio":
		return widgetFeatureEngineer, true
	case "delta", "relative", "pedals-telemetry", "pedals-telemetry-compact",
		"racing-flags", "broadcast-tower", "head-to-head", "input-telemetry",
		"multiclass-relative", "delta-advanced", "fuel-strategy", "delta-trace",
		"race-schedule", "track-weather", "car-damage-visual", "car-damage-numbers",
		"track-map":
		return widgetFeatureAdvanced, true
	default:
		return widgetFeatureAdvanced, false
	}
}

func widgetFeatureAllowed(policy license.WidgetPolicy, feature widgetPolicyFeature) bool {
	switch feature {
	case widgetFeatureBasic:
		return policy.OverlaysBasic
	case widgetFeatureAdvanced:
		return policy.OverlaysAdvanced
	case widgetFeatureEngineer:
		return policy.EngineerAI
	default:
		return false
	}
}

func marshalWidgetForPolicy(widget config.WidgetInstanceV3, withoutLayout bool) (string, bool) {
	if withoutLayout {
		widget.Layout = config.WidgetLayoutV3{}
	}
	raw, err := json.Marshal(widget)
	if err != nil {
		return "", false
	}
	return string(raw), true
}

func widgetsEqualForPolicy(left, right config.WidgetInstanceV3, withoutLayout bool) bool {
	leftRaw, leftOK := marshalWidgetForPolicy(left, withoutLayout)
	rightRaw, rightOK := marshalWidgetForPolicy(right, withoutLayout)
	// Unrepresentable widgets never compare equal: a blocked widget with
	// hostile content fails closed instead of slipping through as identical.
	return leftOK && rightOK && leftRaw == rightRaw
}

// checkStudioProfileSave enforces the effective widget policy on a Studio V3
// save, comparing the incoming document against the native saved baseline
// (never against a client-claimed snapshot). It mirrors the Studio gate:
// layout moves and deletions of blocked premium widgets are always allowed,
// while adding a blocked widget or changing anything beyond its layout is
// denied with the offending IDs. A nil baseline is an import: blocked widgets
// are admitted for preservation and stay inactive instead of being deleted.
// Brand preferences are presentation business and never decided here.
func checkStudioProfileSave(policy license.WidgetPolicy, saved, incoming *config.ProfileDocumentV3) error {
	if incoming == nil {
		return nil
	}
	if saved == nil {
		// Import without a native baseline: blocked widgets are admitted
		// for preservation and stay inactive instead of being deleted.
		// Execution stays gated at runtime; the guard only polices edits
		// against a known baseline, never data on the way in.
		return nil
	}
	incoming = config.NormalizeProfileDocumentV3(incoming)
	saved = config.NormalizeProfileDocumentV3(saved)
	var savedLayouts map[config.LayoutType]config.SessionLayoutV3
	if saved != nil {
		savedLayouts = saved.Layouts
	}
	denied := map[string]struct{}{}
	for session, incomingLayout := range incoming.Layouts {
		var savedWidgets []config.WidgetInstanceV3
		if savedLayouts != nil {
			savedWidgets = savedLayouts[session].Widgets
		}
		byID := make(map[string]config.WidgetInstanceV3, len(savedWidgets))
		for _, widget := range savedWidgets {
			byID[widget.ID] = widget
		}
		for _, widget := range incomingLayout.Widgets {
			previous, existed := byID[widget.ID]
			if existed && widgetsEqualForPolicy(previous, widget, false) {
				continue
			}
			feature, known := widgetRequiredFeature(widget.Type)
			if !known || !widgetFeatureAllowed(policy, feature) {
				// Layout-only moves of blocked widgets stay allowed, as do
				// identical unknown future types (preserved but frozen).
				if existed && widgetsEqualForPolicy(previous, widget, true) {
					continue
				}
				denied[widget.ID] = struct{}{}
			}
		}
	}
	if len(denied) == 0 {
		return nil
	}
	ids := make([]string, 0, len(denied))
	for id := range denied {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return &WidgetPolicyDeniedError{WidgetIDs: ids}
}

func legacyWidgetFeature(widgetType string) (widgetPolicyFeature, bool) {
	// Single mapping source: legacy string types resolve through the same
	// table as the V3 widget types.
	return widgetRequiredFeature(config.WidgetTypeV3(widgetType))
}

func marshalLegacyWidgetForPolicy(widget config.WidgetConfig, withoutPosition bool) (string, bool) {
	if withoutPosition {
		widget.Position = config.Rect{}
	}
	raw, err := json.Marshal(widget)
	if err != nil {
		return "", false
	}
	return string(raw), true
}

func legacyWidgetsEqualForPolicy(left, right config.WidgetConfig, withoutPosition bool) bool {
	leftRaw, leftOK := marshalLegacyWidgetForPolicy(left, withoutPosition)
	rightRaw, rightOK := marshalLegacyWidgetForPolicy(right, withoutPosition)
	return leftOK && rightOK && leftRaw == rightRaw
}

// findSavedLegacyWidget matches an incoming widget against the native
// baseline. Top-level widgets and the general layout are mirrors of one
// logical list (see SetGeneralLayoutWidgets), so they fall back to each
// other: a pre-layouts file must not turn a plain move into a forged add.
// Any other session matches within itself only, so copying a blocked widget
// into a new session stays denied.
func findSavedLegacyWidget(saved *config.ProfileConfig, bucket, id string) (config.WidgetConfig, bool) {
	if saved == nil {
		return config.WidgetConfig{}, false
	}
	matchIn := func(widgets []config.WidgetConfig) (config.WidgetConfig, bool) {
		for _, widget := range widgets {
			if widget.ID == id {
				return widget, true
			}
		}
		return config.WidgetConfig{}, false
	}
	if bucket == "" {
		if found, ok := matchIn(saved.Widgets); ok {
			return found, true
		}
	} else if layout, ok := saved.Layouts[config.LayoutType(bucket)]; ok {
		if found, ok := matchIn(layout.Widgets); ok {
			return found, true
		}
	}
	if bucket == string(config.LayoutGeneral) {
		return matchIn(saved.Widgets)
	}
	if bucket == "" {
		if layout, ok := saved.Layouts[config.LayoutGeneral]; ok {
			return matchIn(layout.Widgets)
		}
	}
	return config.WidgetConfig{}, false
}

func marshalVariantForPolicy(variant config.WidgetVariantConfig) (string, bool) {
	raw, err := json.Marshal(variant)
	if err != nil {
		return "", false
	}
	return string(raw), true
}

// checkLegacyProfileSave enforces the effective widget policy on legacy V2
// profile saves, with the same preservation semantics as the V3 guard:
// identical, position-only and deleted widgets of any tier are allowed;
// adding a blocked widget or changing it beyond position is denied. New or
// changed variants of a blocked widget type are denied; removals are always
// allowed so cleanup can never be trapped. A nil baseline is an import and
// is admitted for preservation (blocked widgets stay inactive at runtime).
func checkLegacyProfileSave(policy license.WidgetPolicy, saved, incoming *config.ProfileConfig) error {
	if incoming == nil || saved == nil {
		return nil
	}
	denied := map[string]struct{}{}
	incomingByBucket := map[string][]config.WidgetConfig{"": incoming.Widgets}
	for session, layout := range incoming.Layouts {
		incomingByBucket[string(session)] = layout.Widgets
	}
	for bucket, widgets := range incomingByBucket {
		for _, widget := range widgets {
			previous, existed := findSavedLegacyWidget(saved, bucket, widget.ID)
			if existed && legacyWidgetsEqualForPolicy(previous, widget, false) {
				continue
			}
			feature, known := legacyWidgetFeature(widget.Type)
			if !known || !widgetFeatureAllowed(policy, feature) {
				if existed && legacyWidgetsEqualForPolicy(previous, widget, true) {
					continue
				}
				denied[widget.ID] = struct{}{}
			}
		}
	}
	previousVariants := make(map[string]config.WidgetVariantConfig, len(saved.Variants))
	for _, variant := range saved.Variants {
		previousVariants[variant.ID] = variant
	}
	for _, variant := range incoming.Variants {
		old, existed := previousVariants[variant.ID]
		if existed {
			oldRaw, oldOK := marshalVariantForPolicy(old)
			newRaw, newOK := marshalVariantForPolicy(variant)
			if oldOK && newOK && oldRaw == newRaw {
				continue
			}
		}
		feature, known := legacyWidgetFeature(variant.WidgetType)
		if !known || !widgetFeatureAllowed(policy, feature) {
			denied[variant.ID] = struct{}{}
		}
	}
	if len(denied) == 0 {
		return nil
	}
	ids := make([]string, 0, len(denied))
	for id := range denied {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return &WidgetPolicyDeniedError{WidgetIDs: ids}
}
