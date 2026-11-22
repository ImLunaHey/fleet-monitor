import { it, expect } from "vitest";
import { bytes, finite, fmt, fresh, gib, online } from "./format";
import { metrics, now } from "./test-fixtures";
it("formats zero and unknown numeric readings distinctly", () => {
  for (const value of [null, undefined, NaN, Infinity, "1"]) {
    expect(finite(value)).toBe(false);
    expect(fmt(value)).toBe("—");
    expect(bytes(value)).toBe("—");
  }
  expect(fmt(0)).toBe("0");
  expect(fmt(1.234, 1)).toBe("1.2");
  expect(gib(2 ** 30)).toBe(1);
  expect(bytes(0)).toBe("0 B");
  expect(bytes(2 ** 40)).toBe("1.0 TiB");
});
it("requires a fresh timestamp and an online host", () => {
  expect(fresh(now - 12, now)).toBe(false);
  expect(fresh(now + 12, now)).toBe(false);
  expect(fresh(now - 11, now)).toBe(true);
  expect(fresh(undefined, now)).toBe(false);
  expect(online(undefined, now)).toBe(false);
  expect(online({ online: true }, now)).toBe(false);
  expect(online({ online: false, metrics: metrics() }, now)).toBe(false);
  expect(online({ online: true, metrics: metrics() }, now)).toBe(true);
});
