package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const operationalTimeout = 15 * time.Second

var operationalRoles = map[string]bool{
	"tester":         true,
	"nightly_tester": true,
	"owner":          true,
}

type operationalRequest struct {
	UserID        string  `json:"p_user_id"`
	Role          string  `json:"p_role"`
	Action        string  `json:"p_action"`
	ActorRef      string  `json:"p_actor_ref"`
	Reason        string  `json:"p_reason"`
	CorrelationID string  `json:"p_correlation_id"`
	ExpiresAt     *string `json:"p_expires_at"`
}

type operationalAssignment struct {
	Outcome       string  `json:"outcome,omitempty"`
	Role          string  `json:"role"`
	Status        string  `json:"status"`
	ExpiresAt     *string `json:"expires_at"`
	PolicyVersion int     `json:"policy_version,omitempty"`
}

type legacyGrantPreview struct {
	ActiveCount  int      `json:"active_count"`
	Capabilities []string `json:"capabilities"`
}

type legacyRetirementResult struct {
	Outcome      string `json:"outcome"`
	RetiredCount int    `json:"retired_count"`
}

func runOperationalAccess(args []string, output io.Writer) error {
	if len(args) < 2 {
		return fmt.Errorf("uso: vantare-admin operational-access <preview|grant|revoke|legacy-preview|legacy-retire> <user_uuid> ...")
	}
	baseURL := os.Getenv("SUPABASE_URL")
	key := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	client := &http.Client{Timeout: operationalTimeout}

	switch args[0] {
	case "preview":
		if len(args) != 2 {
			return fmt.Errorf("uso: vantare-admin operational-access preview <user_uuid>")
		}
		assignments, err := previewOperationalAccess(client, baseURL, key, args[1])
		if err != nil {
			return err
		}
		return writeOperationalPreview(output, args[1], assignments)
	case "grant", "revoke":
		return runOperationalMutation(client, output, baseURL, key, args)
	case "legacy-preview":
		if len(args) != 2 {
			return fmt.Errorf("uso: vantare-admin operational-access legacy-preview <user_uuid>")
		}
		return writeLegacyPreview(output, args[1], client, baseURL, key)
	case "legacy-retire":
		return runLegacyRetirement(client, output, baseURL, key, args)
	default:
		return fmt.Errorf("acción operativa desconocida: %s", args[0])
	}
}

func runLegacyRetirement(client *http.Client, output io.Writer, baseURL, key string, args []string) error {
	if len(args) < 5 || len(args) > 6 || (len(args) == 6 && args[5] != "--apply") {
		return fmt.Errorf("uso: vantare-admin operational-access legacy-retire <user_uuid> <actor_ref> <reason> <correlation_id> [--apply]")
	}
	if err := writeLegacyPreview(output, args[1], client, baseURL, key); err != nil {
		return fmt.Errorf("previsualización obligatoria: %w", err)
	}
	if len(args) != 6 {
		fmt.Fprintln(output, "mode=dry-run writes=0; añade --apply solo tras revisar backup y rollback")
		return nil
	}
	body, err := json.Marshal(map[string]string{
		"p_user_id": args[1], "p_actor_ref": args[2],
		"p_reason": args[3], "p_correlation_id": args[4],
	})
	if err != nil {
		return err
	}
	var result []legacyRetirementResult
	if err := operationalRPC(client, baseURL, key, "operational_legacy_grant_retire", body, &result); err != nil {
		return err
	}
	if len(result) != 1 {
		return fmt.Errorf("respuesta de retiro legacy inesperada: %d filas", len(result))
	}
	fmt.Fprintf(output, "mode=apply outcome=%s retired=%d\n", result[0].Outcome, result[0].RetiredCount)
	return nil
}

func writeLegacyPreview(output io.Writer, userID string, client *http.Client, baseURL, key string) error {
	body, err := json.Marshal(map[string]string{"p_user_id": userID})
	if err != nil {
		return err
	}
	var result []legacyGrantPreview
	if err := operationalRPC(client, baseURL, key, "operational_legacy_grant_preview", body, &result); err != nil {
		return err
	}
	if len(result) != 1 || len(userID) < 8 {
		return fmt.Errorf("respuesta de preview legacy inválida")
	}
	fmt.Fprintf(output, "target=…%s legacy_active=%d capabilities=%s\n", userID[len(userID)-8:], result[0].ActiveCount, strings.Join(result[0].Capabilities, ","))
	return nil
}

