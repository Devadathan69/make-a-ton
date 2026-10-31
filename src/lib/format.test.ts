import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "./format";

describe("money at the UI boundary", () => {
  it("converts rupees to paise without float rounding", () => {
    expect(parseMoney("19.99")).toBe(1999);
    expect(parseMoney("0.10")).toBe(10);
    expect(parseMoney("1000")).toBe(100000);
  });
  it("rejects negative, overprecise, nonnumeric, and unsafe amounts", () => {
    for (const value of ["-1", "1.001", "", "abc", "1e5", "9007199254740992"]) {
      expect(parseMoney(value)).toBeNull();
    }
  });
  it("formats paise as INR", () => {
    expect(formatMoney(1999)).toContain("19.99");
  });
});
