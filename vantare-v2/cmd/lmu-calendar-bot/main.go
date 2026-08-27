// Command lmu-calendar-bot reads one allowlisted Discord channel and stores
// parsed LMU schedules in a local inbox for owner review. It never publishes
// a schedule and never runs inside the Wails desktop process.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/vantare/overlays/v2/internal/calendar/discordbot"
	"github.com/vantare/overlays/v2/internal/protectedstore"
)

const (
	envDiscordToken      = "VANTARE_DISCORD_BOT_TOKEN"
	envDiscordGuild      = "VANTARE_DISCORD_GUILD_ID"
	envDiscordChannel    = "VANTARE_DISCORD_CHANNEL_ID"
	envDiscordAuthors    = "VANTARE_DISCORD_AUTHOR_IDS"
	envDiscordWebhooks   = "VANTARE_DISCORD_WEBHOOK_IDS"
	envCalendarInbox     = "VANTARE_CALENDAR_INBOX"
	envDiscordPollPeriod = "VANTARE_DISCORD_POLL_INTERVAL"
	discordBotTokenStore = "Vantare/Discord/LMUCalendarBot"
)

func main() {
	runOnce := flag.Bool("once", false, "poll Discord once and exit")
	configureToken := flag.Bool("configure-token", false, "read the token from stdin and save it in Windows Credential Manager")
	flag.Parse()
	if *configureToken {
		if *runOnce {
			log.Fatal("-once and -configure-token cannot be used together")
		}
		if err := saveDiscordTokenFromStdin(); err != nil {
			log.Fatal(err)
		}
		return
	}

	config, err := loadConfig()
	if err != nil {
		log.Fatal(err)
	}

	inbox, err := discordbot.NewInbox(config.inboxPath)
	if err != nil {
		log.Fatal(err)
	}
	client, err := discordbot.NewClient(config.token, &http.Client{Timeout: 30 * time.Second})
	if err != nil {
		log.Fatal(err)
	}
	ingestor, err := discordbot.NewIngestor(config.policy, inbox, time.Now)
	if err != nil {
		log.Fatal(err)
	}
	poller, err := discordbot.NewPoller(
		client,
		config.policy.ChannelID,
		config.policy,
		ingestor,
		config.pollInterval,
		log.Printf,
	)
	if err != nil {
		log.Fatal(err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	log.Printf("LMU calendar Discord reader started; inbox=%s poll=%s once=%t", inbox.Path(), config.pollInterval, *runOnce)
	run := poller.Run
	if *runOnce {
		run = poller.RunOnce
	}
	if err := run(ctx); err != nil {
		log.Fatal(err)
	}
	log.Print("LMU calendar Discord reader stopped")
}

type config struct {
	token        string
	policy       discordbot.SourcePolicy
	inboxPath    string
	pollInterval time.Duration
}

func loadConfig() (config, error) {
	token, err := loadDiscordToken()
	if err != nil {
		return config{}, err
	}
	guildID, err := requiredEnv(envDiscordGuild)
	if err != nil {
		return config{}, err
	}
	channelID, err := requiredEnv(envDiscordChannel)
	if err != nil {
		return config{}, err
	}
	authorIDs := parseIDSet(os.Getenv(envDiscordAuthors))
	webhookIDs := parseIDSet(os.Getenv(envDiscordWebhooks))
	policy := discordbot.SourcePolicy{
		GuildID:    guildID,
		ChannelID:  channelID,
		AuthorIDs:  authorIDs,
		WebhookIDs: webhookIDs,
	}
	if err := policy.Validate(); err != nil {
		return config{}, fmt.Errorf("%s/%s: %w", envDiscordAuthors, envDiscordWebhooks, err)
	}

	inboxPath := strings.TrimSpace(os.Getenv(envCalendarInbox))
	if inboxPath == "" {
		inboxPath, err = filepath.Abs("calendar-discord-inbox.json")
		if err != nil {
			return config{}, fmt.Errorf("calendar inbox path: %w", err)
		}
	}
	pollInterval, err := parsePollInterval(os.Getenv(envDiscordPollPeriod))
	if err != nil {
		return config{}, err
	}
	return config{
		token:        token,
		policy:       policy,
		inboxPath:    inboxPath,
		pollInterval: pollInterval,
	}, nil
}

func loadDiscordToken() (string, error) {
	return resolveDiscordToken(os.Getenv(envDiscordToken), func() ([]byte, error) {
		return protectedstore.New(discordBotTokenStore).Load()
	})
}

func resolveDiscordToken(environmentValue string, loadStored func() ([]byte, error)) (string, error) {
	if token := strings.TrimSpace(environmentValue); token != "" {
		return token, nil
	}
	data, err := loadStored()
	if err != nil {
		if errors.Is(err, protectedstore.ErrNotFound) {
			return "", fmt.Errorf("%s is required; set it locally or run --configure-token", envDiscordToken)
		}
		return "", fmt.Errorf("read Discord bot token from protected storage: %w", err)
	}
	token := strings.TrimSpace(string(data))
	if token == "" {
		return "", errors.New("stored Discord bot token is empty")
	}
	return token, nil
}

func saveDiscordTokenFromStdin() error {
	data, err := io.ReadAll(io.LimitReader(os.Stdin, 4097))
	if err != nil {
		return fmt.Errorf("read Discord bot token from stdin: %w", err)
	}
	if len(data) > 4096 {
		return errors.New("Discord bot token is too long")
	}
	token := strings.TrimSpace(string(data))
	if token == "" {
		return errors.New("Discord bot token cannot be empty")
	}
	if err := protectedstore.New(discordBotTokenStore).Save([]byte(token)); err != nil {
		return fmt.Errorf("save Discord bot token in protected storage: %w", err)
	}
	fmt.Fprintln(os.Stderr, "Discord bot token saved in the current Windows user credential store")
	return nil
}

func requiredEnv(name string) (string, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return "", fmt.Errorf("%s is required", name)
	}
	return value, nil
}

func parseIDSet(value string) map[string]struct{} {
	ids := make(map[string]struct{})
	for _, item := range strings.Split(value, ",") {
		if id := strings.TrimSpace(item); id != "" {
			ids[id] = struct{}{}
		}
	}
	return ids
}

func parsePollInterval(value string) (time.Duration, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 5 * time.Minute, nil
	}
	interval, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be a Go duration: %w", envDiscordPollPeriod, err)
	}
	if interval < time.Second {
		return 0, errors.New("VANTARE_DISCORD_POLL_INTERVAL must be at least 1s")
	}
	return interval, nil
}
