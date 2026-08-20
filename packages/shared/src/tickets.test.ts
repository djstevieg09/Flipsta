import { describe, expect, it } from "vitest";
import { isTicketBreachingSla, ticketSlaDueAt } from "./tickets.js";

describe("ticketSlaDueAt (Section 12.1)", () => {
  it("gives high priority a 4 hour window", () => {
    const created = new Date("2026-08-20T09:00:00Z");
    const due = ticketSlaDueAt("high", created);
    expect(due.toISOString()).toBe("2026-08-20T13:00:00.000Z");
  });

  it("gives low priority a 72 hour window", () => {
    const created = new Date("2026-08-20T09:00:00Z");
    const due = ticketSlaDueAt("low", created);
    expect(due.toISOString()).toBe("2026-08-23T09:00:00.000Z");
  });
});

describe("isTicketBreachingSla (Section 12.1)", () => {
  it("is not breaching before the SLA due date", () => {
    const due = new Date("2026-08-20T13:00:00Z");
    const now = new Date("2026-08-20T12:00:00Z");
    expect(isTicketBreachingSla("open", due, now)).toBe(false);
  });

  it("is breaching once past the SLA due date and still open", () => {
    const due = new Date("2026-08-20T13:00:00Z");
    const now = new Date("2026-08-20T14:00:00Z");
    expect(isTicketBreachingSla("in_progress", due, now)).toBe(true);
  });

  it("never breaches once resolved, no matter how late", () => {
    const due = new Date("2026-08-20T13:00:00Z");
    const now = new Date("2026-08-25T00:00:00Z");
    expect(isTicketBreachingSla("resolved", due, now)).toBe(false);
  });
});
