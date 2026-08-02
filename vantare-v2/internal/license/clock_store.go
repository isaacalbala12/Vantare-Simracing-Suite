package license

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/vantare/overlays/v2/internal/protectedstore"
)

type ProtectedClockStore struct{ store *protectedstore.Store }

func NewProtectedClockStore(target string) *ProtectedClockStore {
	return &ProtectedClockStore{store: protectedstore.New(target)}
}

func (s *ProtectedClockStore) Load() (ClockState, error) {
	data, err := s.store.Load()
	if errors.Is(err, protectedstore.ErrNotFound) {
		return ClockState{}, ErrClockStateNotFound
	}
	if err != nil {
		return ClockState{}, err
	}
	var state ClockState
	if err := json.Unmarshal(data, &state); err != nil {
		return ClockState{}, fmt.Errorf("decoding protected clock: %w", err)
	}
	return state, nil
}

func (s *ProtectedClockStore) Save(state ClockState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("encoding protected clock: %w", err)
	}
	return s.store.Save(data)
}
