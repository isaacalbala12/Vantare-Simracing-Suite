package notify

import (
	"errors"
	"fmt"
	"sync"
	"time"
	"unicode/utf8"
)

// CenterContractVersion versions the snapshot schema the frontend consumes.
// Bump it only when the shape changes incompatibly.
const CenterContractVersion = 1

// centerLimit bounds the recent-notification store; the oldest entries are
// evicted first. It is a recovery surface, not an archive.
const centerLimit = 50

// Bounds for free-form payloads: a notification is a pointer to detail, not
// the detail itself.
const (
	maxCauseLen  = 240
	maxParams    = 8
	maxParamLen  = 120
	maxKeyLen    = 120
	maxFallback  = 240
	maxDedupeLen = 160
)

// Source is a closed set. Anything not listed — the Spotter's race output
// included — can never produce a center record, by construction.
type Source string

const (
	SourceUpdater  Source = "updater"
	SourceLauncher Source = "launcher"
	SourceSystem   Source = "system"
)

// Severity is a closed set: warning exists for partial results.
type Severity string

const (
	SeverityInfo    Severity = "info"
	SeverityWarning Severity = "warning"
	SeverityError   Severity = "error"
)

// ErrSourceDenied rejects a record whose source has no channel policy. This
// is the Spotter exclusion: its output is race overlay/audio and it has no
// entry in the matrix, so Publish refuses it.
var ErrSourceDenied = errors.New("notification source has no channel policy")

// Action is the only thing a record may offer. The backend allowlist is the
// boundary: the frontend never supplies destinations.
type Action struct {
	Kind   string `json:"kind"`   // only "navigate"
	Target string `json:"target"` // allowlisted semantic target
}

// actionTargets are the destinations a record action may resolve to. Adding
// one is a contract decision, not a UI convenience.
var actionTargets = map[string]bool{
	"settings:updates": true,
	"launcher":         true,
}

// Record is one entry in the center. Title and text are i18n keys resolved
// by the frontend; Fallback carries the plain sentence the Windows toast
// channel needs, and never crosses to the frontend.
type Record struct {
	V             int               `json:"v"`
	ID            string            `json:"id"`
	Source        Source            `json:"source"`
	Severity      Severity          `json:"severity"`
	OccurredAt    int64             `json:"occurredAt"` // epoch ms
	DedupeKey     string            `json:"dedupeKey"`
	TitleKey      string            `json:"titleKey"`
	TextKey       string            `json:"textKey,omitempty"`
	Params        map[string]string `json:"params,omitempty"`
	ConcreteCause string            `json:"concreteCause,omitempty"`
	Action        *Action           `json:"action,omitempty"`
	Unread        bool              `json:"unread"`
	Fallback      string            `json:"-"`
}

// Snapshot is the full center state published on every mutation. Records go
// newest first. Revision orders snapshots so a stale delivery is droppable.
type Snapshot struct {
	V        int      `json:"v"`
	Revision uint64   `json:"revision"`
	Records  []Record `json:"records"`
	Unread   int      `json:"unread"`
}

// channelPolicy decides which channels a source may reach. hub is the center
// list, windows the OS toast, history retention in the store.
type channelPolicy struct {
	hub     bool
	windows bool
	history bool
}

var channelPolicies = map[Source]channelPolicy{
	SourceUpdater:  {hub: true, windows: true, history: true},
	SourceLauncher: {hub: true, windows: true, history: true},
	// The manual test keeps its own direct path that deliberately ignores
	// mute/minimized, so the center never sends it to Windows.
	SourceSystem: {hub: true, windows: false, history: true},
}

// CenterOptions wires the center without it knowing about Wails or settings.
type CenterOptions struct {
	Now  func() time.Time
	Emit func(Snapshot)
	// Muted gates the hub alert surface per source: a muted source is still
	// recorded in history, but lands already read so it raises no badge.
	// Windows toasts keep their own gate (SystemEnabled + platform).
	Muted func(Source) bool
	// Windows is the OS toast channel. It is invoked synchronously by Publish
	// only for new occurrences; the caller decides whether to run it async.
	Windows func(body string)
}

// Center is the bounded store of recent notifications. All methods are safe
// for concurrent use: records and snapshot copies leave the lock clean.
type Center struct {
	opts     CenterOptions
	mu       sync.Mutex
	records  []Record
	seq      uint64
	revision uint64
}

func NewCenter(opts CenterOptions) *Center {
	if opts.Now == nil {
		opts.Now = time.Now
	}
	return &Center{opts: opts}
}

func validateRecord(rec *Record) error {
	policy, ok := channelPolicies[rec.Source]
	if !ok || !policy.hub {
		return ErrSourceDenied
	}
	switch rec.Severity {
	case SeverityInfo, SeverityWarning, SeverityError:
	default:
		return fmt.Errorf("invalid severity %q", rec.Severity)
	}
	if rec.TitleKey == "" || len(rec.TitleKey) > maxKeyLen || len(rec.TextKey) > maxKeyLen {
		return fmt.Errorf("invalid title/text key")
	}
	if rec.DedupeKey == "" || len(rec.DedupeKey) > maxDedupeLen {
		return fmt.Errorf("invalid dedupe key")
	}
	// Cause y fallback son campos de display: se truncan a su cota en vez de
	// rechazar el registro — un error largo no debe hacer desaparecer el aviso.
	rec.ConcreteCause = truncateRunes(rec.ConcreteCause, maxCauseLen)
	rec.Fallback = truncateRunes(rec.Fallback, maxFallback)
	if len(rec.Params) > maxParams {
		return fmt.Errorf("params exceed bounds")
	}
	for k, v := range rec.Params {
		if len(k) > maxKeyLen || len(v) > maxParamLen {
			return fmt.Errorf("params exceed bounds")
		}
	}
	if rec.Action != nil {
		if rec.Action.Kind != "navigate" || !actionTargets[rec.Action.Target] {
			return fmt.Errorf("invalid action")
		}
	}
	return nil
}

