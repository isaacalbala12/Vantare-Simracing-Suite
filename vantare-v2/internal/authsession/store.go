package authsession

import (
	"encoding/json"
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("protected auth session not found")

// Session is the minimum Supabase session material needed to restore login.
// It must only be persisted by an OS-protected implementation.
type Session struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

func (s Session) validate() error {
	if s.AccessToken == "" || s.RefreshToken == "" {
		return errors.New("access and refresh tokens are required")
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
		return Session{}, fmt.Errorf("decoding protected auth session: %w", err)
	}
	if err := session.validate(); err != nil {
		return Session{}, err
	}
	return session, nil
}
