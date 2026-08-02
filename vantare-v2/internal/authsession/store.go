package authsession

import (
	"encoding/json"
	"errors"
	"fmt"
)

var (
	ErrNotFound                    = errors.New("protected auth session not found")
	ErrInvalidSession              = errors.New("protected auth session is invalid")
	ErrInvalidStoredSessionRemoved = errors.New("invalid protected auth session removed")
)

// Session is the minimum Supabase session material needed to restore login.
// It must only be persisted by an OS-protected implementation.
type Session struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

func (s Session) validate() error {
	if s.AccessToken == "" || s.RefreshToken == "" {
		return fmt.Errorf("%w: access and refresh tokens are required", ErrInvalidSession)
	}
	return nil
}

func marshal(session Session) ([]byte, error) {
	if err := session.validate(); err != nil {
		return nil, err
	}
	data, err := json.Marshal(session)
	if err != nil {
		return nil, fmt.Errorf("encoding protected auth session: %w", err)
	}
	return data, nil
}

func unmarshal(data []byte) (Session, error) {
	var session Session
	if err := json.Unmarshal(data, &session); err != nil {
		return Session{}, fmt.Errorf("%w: decoding protected auth session: %v", ErrInvalidSession, err)
	}
	if err := session.validate(); err != nil {
		return Session{}, err
	}
	return session, nil
}
