package license

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

//go:embed widget_matrix.json
var widgetMatrixSource []byte

type widgetMatrixRow struct {
	ID      string `json:"id"`
	Free    bool   `json:"free"`
	Pro     bool   `json:"pro"`
	ProPlus bool   `json:"proPlus"`
	Launch  bool   `json:"launch"`
}

type widgetMatrix struct {
	Version int               `json:"version"`
	Widgets []widgetMatrixRow `json:"widgets"`
}

var widgetIDPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func parseWidgetMatrix(source []byte) (widgetMatrix, error) {
	var matrix widgetMatrix
	if err := json.Unmarshal(source, &matrix); err != nil {
		return widgetMatrix{}, fmt.Errorf("parse widget matrix: %w", err)
	}
	if matrix.Version != 1 || len(matrix.Widgets) == 0 {
		return widgetMatrix{}, fmt.Errorf("widget matrix requires version 1 and nonempty widgets")
	}
	seen := make(map[string]bool, len(matrix.Widgets))
	for _, row := range matrix.Widgets {
		if !widgetIDPattern.MatchString(row.ID) || seen[row.ID] {
			return widgetMatrix{}, fmt.Errorf("invalid or repeated widget ID %q", row.ID)
		}
		seen[row.ID] = true
		if (row.Free && (!row.Pro || !row.ProPlus || !row.Launch)) || (row.Pro && !row.ProPlus) {
			return widgetMatrix{}, fmt.Errorf("widget %q violates license hierarchy", row.ID)
		}
		if (row.ID == "standings" || row.ID == "pedals") && !row.Free {
			return widgetMatrix{}, fmt.Errorf("widget %q must remain free", row.ID)
		}
	}
	if !seen["standings"] || !seen["pedals"] {
		return widgetMatrix{}, fmt.Errorf("widget matrix lacks free Standings or Pedals")
	}
	return matrix, nil
}

func mustWidgetMatrix() widgetMatrix {
	matrix, err := parseWidgetMatrix(widgetMatrixSource)
	if err != nil {
		// A corrupt policy embedded in the binary must never be interpreted as
		// a permissive default. CI validates this exact file before packaging.
		panic(err)
	}
	return matrix
}

var productWidgetMatrix = mustWidgetMatrix()

func (m widgetMatrix) allowedIDs(eff widgetEffective) string {
	label := ClassifyPlan(eff.entitlements)
	launch := hasWidgetCapability(eff.caps, CapabilityLaunchV1)
	// The legacy bundle is also projected from Launch. Do not interpret that
	// projection as Pro rights when Launch has its own matrix column.
	pro := hasWidgetCapability(eff.caps, CapabilityPro) || (label == PlanSuite && !launch)
	proPlus := pro && hasWidgetCapability(eff.caps, CapabilityNightly)
	operational := len(eff.roles) > 0
	moduleOverlays := label == PlanPaidOverlays
	moduleEngineer := label == PlanPaidEngineer

	allowed := make([]string, 0, len(m.Widgets))
	for _, row := range m.Widgets {
		// Legacy module entitlements retain their narrower access. They never
		// bypass a widget explicitly disabled for Pro in the versioned matrix.
		legacyModule := row.Pro && ((moduleOverlays && row.ID != "engineer-radio") ||
			(moduleEngineer && row.ID == "engineer-radio"))
		if row.Free || operational || legacyModule || (pro && row.Pro) ||
			(proPlus && row.ProPlus) || (launch && row.Launch) {
			allowed = append(allowed, row.ID)
		}
	}
	sort.Strings(allowed)
	return strings.Join(allowed, ",")
}

// AllowsWidget is the server-side decision for saves. Empty lists are denied;
// the legacy Boolean gates remain for feature-level decisions only.
func (p WidgetPolicy) AllowsWidget(widgetType string) bool {
	if widgetType == "" || p.AllowedWidgetTypes == "" {
		return false
	}
	for _, allowed := range strings.Split(p.AllowedWidgetTypes, ",") {
		if allowed == widgetType {
			return true
		}
	}
	return false
}
