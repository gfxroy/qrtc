import { describe, it, expect } from "vitest";
import { ConnectionStateMachine, ERROR_MESSAGES } from "./machine.ts";

describe("ConnectionStateMachine", () => {
  it("starts in idle state", () => {
    const sm = new ConnectionStateMachine();
    expect(sm.state).toBe("idle");
    expect(sm.context.error).toBeNull();
  });

  it("follows normal sender progression", () => {
    const sm = new ConnectionStateMachine("sender");
    const history: string[] = [];
    sm.subscribe((curr) => history.push(curr));

    sm.transition("offering", { offerCompressed: "mock-offer" });
    expect(sm.state).toBe("offering");
    expect(sm.context.offerCompressed).toBe("mock-offer");

    sm.transition("awaiting-answer");
    expect(sm.state).toBe("awaiting-answer");

    sm.transition("connecting", { answerCompressed: "mock-answer" });
    expect(sm.state).toBe("connecting");

    sm.transition("connected", { safetyCode: "lunar orbit falcon velvet" });
    expect(sm.state).toBe("connected");
    expect(sm.context.safetyCode).toBe("lunar orbit falcon velvet");

    sm.transition("transferring");
    expect(sm.state).toBe("transferring");

    sm.transition("done");
    expect(sm.state).toBe("done");

    expect(history).toEqual([
      "offering",
      "awaiting-answer",
      "connecting",
      "connected",
      "transferring",
      "done",
    ]);
  });

  it("throws on illegal transitions", () => {
    const sm = new ConnectionStateMachine();
    expect(() => sm.transition("done")).toThrowError(/Invalid state transition/);
  });

  it("transitions to failed with informative diagnostic messages", () => {
    const sm = new ConnectionStateMachine();
    sm.transition("offering");
    sm.fail("symmetric-nat");

    expect(sm.state).toBe("failed");
    expect(sm.context.error?.code).toBe("symmetric-nat");
    expect(sm.context.error?.message).toBe(ERROR_MESSAGES["symmetric-nat"].message);
    expect(sm.context.error?.details).toContain("symmetric NATs");
  });

  it("can reset to idle from any state", () => {
    const sm = new ConnectionStateMachine();
    sm.transition("offering");
    sm.fail("ice-timeout");
    expect(sm.state).toBe("failed");
    sm.reset();
    expect(sm.state).toBe("idle");
    expect(sm.context.error).toBeNull();
  });
});
