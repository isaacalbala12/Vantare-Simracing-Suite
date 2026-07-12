package config

import (
	"errors"
	"strings"
	"testing"
)

func assertValidationPath(t *testing.T, err error, wantPath string) {
	t.Helper()
	var ve ProfileValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected ProfileValidationError, got %v", err)
	}
	if ve.Path != wantPath {
		t.Fatalf("path=%q want %q (msg=%q)", ve.Path, wantPath, ve.Message)
	}
}

func validWidget(id string, widgetType WidgetTypeV3) WidgetInstanceV3 {
	return WidgetInstanceV3{
		ID:   id,
		Type: widgetType,
		Layout: WidgetLayoutV3{
			X: 100, Y: 100, W: 200, H: 120,
			ZIndex: 0, AspectLocked: true,
		},
		Behavior: WidgetBehaviorV3{Enabled: true, UpdateHz: 15},
		Content:  map[string]any{},
		Visual: WidgetVisualV3{
			SystemID:            DesignSystemVantareOriginal,
			SystemVersion:       1,
			ConfigVersion:       1,
			BaseSettings:        map[string]any{},
			AppearanceOverrides: map[string]any{},
		},
	}
}

func validProfileV3(widgets ...WidgetInstanceV3) *ProfileDocumentV3 {
	return &ProfileDocumentV3{
		SchemaVersion: ProfileSchemaVersionV3,
		ID:            "profile-v3",
		Name:          "Profile V3",
		DisplayMode:   ModeEdit,
		MonitorIndex:  0,
		Layouts: map[LayoutType]SessionLayoutV3{
			LayoutGeneral: {
				Type:    LayoutGeneral,
				Widgets: widgets,
			},
		},
	}
}

func TestValidateProfileDocumentV3(t *testing.T) {
	t.Run("valid empty general layout", func(t *testing.T) {
		doc := validProfileV3()
		if err := ValidateProfileDocumentV3(doc); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("schema not 3", func(t *testing.T) {
		doc := validProfileV3()
		doc.SchemaVersion = 2
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "schemaVersion")
	})

	t.Run("empty profile ID", func(t *testing.T) {
		doc := validProfileV3()
		doc.ID = ""
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "id")
	})

	t.Run("empty profile name", func(t *testing.T) {
		doc := validProfileV3()
		doc.Name = ""
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "name")
	})

	t.Run("missing general layout", func(t *testing.T) {
		doc := validProfileV3()
		delete(doc.Layouts, LayoutGeneral)
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "layouts.general")
	})

	t.Run("layout key type mismatch", func(t *testing.T) {
		doc := validProfileV3()
		doc.Layouts[LayoutPractice] = SessionLayoutV3{
			Type:    LayoutRace,
			Widgets: []WidgetInstanceV3{},
		}
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "layouts.practice.type")
	})

	t.Run("duplicate widget ID within layout", func(t *testing.T) {
		w := validWidget("dup", WidgetTypeDelta)
		doc := validProfileV3(w, w)
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "layouts.general.widgets")
	})

	t.Run("unsupported widget type", func(t *testing.T) {
		w := validWidget("telemetry-1", WidgetTypeV3("telemetry"))
		doc := validProfileV3(w)
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "layouts.general.widgets[0].type")
	})

	t.Run("preserved unsupported legacy payload is valid", func(t *testing.T) {
		doc := validProfileV3()
		doc.Layouts[LayoutGeneral] = SessionLayoutV3{
			Type:    LayoutGeneral,
			Widgets: []WidgetInstanceV3{},
			PreservedWidgets: []PreservedWidgetV3{{
				ID:     "telemetry-aux",
				Type:   "telemetry",
				Source: map[string]any{"id": "telemetry-aux", "type": "telemetry"},
			}},
		}
		if err := ValidateProfileDocumentV3(doc); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("unsupported system ID", func(t *testing.T) {
		w := validWidget("delta-1", WidgetTypeDelta)
		w.Visual.SystemID = DesignSystemID("broadcast-pro")
		doc := validProfileV3(w)
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "layouts.general.widgets[0].visual.systemId")
	})

	t.Run("system version less than 1", func(t *testing.T) {
		w := validWidget("delta-1", WidgetTypeDelta)
		w.Visual.SystemVersion = 0
		doc := validProfileV3(w)
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "layouts.general.widgets[0].visual.systemVersion")
	})

	t.Run("width less than 1", func(t *testing.T) {
		w := validWidget("delta-1", WidgetTypeDelta)
		w.Layout.W = 0
		doc := validProfileV3(w)
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "layouts.general.widgets[0].layout.w")
	})

	t.Run("not enough recoverable pixels", func(t *testing.T) {
		w := validWidget("delta-1", WidgetTypeDelta)
		w.Layout.X = 2000
		w.Layout.Y = 2000
		w.Layout.W = 10
		w.Layout.H = 10
		doc := validProfileV3(w)
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "layouts.general.widgets[0].layout")
	})

	t.Run("updateHz below range", func(t *testing.T) {
		w := validWidget("delta-1", WidgetTypeDelta)
		w.Behavior.UpdateHz = 0
		doc := validProfileV3(w)
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "layouts.general.widgets[0].behavior.updateHz")
	})

	t.Run("updateHz above range", func(t *testing.T) {
		w := validWidget("delta-1", WidgetTypeDelta)
		w.Behavior.UpdateHz = 241
		doc := validProfileV3(w)
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "layouts.general.widgets[0].behavior.updateHz")
	})

	t.Run("too many widgets in one layout", func(t *testing.T) {
		widgets := make([]WidgetInstanceV3, 129)
		for i := range widgets {
			widgets[i] = validWidget("w-"+strings.Repeat("a", 1)+string(rune('a'+i%26)), WidgetTypeDelta)
			widgets[i].ID = "widget-" + string(rune('a'+i%26)) + "-" + string(rune('0'+i%10))
		}
		doc := validProfileV3(widgets...)
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "layouts.general.widgets")
	})

	t.Run("profile ID too long", func(t *testing.T) {
		doc := validProfileV3()
		doc.ID = strings.Repeat("a", 129)
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "id")
	})

	t.Run("profile name too long", func(t *testing.T) {
		doc := validProfileV3()
		doc.Name = strings.Repeat("a", 161)
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "name")
	})

	t.Run("content payload too large", func(t *testing.T) {
		w := validWidget("delta-1", WidgetTypeDelta)
		w.Content = map[string]any{"blob": strings.Repeat("x", 256*1024)}
		doc := validProfileV3(w)
		assertValidationPath(t, ValidateProfileDocumentV3(doc), "layouts.general.widgets[0].content")
	})
}