func runOperationalMutation(client *http.Client, output io.Writer, baseURL, key string, args []string) error {
	if len(args) < 6 {
		return fmt.Errorf("uso: vantare-admin operational-access <grant|revoke> <user_uuid> <role> <actor_ref> <reason> <correlation_id> [expires_at] [--apply]")
	}
	action, userID, role := args[0], args[1], args[2]
	if !operationalRoles[role] {
		return fmt.Errorf("rol inválido: %s", role)
	}
	apply := args[len(args)-1] == "--apply"
	tail := args[6:]
	if apply {
		tail = args[6 : len(args)-1]
	}
	if len(tail) > 1 || (action == "revoke" && len(tail) != 0) {
		return fmt.Errorf("expires_at solo se admite una vez al conceder acceso")
	}
	var expiresAt *string
	if len(tail) == 1 {
		if _, err := time.Parse(time.RFC3339, tail[0]); err != nil {
			return fmt.Errorf("expires_at debe usar RFC3339: %w", err)
		}
		expiresAt = &tail[0]
	}
	request := operationalRequest{
		UserID:        userID,
		Role:          role,
		Action:        action,
		ActorRef:      args[3],
		Reason:        args[4],
		CorrelationID: args[5],
		ExpiresAt:     expiresAt,
	}

	current, err := previewOperationalAccess(client, baseURL, key, userID)
	if err != nil {
		return fmt.Errorf("previsualización obligatoria: %w", err)
	}
	if err := writeOperationalPreview(output, userID, current); err != nil {
		return err
	}
	fmt.Fprintf(output, "proposed action=%s role=%s expires=%s\n", action, role, displayExpiry(expiresAt))
	if !apply {
		fmt.Fprintln(output, "mode=dry-run writes=0; añade --apply solo tras revisar backup y rollback")
		return nil
	}

	result, err := setOperationalAccess(client, baseURL, key, request)
	if err != nil {
		return err
	}
	if len(result) != 1 {
		return fmt.Errorf("respuesta operativa inesperada: %d filas", len(result))
	}
	fmt.Fprintf(output, "mode=apply outcome=%s role=%s status=%s expires=%s\n", result[0].Outcome, result[0].Role, result[0].Status, displayExpiry(result[0].ExpiresAt))
	return nil
}

func previewOperationalAccess(client *http.Client, baseURL, key, userID string) ([]operationalAssignment, error) {
	body, err := json.Marshal(map[string]string{"p_user_id": userID})
	if err != nil {
		return nil, err
	}
	var result []operationalAssignment
	if err := operationalRPC(client, baseURL, key, "operational_access_preview", body, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func setOperationalAccess(client *http.Client, baseURL, key string, request operationalRequest) ([]operationalAssignment, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	var result []operationalAssignment
	if err := operationalRPC(client, baseURL, key, "operational_access_set", body, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func operationalRPC(client *http.Client, baseURL, key, function string, body []byte, target any) error {
	if _, err := url.ParseRequestURI(baseURL); err != nil {
		return fmt.Errorf("SUPABASE_URL inválida: %w", err)
	}
	endpoint := strings.TrimRight(baseURL, "/") + "/rest/v1/rpc/" + function
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("apikey", key)
	req.Header.Set("Content-Type", "application/json")
	response, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("RPC %s: %w", function, err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		limited, _ := io.ReadAll(io.LimitReader(response.Body, 512))
		return fmt.Errorf("RPC %s devolvió %d: %s", function, response.StatusCode, strings.TrimSpace(string(limited)))
	}
	if err := json.NewDecoder(response.Body).Decode(target); err != nil {
		return fmt.Errorf("respuesta RPC %s inválida: %w", function, err)
	}
	return nil
}

func writeOperationalPreview(output io.Writer, userID string, assignments []operationalAssignment) error {
	if len(userID) < 8 {
		return fmt.Errorf("user_uuid inválido")
	}
	fmt.Fprintf(output, "target=…%s current=%d\n", userID[len(userID)-8:], len(assignments))
	for _, assignment := range assignments {
		fmt.Fprintf(output, "  role=%s status=%s expires=%s policy=%d\n", assignment.Role, assignment.Status, displayExpiry(assignment.ExpiresAt), assignment.PolicyVersion)
	}
	return nil
}

func displayExpiry(value *string) string {
	if value == nil || *value == "" {
		return "none"
	}
	return *value
}
