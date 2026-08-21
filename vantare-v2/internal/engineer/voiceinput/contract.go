// Package voiceinput contains the optional, experimental Engineer voice-input
// lane. Audio and transcripts are ephemeral and never cross its public health
// boundary.
package voiceinput

import (
	"context"
	"errors"
	"time"

	"github.com/vantare/overlays/v2/internal/engineer/commands"
)

const (
	ProtocolV1       = "vantare.engineer.voice-input-host.v1"
	DefaultMaxWindow = 5 * time.Second
)

var (
	ErrHostUnavailable = errors.New("engineer voice-input host is unavailable")
	ErrHostProtocol    = errors.New("engineer voice-input host protocol is invalid")
	ErrActionsDisabled = errors.New("engineer voice actions are disabled in the experimental lane")
)

type State string

const (
	StateDisabled     State = "disabled"
	StateUnavailable  State = "unavailable"
	StateIdle         State = "idle"
	StateCapturing    State = "capturing"
	StateTranscribing State = "transcribing"
	StateError        State = "error"
)

// Health deliberately contains aggregate state and counters only.
type Health struct {
	Experimental    bool   `json:"experimental"`
	Enabled         bool   `json:"enabled"`
	State           State  `json:"state"`
	PTTCaptures     uint64 `json:"pttCaptures"`
	WakeCaptures    uint64 `json:"wakeCaptures"`
	Transcriptions  uint64 `json:"transcriptions"`
	Queries         uint64 `json:"queries"`
	RejectedActions uint64 `json:"rejectedActions"`
	Errors          uint64 `json:"errors"`
}

type Capture struct {
	ID        string
	PTTID     string
	MaxWindow time.Duration
}

// Host owns microphone capture and STT in one child process. Implementations
// must keep PCM and transcripts in memory and join every child on Stop.
type Host interface {
	Start(context.Context) error
	Begin(context.Context, Capture) error
	Finish(context.Context, Capture) (string, error)
	Cancel(context.Context, Capture) error
	Stop(context.Context) error
	WakeEvents() <-chan string
}

type TurnPublisher interface {
	PublishVoiceTurn(context.Context, commands.Turn, commands.Locale) error
}

type LifecycleProvider func() commands.DialogueLifecycle

// UnavailableQueryPort is the production F5 fail-closed boundary until a
// canonical read-only projection is explicitly wired for each query.
type UnavailableQueryPort struct{}

func (UnavailableQueryPort) ResolveQuery(context.Context, commands.QueryRequest) (commands.QueryResult, error) {
	return commands.QueryResult{}, ErrHostUnavailable
}

// DisabledActionPort makes the F5 query-only boundary explicit at the router.
type DisabledActionPort struct{}

func (DisabledActionPort) ProposeAction(context.Context, commands.ActionRequest) (commands.ActionProposal, error) {
	return commands.ActionProposal{}, ErrActionsDisabled
}

func (DisabledActionPort) ApplyAction(context.Context, commands.ConfirmedAction) (commands.ActionResult, error) {
	return commands.ActionResult{}, ErrActionsDisabled
}
