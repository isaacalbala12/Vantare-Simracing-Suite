import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestingCenterContractError } from "./contracts";
import { TestingCenterClientError } from "./testing-center-client";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("../../lib/supabase-auth", () => ({
  getSupabaseClient: () => ({ rpc }),
}));

import { submitTestingCenterReport, type SubmitReportInput } from "./report-submission-client";

function input(): SubmitReportInput {
  return {
    channel: "nightly",
    fields: {
      actionText: "  Opened launcher  ",
      expectedText: "  Profile starts  ",
      observedText: "  Nothing happened  ",
      contextText: "  after restart  ",
      module: "launcher",
    },
    appVersion: "v0.1.0.5",
    osVersion: "Windows 10.0.26100",
    includeDiagnostic: true,
    includeLogs: false,
    diagnostic: {
      preview: {
        contractVersion: "testing-center.diagnostic.v1",
        payload: "{}",
        sha256: "a".repeat(64),
        byteSize: 2,
      },
      environment: {
        appVersion: "v0.1.0.5",
        osFamily: "windows",
        osVersion: "Windows 10.0.26100",
        arch: "amd64",
        availableLogCount: 0,
        channel: "nightly",
      },
    },
    idempotencyKey: `draft_${"b".repeat(64)}`,
  };
}

describe("Testing Center report submission", () => {
  beforeEach(() => rpc.mockReset());

  it("maps the closed RPC contract and decodes one valid row", async () => {
    rpc.mockResolvedValue({
      data: [{
        report_id: `report_${"c".repeat(64)}`,
        report_state: "submitted",
        idempotent: false,
        created_at: "2026-08-02T20:00:00Z",
      }],
      error: null,
    });

    await expect(submitTestingCenterReport(input())).resolves.toMatchObject({
      reportId: `report_${"c".repeat(64)}`,
      reportState: "submitted",
    });
    expect(rpc).toHaveBeenCalledWith("testing_center_submit_report", {
      p_contract_version: "testing-center.v1",
      p_channel: "nightly",
      p_action_text: "Opened launcher",
      p_expected_text: "Profile starts",
      p_observed_text: "Nothing happened",
      p_context_text: "after restart",
      p_app_version: "v0.1.0.5",
      p_os_family: "windows",
      p_os_version: "Windows 10.0.26100",
      p_module: "launcher",
      p_include_diagnostic: true,
      p_include_logs: false,
      p_diagnostic_payload: "{}",
      p_diagnostic_digest: "a".repeat(64),
      p_idempotency_key: `draft_${"b".repeat(64)}`,
    });
  });

  it("does not transport diagnostic bytes when consent is off", async () => {
    rpc.mockResolvedValue({
      data: [{
        report_id: `report_${"d".repeat(64)}`,
        report_state: "submitted",
        idempotent: true,
        created_at: "2026-08-02T20:00:00Z",
      }],
      error: null,
    });
    const withoutConsent = { ...input(), includeDiagnostic: false, diagnostic: null };
    await submitTestingCenterReport(withoutConsent);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_include_diagnostic: false,
      p_diagnostic_payload: null,
      p_diagnostic_digest: null,
    });
  });

  it("maps only registered server errors to a closed client code", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "testing_center_nightly_role_required: private detail" } });
    await expect(submitTestingCenterReport(input())).rejects.toEqual(
      expect.objectContaining<Partial<TestingCenterClientError>>({ code: "testing_center_nightly_role_required" }),
    );
    rpc.mockResolvedValue({ data: null, error: { message: "database host leaked" } });
    await expect(submitTestingCenterReport(input())).rejects.toEqual(
      expect.objectContaining<Partial<TestingCenterClientError>>({ code: "submission_failed" }),
    );
  });

  it("rejects malformed or ambiguous RPC results", async () => {
    for (const data of [null, [], [{}, {}]]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(submitTestingCenterReport(input())).rejects.toThrow("report submission result is invalid");
    }
    rpc.mockResolvedValueOnce({ data: [{ report_id: "bad" }], error: null });
    await expect(submitTestingCenterReport(input())).rejects.toBeInstanceOf(TestingCenterContractError);
  });
});
