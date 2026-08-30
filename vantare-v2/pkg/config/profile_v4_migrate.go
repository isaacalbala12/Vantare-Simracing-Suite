package config

import (
	"encoding/json"
	"fmt"
)

// MigrateProfileJSONToV4 accepts V4 and every legacy version accepted by the
// V3 reader. Legacy updateHz values are consumed but never copied to V4.
func MigrateProfileJSONToV4(data []byte) (*ProfileDocumentV4, int, []ProfileMigrationNoticeV4, error) {
	var envelope profileSchemaEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return nil, 0, nil, fmt.Errorf("parse profile envelope: %w", err)
	}
	switch envelope.SchemaVersion {
	case ProfileSchemaVersionV4:
		var doc ProfileDocumentV4
		if err := json.Unmarshal(data, &doc); err != nil {
			return nil, 0, nil, fmt.Errorf("parse profile v4: %w", err)
		}
		normalized := NormalizeProfileDocumentV4(&doc)
		if err := ValidateProfileDocumentV4(normalized); err != nil {
			return nil, 0, nil, err
		}
		return normalized, ProfileSchemaVersionV4, nil, nil
	case 0, 1, ProfileSchemaVersionV2, ProfileSchemaVersionV3:
		// Accepted legacy versions are migrated through the V3 compatibility reader.
	default:
		return nil, 0, nil, fmt.Errorf("schemaVersion %d no soportado", envelope.SchemaVersion)
	}

	legacy, from, err := MigrateProfileJSONToV3(data)
	if err != nil {
		return nil, 0, nil, err
	}
	notices := collectAtypicalUpdateHz(legacy)
	doc := NormalizeProfileDocumentV4(ConvertProfileV3ToV4(legacy))
	if err := ValidateProfileDocumentV4(doc); err != nil {
		return nil, 0, nil, err
	}
	return doc, from, notices, nil
}

func collectAtypicalUpdateHz(doc *ProfileDocumentV3) []ProfileMigrationNoticeV4 {
	if doc == nil {
		return nil
	}
	fast := map[WidgetTypeV3]bool{
		WidgetTypePedals: true, WidgetTypePedalsTelemetry: true,
		WidgetTypePedalsTelemetryCompact: true, WidgetTypeInputTelemetry: true,
		WidgetTypeDelta: true, WidgetTypeDeltaAdvanced: true, WidgetTypeDeltaTrace: true,
	}
	var notices []ProfileMigrationNoticeV4
	for layoutType, layout := range doc.Layouts {
		for index, widget := range layout.Widgets {
			if !fast[widget.Type] || widget.Behavior.UpdateHz < 1 || widget.Behavior.UpdateHz > 4 {
				continue
			}
			notices = append(notices, ProfileMigrationNoticeV4{
				Path:       fmt.Sprintf("layouts.%s.widgets[%d].behavior.updateHz", layoutType, index),
				WidgetID:   widget.ID,
				WidgetType: widget.Type,
				UpdateHz:   widget.Behavior.UpdateHz,
				Message:    "cadencia atípica descartada al migrar el perfil v3 a v4",
			})
		}
	}
	return notices
}
