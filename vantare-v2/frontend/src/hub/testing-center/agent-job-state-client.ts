import { getSupabaseClient } from "../../lib/supabase-auth";
import { TestingCenterContractError } from "./contracts";
import { TestingCenterClientError } from "./testing-center-client";

export type AgentJobState = {
  state: string;
  updatedAt: string;
};

export async function loadTestingCenterAgentJobState(reportId: string): Promise<AgentJobState | null> {
  if (!/^report_[0-9a-f]{64}$/u.test(reportId)) {
    throw new TestingCenterContractError("agent job report id is invalid");
  }
  const { data, error } = await getSupabaseClient().rpc("testing_center_get_agent_job_state", {
    p_report_id: reportId,
  });
  if (error) throw new TestingCenterClientError("agent_state_failed");
  if (!Array.isArray(data) || data.length > 1) {
    throw new TestingCenterContractError("agent job state result is invalid");
  }
  if (data.length === 0) return null;
  const row = data[0] as Record<string, unknown>;
  if (
    typeof row.state !== "string" || row.state.length > 64 ||
    typeof row.updated_at !== "string" || Number.isNaN(Date.parse(row.updated_at))
  ) {
    throw new TestingCenterContractError("agent job state row is invalid");
  }
  return { state: row.state, updatedAt: row.updated_at };
}
