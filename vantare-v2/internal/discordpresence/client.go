package discordpresence

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"
)

const (
	defaultRetryInterval  = 10 * time.Second
	defaultConnectTimeout = 250 * time.Millisecond
	maxPipeCandidates     = 10
	rpcVersion            = 1
	opHandshake           = 0
	opFrame               = 1
)

// Activity is the small, product-owned subset of Discord Rich Presence that
// Vantare publishes. It contains no telemetry payload or user identity.
type Activity struct {
	Details        string
	State          string
	StartTimestamp int64
}

type Config struct {
	ClientID       string
	PID            int
	RetryInterval  time.Duration
	ConnectTimeout time.Duration
	Logf           func(format string, args ...any)
	Dial           func(context.Context, string) (io.ReadWriteCloser, error)
}

type Client struct {
	clientID       string
	pid            int
	retryInterval  time.Duration
	connectTimeout time.Duration
	logger         func(string, ...any)
	dial           func(context.Context, string) (io.ReadWriteCloser, error)

	mu       sync.Mutex
	activity *Activity
	cancel   context.CancelFunc
	done     chan struct{}
	wake     chan struct{}
}

func New(config Config) *Client {
	retryInterval := config.RetryInterval
	if retryInterval <= 0 {
		retryInterval = defaultRetryInterval
	}
	connectTimeout := config.ConnectTimeout
	if connectTimeout <= 0 {
		connectTimeout = defaultConnectTimeout
	}
	dial := config.Dial
	if dial == nil {
		dial = dialDiscordPipe
	}
	return &Client{
		clientID:       config.ClientID,
		pid:            config.PID,
		retryInterval:  retryInterval,
		connectTimeout: connectTimeout,
		logger:         config.Logf,
		dial:           dial,
		wake:           make(chan struct{}, 1),
	}
}

// SetActivity stores the latest activity and wakes the single owner goroutine.
// Calling it before Start is supported and avoids a startup race.
func (c *Client) SetActivity(activity Activity) {
	c.mu.Lock()
	if c.activity != nil && *c.activity == activity {
		c.mu.Unlock()
		return
	}
	copy := activity
	c.activity = &copy
	c.mu.Unlock()
	c.signal()
}

func (c *Client) ClearActivity() {
	c.mu.Lock()
	if c.activity == nil {
		c.mu.Unlock()
		return
	}
	c.activity = nil
	c.mu.Unlock()
	c.signal()
}

func (c *Client) Start(parent context.Context) error {
	if parent == nil {
		return errors.New("discord presence start requires a context")
	}
	if c.clientID == "" {
		return errors.New("discord presence client ID is empty")
	}

	c.mu.Lock()
	if c.cancel != nil {
		c.mu.Unlock()
		return nil
	}
	ctx, cancel := context.WithCancel(parent)
	c.cancel = cancel
	c.done = make(chan struct{})
	done := c.done
	c.mu.Unlock()

	go c.run(ctx, done)
	return nil
}

func (c *Client) Close() error {
	c.mu.Lock()
	cancel := c.cancel
	done := c.done
	c.mu.Unlock()
	if cancel == nil {
		return nil
	}
	cancel()
	<-done

	c.mu.Lock()
	c.cancel = nil
	c.done = nil
	c.mu.Unlock()
	return nil
}

func (c *Client) signal() {
	select {
	case c.wake <- struct{}{}:
	default:
	}
}

func (c *Client) currentActivity() *Activity {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.activity == nil {
		return nil
	}
	copy := *c.activity
	return &copy
}

