package catalog

import (
	"context"
	"encoding/json"
)

const CommandVersionV1 = "strategy.official-catalog.command.v1"
const ResultVersionV1 = "strategy.official-catalog.result.v1"

type command struct {
	Version   string `json:"version"`
	RequestID string `json:"requestId"`
	Operation string `json:"operation"`
}
type bridgeResponse struct {
	Version   string    `json:"version"`
	RequestID string    `json:"requestId"`
	OK        bool      `json:"ok"`
	Result    *Result   `json:"result,omitempty"`
	ErrorCode ErrorCode `json:"errorCode,omitempty"`
	Message   string    `json:"message,omitempty"`
}

func ExecuteJSON(ctx context.Context, service *Service, document []byte) []byte {
	var request command
	if len(document) > MaxManifestBytes || rejectDuplicateJSON(document) != nil || decodeStrict(document, &request) != nil || request.Version != CommandVersionV1 || !safeID.MatchString(request.RequestID) || (request.Operation != "load" && request.Operation != "refresh") {
		return marshalBridge(bridgeResponse{Version: ResultVersionV1, RequestID: request.RequestID, OK: false, ErrorCode: ErrorInvalidBundle, Message: "Solicitud de catálogo no válida."})
	}
	if service == nil {
		return marshalBridge(bridgeResponse{Version: ResultVersionV1, RequestID: request.RequestID, OK: false, ErrorCode: ErrorUnavailable, Message: "No hay un catálogo oficial verificado disponible."})
	}
	var result Result
	var err error
	if request.Operation == "load" {
		result, err = service.Load(ctx)
	} else {
		result, err = service.Refresh(ctx)
	}
	if err != nil {
		return marshalBridge(bridgeResponse{Version: ResultVersionV1, RequestID: request.RequestID, OK: false, ErrorCode: ErrorUnavailable, Message: "No hay un catálogo oficial verificado disponible."})
	}
	return marshalBridge(bridgeResponse{Version: ResultVersionV1, RequestID: request.RequestID, OK: true, Result: &result})
}
func marshalBridge(response bridgeResponse) []byte {
	encoded, err := json.Marshal(response)
	if err != nil {
		return []byte(`{"version":"strategy.official-catalog.result.v1","ok":false,"errorCode":"catalog_unavailable","message":"No hay un catálogo oficial verificado disponible."}`)
	}
	return encoded
}
