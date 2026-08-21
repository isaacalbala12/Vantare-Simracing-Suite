package curation

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/vantare/overlays/v2/internal/protectedstore"
)

// ProtectedCredentialStore keeps uploadSecret/deleteSecret outside the queue
// JSON in the operating-system protected store (Windows Credential Manager).
type ProtectedCredentialStore struct {
	store *protectedstore.Store
}

func NewProtectedCredentialStore(target string) *ProtectedCredentialStore {
	return &ProtectedCredentialStore{store: protectedstore.New(target)}
}

func (store *ProtectedCredentialStore) Save(credentials UploadCredentials) error {
	if err := validateCredentials(credentials); err != nil {
		return err
	}
	data, err := json.Marshal(credentials)
	if err != nil {
		return fmt.Errorf("encode curation credentials: %w", err)
	}
	if err := store.store.Save(data); err != nil {
		return fmt.Errorf("save protected curation credentials: %w", err)
	}
	return nil
}

func (store *ProtectedCredentialStore) Load() (UploadCredentials, error) {
	data, err := store.store.Load()
	if errors.Is(err, protectedstore.ErrNotFound) {
		return UploadCredentials{}, ErrCredentialsNotFound
	}
	if err != nil {
		return UploadCredentials{}, fmt.Errorf("load protected curation credentials: %w", err)
	}
	var credentials UploadCredentials
	if err := json.Unmarshal(data, &credentials); err != nil {
		return UploadCredentials{}, fmt.Errorf("decode protected curation credentials")
	}
	if err := validateCredentials(credentials); err != nil {
		return UploadCredentials{}, err
	}
	return credentials, nil
}

func (store *ProtectedCredentialStore) Delete() error {
	if err := store.store.Delete(); err != nil {
		return fmt.Errorf("delete protected curation credentials: %w", err)
	}
	return nil
}

func validateCredentials(credentials UploadCredentials) error {
	if !validIdentifier(credentials.UploadID, 128) ||
		len(credentials.UploadSecret) < 32 || len(credentials.UploadSecret) > 256 ||
		len(credentials.DeleteSecret) < 32 || len(credentials.DeleteSecret) > 256 ||
		credentials.UploadSecret == credentials.DeleteSecret ||
		strings.ContainsAny(credentials.UploadSecret+credentials.DeleteSecret, "\r\n") {
		return fmt.Errorf("protected curation credentials are invalid")
	}
	return nil
}