func (c *Client) run(ctx context.Context, done chan struct{}) {
	defer close(done)

	retry := time.NewTicker(c.retryInterval)
	defer retry.Stop()

	var conn io.ReadWriteCloser
	for {
		if conn == nil {
			if activity := c.currentActivity(); activity != nil {
				candidate, err := c.connect(ctx)
				if err == nil {
					if err = c.handshake(candidate); err != nil {
						_ = candidate.Close()
						c.logf("handshake failed: %v", err)
					} else if err = c.writeActivity(candidate, activity); err != nil {
						_ = candidate.Close()
						c.logf("initial activity failed: %v", err)
					} else {
						conn = candidate
					}
				}
			}
		}

		select {
		case <-ctx.Done():
			if conn != nil {
				_ = c.writeActivity(conn, nil)
				_ = conn.Close()
			}
			return
		case <-c.wake:
			if conn != nil {
				if err := c.writeActivity(conn, c.currentActivity()); err != nil {
					_ = conn.Close()
					conn = nil
					c.logf("activity update failed: %v", err)
				}
			}
		case <-retry.C:
			if conn != nil {
				if err := c.writeActivity(conn, c.currentActivity()); err != nil {
					_ = conn.Close()
					conn = nil
					c.logf("presence keepalive failed: %v", err)
				}
			}
		}
	}
}

func (c *Client) connect(parent context.Context) (io.ReadWriteCloser, error) {
	for index := 0; index < maxPipeCandidates; index++ {
		attemptCtx, cancel := context.WithTimeout(parent, c.connectTimeout)
		conn, err := c.dial(attemptCtx, discordPipePath(index))
		cancel()
		if err == nil {
			return conn, nil
		}
		if parent.Err() != nil {
			return nil, parent.Err()
		}
	}
	return nil, errors.New("Discord Desktop IPC pipe not available")
}

func (c *Client) handshake(conn io.Writer) error {
	return writeFrame(conn, opHandshake, map[string]any{
		"v":         rpcVersion,
		"client_id": c.clientID,
	})
}

func (c *Client) writeActivity(conn io.Writer, activity *Activity) error {
	var payload *activityPayload
	if activity != nil {
		payload = &activityPayload{
			Type:    0,
			Details: activity.Details,
			State:   activity.State,
			Timestamps: &timestampsPayload{
				Start: activity.StartTimestamp,
			},
		}
	}
	return writeFrame(conn, opFrame, rpcCommand{
		Cmd: "SET_ACTIVITY",
		Args: setActivityArgs{
			PID:      c.pid,
			Activity: payload,
		},
		Nonce: newNonce(),
	})
}

type rpcCommand struct {
	Cmd   string `json:"cmd"`
	Args  any    `json:"args"`
	Nonce string `json:"nonce"`
}

type setActivityArgs struct {
	PID      int              `json:"pid"`
	Activity *activityPayload `json:"activity"`
}

type activityPayload struct {
	Type       int                `json:"type"`
	Details    string             `json:"details,omitempty"`
	State      string             `json:"state,omitempty"`
	Timestamps *timestampsPayload `json:"timestamps,omitempty"`
}

type timestampsPayload struct {
	Start int64 `json:"start,omitempty"`
}

func writeFrame(writer io.Writer, opcode int, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal Discord RPC frame: %w", err)
	}
	if uint64(len(body)) > uint64(^uint32(0)) {
		return errors.New("Discord RPC frame is too large")
	}
	header := make([]byte, 8)
	binary.LittleEndian.PutUint32(header[0:4], uint32(opcode))
	binary.LittleEndian.PutUint32(header[4:8], uint32(len(body)))
	if _, err := writer.Write(header); err != nil {
		return fmt.Errorf("write Discord RPC header: %w", err)
	}
	if _, err := writer.Write(body); err != nil {
		return fmt.Errorf("write Discord RPC body: %w", err)
	}
	return nil
}

func newNonce() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err == nil {
		return hex.EncodeToString(bytes[:])
	}
	return fmt.Sprintf("%x", time.Now().UnixNano())
}

func (c *Client) logf(format string, args ...any) {
	if c.logger != nil {
		c.logger(format, args...)
	}
}

func discordPipePath(index int) string {
	return fmt.Sprintf(`\\?\pipe\discord-ipc-%d`, index)
}
