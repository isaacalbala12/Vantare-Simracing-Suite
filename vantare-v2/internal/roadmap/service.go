package roadmap

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrNotOwner = errors.New("owner role required")

var itemID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

type Localized struct {
	ES string `json:"es"`
	EN string `json:"en"`
	PT string `json:"pt"`
	IT string `json:"it"`
}

type Item struct {
	ID      string    `json:"id"`
	Section string    `json:"section"`
	Title   Localized `json:"title"`
	Body    Localized `json:"body"`
}

type Document struct {
	SchemaVersion int    `json:"schemaVersion"`
	Items         []Item `json:"items"`
}

type Publication struct {
	ID          string    `json:"id"`
	Document    Document  `json:"document"`
	PublishedAt time.Time `json:"published_at,omitempty"`
}

func (d Document) Validate() error {
	if d.SchemaVersion != 1 || len(d.Items) > 40 {
		return errors.New("invalid roadmap version or item count")
	}
	seen := make(map[string]bool, len(d.Items))
	for _, item := range d.Items {
		if !itemID.MatchString(item.ID) || seen[item.ID] {
			return errors.New("invalid or duplicate roadmap item ID")
		}
		seen[item.ID] = true
		if item.Section != "now" && item.Section != "next" && item.Section != "done" {
			return errors.New("invalid roadmap section")
		}
		if strings.TrimSpace(item.Title.ES) == "" {
			return errors.New("roadmap Spanish title is missing")
		}
		for _, title := range []string{item.Title.ES, item.Title.EN, item.Title.PT, item.Title.IT} {
			if utf8.RuneCountInString(title) > 120 {
				return errors.New("roadmap title is too long")
			}
		}
		for _, body := range []string{item.Body.ES, item.Body.EN, item.Body.PT, item.Body.IT} {
			if utf8.RuneCountInString(body) > 600 {
				return errors.New("roadmap body is too long")
			}
		}
	}
	encoded, err := json.Marshal(d)
	if err != nil {
		return fmt.Errorf("encode roadmap: %w", err)
	}
	if len(encoded) > 40000 {
		return errors.New("roadmap is too large")
	}
	return nil
}

type Service struct {
	client  *http.Client
	baseURL string
	anonKey string
}

func NewService(baseURL, anonKey string) *Service {
	return &Service{
		client:  &http.Client{Timeout: 20 * time.Second},
		baseURL: strings.TrimRight(baseURL, "/"),
		anonKey: anonKey,
	}
}

func (s *Service) Current(ctx context.Context) (*Publication, error) {
	var rows []Publication
	if err := s.rpc(ctx, "", "visual_roadmap_current", map[string]any{}, &rows); err != nil {
		return nil, err
	}
	return firstValid(rows)
}

func (s *Service) MyDraft(ctx context.Context, token string) (*Publication, error) {
	var rows []Publication
	if err := s.rpc(ctx, token, "visual_roadmap_my_draft", map[string]any{}, &rows); err != nil {
		return nil, err
	}
	return firstValid(rows)
}

func firstValid(rows []Publication) (*Publication, error) {
	if len(rows) == 0 {
		return nil, nil
	}
	if err := rows[0].Document.Validate(); err != nil {
		return nil, fmt.Errorf("invalid remote roadmap: %w", err)
	}
	return &rows[0], nil
}

func (s *Service) SaveDraft(ctx context.Context, token string, document Document) (string, error) {
	if err := document.Validate(); err != nil {
		return "", err
	}
	var id string
	err := s.rpc(ctx, token, "visual_roadmap_draft_save", map[string]any{"p_document": document}, &id)
	return id, err
}

func (s *Service) Publish(ctx context.Context, token, draftID string) error {
	if !itemID.MatchString(draftID) {
		return errors.New("invalid draft ID")
	}
	var id string
	return s.rpc(ctx, token, "visual_roadmap_publish", map[string]any{"p_draft_id": draftID}, &id)
}

func (s *Service) rpc(ctx context.Context, token, name string, payload any, out any) error {
	if s.baseURL == "" || s.anonKey == "" {
		return errors.New("roadmap service is not configured")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode %s: %w", name, err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/rest/v1/rpc/"+name, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("prepare %s: %w", name, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", s.anonKey)
	bearer := token
	if bearer == "" {
		bearer = s.anonKey
	}
	req.Header.Set("Authorization", "Bearer "+bearer)
	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("call %s: %w", name, err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("read %s: %w", name, err)
	}
	if resp.StatusCode != http.StatusOK {
		if strings.Contains(strings.ToLower(string(data)), "owner role required") {
			return ErrNotOwner
		}
		return fmt.Errorf("%s failed: status %d", name, resp.StatusCode)
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("decode %s: %w", name, err)
	}
	return nil
}
