package curation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var (
	ErrUploadDisabled   = errors.New("curation upload is disabled")
	ErrWorkerRejected   = errors.New("curation worker rejected request")
	ErrDispatchCanceled = errors.New("curation dispatch canceled before acceptance")
)

type UploadReceipt struct {
	Status         string    `json:"status"`
	SemanticDigest string    `json:"semanticDigest"`
	AcceptedAt     time.Time `json:"acceptedAt"`
	ExpiresAt      time.Time `json:"expiresAt"`
	RetentionDays  int       `json:"retentionDays"`
}

type DeletionReceipt struct {
	Status          string `json:"status"`
	TombstoneRef    string `json:"tombstoneRef"`
	ApplyWithinDays int    `json:"applyWithinDays"`
}

type WorkerClient struct {
	baseURL    *url.URL
	buildToken string
	httpClient *http.Client
}

func NewWorkerClient(endpoint, buildToken string, transport *http.Client) (*WorkerClient, error) {
	if strings.TrimSpace(endpoint) == "" {
		return nil, ErrUploadDisabled
	}
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Host == "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
		return nil, fmt.Errorf("invalid curation worker endpoint")
	}
	if parsed.Path != "" && parsed.Path != "/" {
		return nil, fmt.Errorf("curation worker endpoint must not contain a path")
	}
	host := parsed.Hostname()
	loopback := strings.EqualFold(host, "localhost")
	if ip := net.ParseIP(host); ip != nil {
		loopback = ip.IsLoopback()
	}
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && loopback) {
		return nil, fmt.Errorf("curation worker endpoint requires https or loopback http")
	}
	if strings.TrimSpace(buildToken) == "" {
		return nil, fmt.Errorf("curation worker build admission is not configured")
	}
	client := &http.Client{Timeout: 10 * time.Second}
	if transport != nil {
		clone := *transport
		client = &clone
		if client.Timeout == 0 {
			client.Timeout = 10 * time.Second
		}
	}
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}
	parsed.Path = strings.TrimSuffix(parsed.Path, "/")
	return &WorkerClient{baseURL: parsed, buildToken: buildToken, httpClient: client}, nil
}

func (client *WorkerClient) Upload(ctx context.Context, bundle CurationBundleV1, credentials UploadCredentials) (UploadReceipt, error) {
	data, err := bundle.MarshalStrict()
	if err != nil {
		return UploadReceipt{}, fmt.Errorf("encode curation bundle: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, client.baseURL.String()+"/v1/bundles", bytes.NewReader(data))
	if err != nil {
		return UploadReceipt{}, fmt.Errorf("create curation upload: %w", err)
	}
	request.Header.Set("content-type", "application/json")
	request.Header.Set("x-vantare-build-token", client.buildToken)
	request.Header.Set("x-vantare-upload-secret", credentials.UploadSecret)
	request.Header.Set("x-vantare-delete-secret", credentials.DeleteSecret)
	var receipt UploadReceipt
	if err := client.do(request, &receipt); err != nil {
		return UploadReceipt{}, err
	}
	if (receipt.Status != "accepted" && receipt.Status != "replay") || receipt.SemanticDigest == "" || receipt.AcceptedAt.IsZero() {
		return UploadReceipt{}, fmt.Errorf("%w: invalid upload receipt", ErrWorkerRejected)
	}
	return receipt, nil
}

func (client *WorkerClient) Delete(ctx context.Context, credentials UploadCredentials) (DeletionReceipt, error) {
	body, err := json.Marshal(struct {
		UploadID string `json:"uploadId"`
	}{UploadID: credentials.UploadID})
	if err != nil {
		return DeletionReceipt{}, fmt.Errorf("encode deletion request: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, client.baseURL.String()+"/v1/tombstones", bytes.NewReader(body))
	if err != nil {
		return DeletionReceipt{}, fmt.Errorf("create deletion request: %w", err)
	}
	request.Header.Set("content-type", "application/json")
	request.Header.Set("x-vantare-delete-secret", credentials.DeleteSecret)
	var receipt DeletionReceipt
	if err := client.do(request, &receipt); err != nil {
		return DeletionReceipt{}, err
	}
	if (receipt.Status != "accepted" && receipt.Status != "replay") || receipt.TombstoneRef == "" || receipt.ApplyWithinDays <= 0 {
		return DeletionReceipt{}, fmt.Errorf("%w: invalid deletion receipt", ErrWorkerRejected)
	}
	return receipt, nil
}

func (client *WorkerClient) do(request *http.Request, destination any) error {
	response, err := client.httpClient.Do(request)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(request.Context().Err(), context.Canceled) {
			return ErrDispatchCanceled
		}
		return fmt.Errorf("curation worker request: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusCreated {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 8<<10))
		return fmt.Errorf("%w: status %d", ErrWorkerRejected, response.StatusCode)
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 8<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return fmt.Errorf("%w: decode receipt", ErrWorkerRejected)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return fmt.Errorf("%w: trailing receipt data", ErrWorkerRejected)
	}
	return nil
}
