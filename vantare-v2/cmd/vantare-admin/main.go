// CLI de soporte local para Vantare v2 — NO se distribuye con la app.
// Usa SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY para operar sobre usuarios,
// entitlements y dispositivos directamente en Supabase.
package main

import (
	"fmt"
	"os"
)
func main() {
	cmd, args := parseArgs(os.Args)
	if cmd == "" {
		fmt.Fprintln(os.Stderr, "uso: vantare-admin <lookup|grant|revoke|device-reset|events> [args...]")
		os.Exit(1)
	}
	if err := validateEnv(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	switch cmd {
	case "lookup":
		handleLookup(args)
	case "grant":
		handleGrant(args)
	case "revoke":
		handleRevoke(args)
	case "device-reset":
		handleDeviceReset(args)
	case "events":
		handleEvents(args)
	default:
		fmt.Fprintf(os.Stderr, "comando desconocido: %s\n", cmd)
		os.Exit(1)
	}
}

func parseArgs(args []string) (cmd string, rest []string) {
	if len(args) < 2 {
		return "", nil
	}
	return args[1], args[2:]
}

func validateEnv() error {
	if os.Getenv("SUPABASE_URL") == "" || os.Getenv("SUPABASE_SERVICE_ROLE_KEY") == "" {
		return fmt.Errorf("faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Command implementations — each calls Supabase REST directly with service-role
// ---------------------------------------------------------------------------

func handleLookup(args []string) {
	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "uso: vantare-admin lookup <email|user_id>")
		os.Exit(1)
	}
	query := args[0]
	baseURL := os.Getenv("SUPABASE_URL")
	key := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")

	profile, err := fetchProfile(baseURL, key, query)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	entitlements, err := fetchEntitlements(baseURL, key, profile.ID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("ID:       %s\n", profile.ID)
	fmt.Printf("Email:    %s\n", profile.Email)
	for _, e := range entitlements {
		fmt.Printf("  %s (%s)\n", e.ProductKey, e.Status)
	}
}

func handleGrant(args []string) {
	if len(args) < 2 {
		fmt.Fprintln(os.Stderr, "uso: vantare-admin grant <email|user_id> <product_key>")
		os.Exit(1)
	}
	profile, err := fetchProfile(os.Getenv("SUPABASE_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"), args[0])
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	if err := upsertEntitlement(os.Getenv("SUPABASE_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"), profile.ID, args[1], "active"); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Entitlement %s granted to %s\n", args[1], profile.Email)
}

func handleRevoke(args []string) {
	if len(args) < 2 {
		fmt.Fprintln(os.Stderr, "uso: vantare-admin revoke <email|user_id> <product_key>")
		os.Exit(1)
	}
	profile, err := fetchProfile(os.Getenv("SUPABASE_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"), args[0])
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	if err := upsertEntitlement(os.Getenv("SUPABASE_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"), profile.ID, args[1], "expired"); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Entitlement %s revoked from %s\n", args[1], profile.Email)
}

func handleDeviceReset(args []string) {
	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "uso: vantare-admin device-reset <email|user_id>")
		os.Exit(1)
	}
	profile, err := fetchProfile(os.Getenv("SUPABASE_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"), args[0])
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	// SQL directo — el RPC reset_active_device usa auth.uid() que con
	// service-role es NULL y no funcionaría. Limpiamos fingerprint y
	// last_reset_at para que el usuario pueda reregistrar el PC sin
	// rate-limit heredado.
	if err := resetDevice(os.Getenv("SUPABASE_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"), profile.ID); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Device reset for %s. The user must restart the app.\n", profile.Email)
}

func handleEvents(args []string) {
	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "uso: vantare-admin events <email|user_id>")
		os.Exit(1)
	}
	profile, err := fetchProfile(os.Getenv("SUPABASE_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"), args[0])
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	events, err := fetchLicenseEvents(os.Getenv("SUPABASE_URL"), os.Getenv("SUPABASE_SERVICE_ROLE_KEY"), profile.ID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Latest license events for %s:\n", profile.Email)
	for _, e := range events {
		fmt.Printf("  [%s] %s\n", e.CreatedAt, e.EventType)
	}
}

// ---------------------------------------------------------------------------
// Supabase REST helpers (stdlib, no dependencies)
// ---------------------------------------------------------------------------

func supabaseRequest(method, baseURL, path, key, body string) (string, error) {
	// Implementation sketch: full implementation in main_test.go mock.
	return "", fmt.Errorf("not implemented in this version")
}

func fetchProfile(baseURL, key, query string) (*Profile, error) {
	// TODO: GET /rest/v1/profiles con filtro email=eq.<query> o id=eq.<query>
	return nil, fmt.Errorf("not implemented in this version")
}

func fetchEntitlements(baseURL, key, userID string) ([]Entitlement, error) {
	return nil, fmt.Errorf("not implemented in this version")
}

func upsertEntitlement(baseURL, key, userID, productKey, status string) error {
	return fmt.Errorf("not implemented in this version")
}

func resetDevice(baseURL, key, userID string) error {
	return fmt.Errorf("not implemented in this version")
}

func fetchLicenseEvents(baseURL, key, userID string) ([]LicenseEvent, error) {
	return nil, fmt.Errorf("not implemented in this version")
}

type Profile struct {
	ID    string
	Email string
}

type Entitlement struct {
	ProductKey string
	Status     string
}

type LicenseEvent struct {
	CreatedAt string
	EventType string
}