// truncateRunes cuts at a byte limit without splitting a rune: s[:max] may
// land mid-character and produce invalid UTF-8 on screen.
func truncateRunes(s string, max int) string {
	if len(s) <= max {
		return s
	}
	for max > 0 && !utf8.RuneStart(s[max]) {
		max--
	}
	return s[:max]
}

// sameSignature reports whether the incoming record describes the same state
// as the stored one — a repetition — rather than a new occurrence.
func sameSignature(a, b *Record) bool {
	if a.Severity != b.Severity || a.TitleKey != b.TitleKey || a.TextKey != b.TextKey ||
		a.ConcreteCause != b.ConcreteCause || len(a.Params) != len(b.Params) {
		return false
	}
	for k, v := range a.Params {
		if b.Params[k] != v {
			return false
		}
	}
	return true
}

// Publish validates and stores a record. Same-dedupeKey repetitions update
// the entry quietly: no unread flag, no toast. A changed signature counts as
// a new occurrence: it resurfaces unread and may toast on Windows.
func (c *Center) Publish(rec Record) error {
	if err := validateRecord(&rec); err != nil {
		return err
	}
	muted := c.opts.Muted != nil && c.opts.Muted(rec.Source)
	policy := channelPolicies[rec.Source]

	c.mu.Lock()
	now := c.opts.Now().UnixMilli()
	newOccurrence := true
	if idx := indexOfDedupeKey(c.records, rec.DedupeKey); idx >= 0 {
		entry := c.records[idx]
		if sameSignature(&entry, &rec) {
			entry.OccurredAt = now // last seen
			newOccurrence = false
		} else {
			entry = rec
			entry.V = CenterContractVersion
			entry.ID = c.records[idx].ID
			entry.OccurredAt = now
			entry.Unread = !muted
		}
		// Keep newest first.
		copy(c.records[1:idx+1], c.records[:idx])
		c.records[0] = entry
	} else {
		rec.V = CenterContractVersion
		c.seq++
		rec.ID = fmt.Sprintf("n-%d", c.seq)
		rec.OccurredAt = now
		rec.Unread = !muted
		c.records = append([]Record{rec}, c.records...)
		if len(c.records) > centerLimit {
			c.records = c.records[:centerLimit]
		}
	}
	c.revision++
	snapshot := c.snapshotLocked()
	c.mu.Unlock()

	if c.opts.Emit != nil {
		c.opts.Emit(snapshot)
	}
	if newOccurrence && policy.windows && !muted && c.opts.Windows != nil && rec.Fallback != "" {
		c.opts.Windows(rec.Fallback)
	}
	return nil
}

func indexOfDedupeKey(records []Record, key string) int {
	for i := range records {
		if records[i].DedupeKey == key {
			return i
		}
	}
	return -1
}

// Snapshot returns the current center state for reconnection: a webview that
// reloads asks for this once instead of missing everything emitted meanwhile.
func (c *Center) Snapshot() Snapshot {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.snapshotLocked()
}

func (c *Center) snapshotLocked() Snapshot {
	records := make([]Record, len(c.records))
	copy(records, c.records)
	unread := 0
	for i := range records {
		if records[i].Unread {
			unread++
		}
	}
	return Snapshot{V: CenterContractVersion, Revision: c.revision, Records: records, Unread: unread}
}

// MarkRead clears the unread flag on one record, or on all of them when id
// is "all". Unknown ids are ignored rather than erroring: a stale click is
// not a failure.
func (c *Center) MarkRead(id string) {
	c.mu.Lock()
	if id == "all" {
		for i := range c.records {
			c.records[i].Unread = false
		}
	} else {
		for i := range c.records {
			if c.records[i].ID == id {
				c.records[i].Unread = false
				break
			}
		}
	}
	c.revision++
	snapshot := c.snapshotLocked()
	c.mu.Unlock()
	if c.opts.Emit != nil {
		c.opts.Emit(snapshot)
	}
}

// Clear empties the store. History retention is in-process only.
func (c *Center) Clear() {
	c.mu.Lock()
	c.records = nil
	c.revision++
	snapshot := c.snapshotLocked()
	c.mu.Unlock()
	if c.opts.Emit != nil {
		c.opts.Emit(snapshot)
	}
}

// ResolveAction returns the stored action of a record after revalidating it
// against the allowlist — the payload stored is the payload checked.
func (c *Center) ResolveAction(id string) (*Action, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i := range c.records {
		if c.records[i].ID == id {
			action := c.records[i].Action
			if action == nil || action.Kind != "navigate" || !actionTargets[action.Target] {
				return nil, fmt.Errorf("record %s has no valid action", id)
			}
			resolved := *action
			return &resolved, nil
		}
	}
	return nil, fmt.Errorf("record %s not found", id)
}
