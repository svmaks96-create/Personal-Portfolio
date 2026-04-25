import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatShares,
  formatSharesDelta,
  formatPercent,
  formatPercentDetailed,
  formatPnL,
  formatDate,
  formatTimestampDate,
  formatIRR,
} from "./formatting";

describe("formatCurrency", () => {
  it("formats positive value with $ prefix, commas, and 2dp", () => {
    expect(formatCurrency(8650)).toBe("$8,650.00");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats negative value", () => {
    expect(formatCurrency(-1234.5)).toBe("-$1,234.50");
  });

  it("formats large value with commas", () => {
    expect(formatCurrency(1234567.89)).toBe("$1,234,567.89");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatCurrency(10.999)).toBe("$11.00");
  });

  it("returns N/A for null", () => {
    expect(formatCurrency(null)).toBe("N/A");
  });
});

describe("formatShares", () => {
  it("formats with 1 decimal place", () => {
    expect(formatShares(50)).toBe("50.0");
  });

  it("formats fractional shares", () => {
    expect(formatShares(12.34)).toBe("12.3");
  });

  it("formats zero", () => {
    expect(formatShares(0)).toBe("0.0");
  });

  it("formats large share count with commas", () => {
    expect(formatShares(1500)).toBe("1,500.0");
  });

  it("returns N/A for null", () => {
    expect(formatShares(null)).toBe("N/A");
  });
});

describe("formatSharesDelta", () => {
  it("formats positive with + prefix and 1dp", () => {
    expect(formatSharesDelta(12.5)).toBe("+12.5");
  });

  it("formats negative with - prefix and 1dp", () => {
    expect(formatSharesDelta(-12.5)).toBe("-12.5");
  });

  it("formats zero as positive", () => {
    expect(formatSharesDelta(0)).toBe("+0.0");
  });

  it("rounds fractional shares to 1dp", () => {
    expect(formatSharesDelta(3.456)).toBe("+3.5");
    expect(formatSharesDelta(-3.456)).toBe("-3.5");
  });

  it("formats large delta with commas", () => {
    expect(formatSharesDelta(1500.25)).toBe("+1,500.3");
  });

  it("returns N/A for null", () => {
    expect(formatSharesDelta(null)).toBe("N/A");
  });
});

describe("formatPercent", () => {
  it("formats with 1 decimal place and % suffix", () => {
    expect(formatPercent(21.5)).toBe("21.5%");
  });

  it("formats zero", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("formats negative percent", () => {
    expect(formatPercent(-5.75)).toBe("-5.8%");
  });

  it("formats whole number with 1dp", () => {
    expect(formatPercent(100)).toBe("100.0%");
  });

  it("returns N/A for null", () => {
    expect(formatPercent(null)).toBe("N/A");
  });
});

describe("formatPercentDetailed", () => {
  it("formats with 2 decimal places and % suffix", () => {
    expect(formatPercentDetailed(21.5)).toBe("21.50%");
  });

  it("formats zero", () => {
    expect(formatPercentDetailed(0)).toBe("0.00%");
  });

  it("formats negative percent", () => {
    expect(formatPercentDetailed(-5.75)).toBe("-5.75%");
  });

  it("returns N/A for null", () => {
    expect(formatPercentDetailed(null)).toBe("N/A");
  });
});

describe("formatPnL", () => {
  it("formats positive with + prefix and $ sign", () => {
    expect(formatPnL(1535)).toBe("+$1,535.00");
  });

  it("formats negative with - prefix and $ sign", () => {
    expect(formatPnL(-250.5)).toBe("-$250.50");
  });

  it("formats zero as positive", () => {
    expect(formatPnL(0)).toBe("+$0.00");
  });

  it("formats large positive value", () => {
    expect(formatPnL(123456.78)).toBe("+$123,456.78");
  });

  it("returns N/A for null", () => {
    expect(formatPnL(null)).toBe("N/A");
  });
});

describe("formatDate", () => {
  it("formats ISO date string", () => {
    expect(formatDate("2024-03-15")).toBe("Mar 15, 2024");
  });

  it("formats date with time component", () => {
    expect(formatDate("2024-12-01T10:30:00Z")).toBe("Dec 1, 2024");
  });

  it("formats January date", () => {
    expect(formatDate("2025-01-05")).toBe("Jan 5, 2025");
  });

  it("returns N/A for null", () => {
    expect(formatDate(null)).toBe("N/A");
  });
});

describe("formatIRR", () => {
  it("formats positive value with + prefix and % suffix", () => {
    expect(formatIRR(12.5)).toBe("+12.5%");
  });

  it("formats negative value with - prefix and % suffix", () => {
    expect(formatIRR(-3.75)).toBe("-3.8%");
  });

  it("formats zero as positive", () => {
    expect(formatIRR(0)).toBe("+0.0%");
  });

  it("returns N/A for null", () => {
    expect(formatIRR(null)).toBe("N/A");
  });
});

describe("formatTimestampDate", () => {
  it("formats ISO date string to short month and day", () => {
    expect(formatTimestampDate("2024-04-02")).toBe("Apr 2");
  });

  it("formats ISO timestamp with time component", () => {
    expect(formatTimestampDate("2024-12-25T14:30:00Z")).toBe("Dec 25");
  });

  it("formats January date", () => {
    expect(formatTimestampDate("2025-01-15")).toBe("Jan 15");
  });

  it("formats single-digit day without leading zero", () => {
    expect(formatTimestampDate("2024-03-05")).toBe("Mar 5");
  });
});
