package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"

	"github.com/vantare/overlays/v2/internal/strategy/curation"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	CurationUploadProtocolV1   = "curation.upload.v1"
	CurationUploadCommandEvent = "curation:upload:command"
	CurationUploadResultEvent  = "curation:upload:result"
	CurationUploadErrorEvent   = "curation:upload:error"
)

type curationUploadService interface {
	Snapshot() curation.UploadSnapshot
	OptIn(string) (curation.UploadSnapshot, error)
	Pause() (curation.UploadSnapshot, error)
	Resume() (curation.UploadSnapshot, error)
	Revoke() (curation.UploadSnapshot, error)
	DispatchNext(context.Context) error
	RequestRemoteDeletion(context.Context) (curation.DeletionReceipt, error)
}

type CurationUploadResult struct {
	ProtocolVersion string                    `json:"protocolVersion"`
	CommandID       string                    `json:"commandId"`
	Snapshot        curation.UploadSnapshot   `json:"snapshot"`
	Deletion        *curation.DeletionReceipt `json:"deletion,omitempty"`
}

type CurationUploadError struct {
	CommandID string `json:"commandId"`
	Code      string `json:"code"`
	Message   string `json:"message"`
}

type CurationUploadBridge struct {
	ctx     context.Context
	service curationUploadService
	emitter EventEmitter
}

func NewCurationUploadBridge(ctx context.Context, service curationUploadService, emitter EventEmitter) *CurationUploadBridge {
	if ctx == nil {
		ctx = context.Background()
	}
	return &CurationUploadBridge{ctx: ctx, service: service, emitter: emitter}
}

func (bridge *CurationUploadBridge) RegisterHandlers(wailsApp *application.App) {
	if bridge == nil || wailsApp == nil {
		return
	}
	wailsApp.Event.On(CurationUploadCommandEvent, func(event *application.CustomEvent) {
		bridge.HandleCommand(event.Data)
	})
}

func (bridge *CurationUploadBridge) HandleCommand(data any) {
	if bridge == nil || bridge.emitter == nil {
		return
	}
	commandID, operation, textVersion, err := decodeCurationUploadCommand(data)
	if err != nil || bridge.service == nil {
		bridge.emitError(commandID, "invalid_command")
		return
	}
	var snapshot curation.UploadSnapshot
	var deletion *curation.DeletionReceipt
	switch operation {
	case "snapshot":
		snapshot = bridge.service.Snapshot()
	case "opt_in":
		snapshot, err = bridge.service.OptIn(textVersion)
	case "pause":
		snapshot, err = bridge.service.Pause()
	case "resume":
		snapshot, err = bridge.service.Resume()
	case "revoke":
		snapshot, err = bridge.service.Revoke()
	case "dispatch":
		err = bridge.service.DispatchNext(bridge.ctx)
		snapshot = bridge.service.Snapshot()
	case "delete_remote":
		var receipt curation.DeletionReceipt
		receipt, err = bridge.service.RequestRemoteDeletion(bridge.ctx)
		deletion = &receipt
		snapshot = bridge.service.Snapshot()
	default:
		bridge.emitError(commandID, "invalid_command")
		return
	}
	if err != nil {
		bridge.emitError(commandID, publicCurationUploadError(err))
		return
	}
	bridge.emitter.Emit(CurationUploadResultEvent, CurationUploadResult{
		ProtocolVersion: CurationUploadProtocolV1, CommandID: commandID, Snapshot: snapshot, Deletion: deletion,
	})
}

func decodeCurationUploadCommand(data any) (string, string, string, error) {
	encoded, err := json.Marshal(data)
	if err != nil {
		return "invalid-command", "", "", err
	}
	var command struct {
		ProtocolVersion string `json:"protocolVersion"`
		CommandID       string `json:"commandId"`
		Operation       string `json:"operation"`
		TextVersion     string `json:"textVersion,omitempty"`
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&command); err != nil || command.ProtocolVersion != CurationUploadProtocolV1 || command.CommandID == "" {
		return "invalid-command", "", "", errors.New("invalid command")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return "invalid-command", "", "", errors.New("invalid command")
	}
	return command.CommandID, command.Operation, command.TextVersion, nil
}

func publicCurationUploadError(err error) string {
	switch {
	case errors.Is(err, curation.ErrConsentRequired):
		return "consent_required"
	case errors.Is(err, curation.ErrQueuePaused):
		return "queue_paused"
	case errors.Is(err, curation.ErrQueueEmpty):
		return "queue_empty"
	case errors.Is(err, curation.ErrUploadDisabled):
		return "upload_disabled"
	case errors.Is(err, curation.ErrDispatchCanceled):
		return "dispatch_canceled"
	default:
		return "request_failed"
	}
}

func (bridge *CurationUploadBridge) emitError(commandID, code string) {
	message := "The curation request could not be completed."
	if code == "upload_disabled" {
		message = "Curation upload is disabled in this build."
	}
	bridge.emitter.Emit(CurationUploadErrorEvent, CurationUploadError{CommandID: commandID, Code: code, Message: message})
}