func TestWidgetTypeV3Vocabulary(t *testing.T) {
	supported := []string{
		"delta", "standings", "relative", "pedals", "broadcast-tower", "fuel-strategy",
		"pedals-telemetry", "pedals-telemetry-compact", "racing-flags", "delta-trace",
		"race-schedule", "head-to-head", "delta-advanced", "input-telemetry",
		"multiclass-relative", "track-weather", "car-damage-visual", "car-damage-numbers",
	}
	for _, widgetType := range supported {
		t.Run(widgetType, func(t *testing.T) {
			doc := validProfileV3(validWidget("widget-1", WidgetTypeV3(widgetType)))
			if err := ValidateProfileDocumentV3(doc); err != nil {
				t.Fatalf("widget type %q rejected: %v", widgetType, err)
			}
		})
	}

	for _, widgetType := range []string{"pedals-v1", "car-damage", "delta-simple"} {
		t.Run("reject-"+widgetType, func(t *testing.T) {
			doc := validProfileV3(validWidget("widget-1", WidgetTypeV3(widgetType)))
			assertValidationPath(t, ValidateProfileDocumentV3(doc), "layouts.general.widgets[0].type")
		})
	}
}

func TestNormalizeProfileDocumentV3(t *testing.T) {
	t.Run("nil maps become empty maps", func(t *testing.T) {
		w := validWidget("delta-1", WidgetTypeDelta)
		w.Content = nil
		w.Visual.BaseSettings = nil
		w.Visual.AppearanceOverrides = nil
		doc := validProfileV3(w)
		normalized := NormalizeProfileDocumentV3(doc)
		if normalized.Layouts[LayoutGeneral].Widgets[0].Content == nil {
			t.Fatal("content should not be nil")
		}
		if normalized.Layouts[LayoutGeneral].Widgets[0].Visual.BaseSettings == nil {
			t.Fatal("baseSettings should not be nil")
		}
		if normalized.Layouts[LayoutGeneral].Widgets[0].Visual.AppearanceOverrides == nil {
			t.Fatal("appearanceOverrides should not be nil")
		}
	})

	t.Run("duplicate zIndex is normalized not rejected", func(t *testing.T) {
		a := validWidget("a", WidgetTypeDelta)
		b := validWidget("b", WidgetTypeStandings)
		a.Layout.ZIndex = 1
		b.Layout.ZIndex = 1
		doc := validProfileV3(a, b)
		normalized := NormalizeProfileDocumentV3(doc)
		if err := ValidateProfileDocumentV3(normalized); err != nil {
			t.Fatal(err)
		}
		zs := []int{
			normalized.Layouts[LayoutGeneral].Widgets[0].Layout.ZIndex,
			normalized.Layouts[LayoutGeneral].Widgets[1].Layout.ZIndex,
		}
		if zs[0] != 0 || zs[1] != 1 {
			t.Fatalf("z-indexes=%v want [0 1]", zs)
		}
	})

	t.Run("non-contiguous zIndex rewrites to zero-based order", func(t *testing.T) {
		a := validWidget("a", WidgetTypeDelta)
		b := validWidget("b", WidgetTypeStandings)
		c := validWidget("c", WidgetTypeRelative)
		a.Layout.ZIndex = 5
		b.Layout.ZIndex = 2
		c.Layout.ZIndex = 9
		doc := validProfileV3(a, b, c)
		normalized := NormalizeProfileDocumentV3(doc)
		zs := make([]int, 3)
		for i, w := range normalized.Layouts[LayoutGeneral].Widgets {
			zs[i] = w.Layout.ZIndex
		}
		if zs[0] != 0 || zs[1] != 1 || zs[2] != 2 {
			t.Fatalf("z-indexes=%v want [0 1 2]", zs)
		}
		if normalized.Layouts[LayoutGeneral].Widgets[0].ID != "b" {
			t.Fatalf("first widget=%s want b (lowest zIndex)", normalized.Layouts[LayoutGeneral].Widgets[0].ID)
		}
	})

	t.Run("returns deep copy", func(t *testing.T) {
		doc := validProfileV3(validWidget("delta-1", WidgetTypeDelta))
		normalized := NormalizeProfileDocumentV3(doc)
		normalized.Name = "mutated"
		if doc.Name == "mutated" {
			t.Fatal("original document mutated")
		}
	})
}
