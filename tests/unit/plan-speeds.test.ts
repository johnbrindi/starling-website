import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRateLimit } from "@/lib/format";

const rsc = readFileSync("network/mikrotik/standalone/starling-profiles.rsc", "ascii");
const rateOf = (name: string) => rsc.match(new RegExp(`name="${name}"\\] shared-users=\\d+ rate-limit=(\\S+)`))?.[1];

describe("plan speeds in the router file", () => {
  it.each([
    ["1hour", "20M/20M"],
    ["12hours", "20M/20M"],
    ["24hours", "20M/20M"],
    ["1week", "30M/30M"],
    ["2weeks", "30M/30M"],
    ["1month", "50M/50M"],
  ])("%s is %s", (name, rate) => {
    expect(rateOf(name)).toBe(rate);
  });

  it("family logins have no speed limit", () => {
    expect(rateOf("family")).toBe('""');
  });

  it("the website shows these speeds", () => {
    expect(parseRateLimit("50M/50M")).toEqual({ upload: "50 Mbps", download: "50 Mbps" });
  });
});
