package launcher

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

// DecisionRequest is a question from a paused launch chain to the Hub.
type DecisionRequest struct {
	DecisionID string   `json:"decisionId"`
	ProfileID  string   `json:"profileId"`
	AppID      string   `json:"appId"`
	Kind       string   `json:"kind"`
	Message    string   `json:"message"`
	Actions    []string `json:"actions"`
	ExpiresAt  int64    `json:"expiresAt"`
}

type pendingDecision struct {
	request DecisionRequest
	action  chan string
}

const decisionTimeout = 2 * time.Minute

// PendingDecisions lets a UI that attaches after startup recover questions
// emitted before it subscribed. It returns a copy in request order.
func (r *ChainRunner) PendingDecisions() []DecisionRequest {
	r.mu.Lock()
	defer r.mu.Unlock()
	requests := make([]DecisionRequest, 0, len(r.pendingDecisions))
	for _, pending := range r.pendingDecisions {
		requests = append(requests, pending.request)
	}
	sort.Slice(requests, func(i, j int) bool {
		left, right := requests[i].DecisionID, requests[j].DecisionID
		if len(left) != len(right) {
			return len(left) < len(right)
		}
		return left < right
	})
	return requests
}

func (r *ChainRunner) requestDecision(ctx context.Context, profileID, appID, kind, message string, actions []string) string {
	r.mu.Lock()
	if r.stopping {
		r.mu.Unlock()
		return ""
	}
	r.nextDecision++
	id := fmt.Sprintf("%d", r.nextDecision)
	request := DecisionRequest{
		DecisionID: id, ProfileID: profileID, AppID: appID,
		Kind: kind, Message: message, Actions: append([]string(nil), actions...),
		ExpiresAt: time.Now().Add(decisionTimeout).UnixMilli(),
	}
	decision := pendingDecision{request: request, action: make(chan string, 1)}
	r.pendingDecisions[id] = decision
	r.mu.Unlock()
	defer func() {
		r.mu.Lock()
		delete(r.pendingDecisions, id)
		r.mu.Unlock()
	}()
	r.emit.Emit("launcher:decision:required", request)
	timer := time.NewTimer(decisionTimeout)
	defer timer.Stop()
	select {
	case action := <-decision.action:
		return action
	case <-ctx.Done():
		return r.expireDecision(id, decision.action)
	case <-r.shutdown:
		return r.expireDecision(id, decision.action)
	case <-timer.C:
		return r.expireDecision(id, decision.action)
	}
}

func (r *ChainRunner) expireDecision(id string, action <-chan string) string {
	r.mu.Lock()
	_, pending := r.pendingDecisions[id]
	if pending {
		delete(r.pendingDecisions, id)
	}
	r.mu.Unlock()
	if !pending {
		return <-action
	}
	r.emit.Emit("launcher:decision:expired", map[string]string{"decisionId": id})
	return ""
}

// ResolveDecision resumes a pending chain only with an action offered in its
// request. An expired or duplicate answer cannot affect a later decision.
func (r *ChainRunner) ResolveDecision(id, action string) (DecisionRequest, error) {
	return r.resolveDecisionWith(id, action, nil)
}

// resolveDecisionWith persists an optional remembered choice while the chain
// is still paused. The action is delivered even if persistence fails.
func (r *ChainRunner) resolveDecisionWith(id, action string, beforeRelease func(DecisionRequest) error) (DecisionRequest, error) {
	r.mu.Lock()
	decision, ok := r.pendingDecisions[id]
	if !ok {
		r.mu.Unlock()
		return DecisionRequest{}, fmt.Errorf("%w: %s", ErrDecisionNotFound, id)
	}
	allowed := false
	for _, offered := range decision.request.Actions {
		if offered == action {
			allowed = true
			break
		}
	}
	if !allowed {
		r.mu.Unlock()
		return DecisionRequest{}, fmt.Errorf("%w: %s", ErrInvalidDecision, action)
	}
	var persistErr error
	if beforeRelease != nil {
		persistErr = beforeRelease(decision.request)
	}
	delete(r.pendingDecisions, id)
	r.mu.Unlock()
	decision.action <- action
	return decision.request, persistErr
}

func (r *ChainRunner) continueAfterFailure(ctx context.Context, profile app.LaunchProfile, appID, message string, policy app.FailurePolicy) bool {
	if policy != app.FailureAsk {
		return ContinueAfterFailure(policy, false)
	}
	return r.requestDecision(ctx, profile.ID, appID, "failure", message, []string{"continue", "stop"}) == "continue"
}
