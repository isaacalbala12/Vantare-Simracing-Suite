import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseDisputeSnapshot } from "./disputes.ts";
const base = {
  id: "dispute-test",
  order_id: "order-test",
  created_at: "2026-10-08T10:00:00Z",
  modified_at: null,
};
Deno.test("open chargeback suspends; merchant lost means customer won and clears dispute block", () => {
  for (
    const status of ["early_warning", "needs_response", "under_review", "won"]
  ) {
    assertEquals(
      parseDisputeSnapshot({ ...base, status })?.blocked,
      true,
      status,
    );
  }
  assertEquals(
    parseDisputeSnapshot({ ...base, status: "lost" })?.blocked,
    false,
  );
  assertEquals(
    parseDisputeSnapshot({ ...base, status: "prevented" })?.blocked,
    false,
  );
});
Deno.test("dispute snapshot rejects unknown state/missing version and uses created_at when modified_at is null", () => {
  assertEquals(parseDisputeSnapshot({ ...base, status: "unknown" }), null);
  assertEquals(
    parseDisputeSnapshot({ ...base, created_at: null, status: "lost" }),
    null,
  );
  assertEquals(
    parseDisputeSnapshot({ ...base, status: "lost" })?.modifiedAt,
    "2026-10-08T10:00:00.000Z",
  );
});
