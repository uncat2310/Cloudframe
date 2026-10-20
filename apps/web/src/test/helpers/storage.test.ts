import { describe, expect, it } from "vitest";

import { ControllableStorage } from "./storage";

describe("controllable browser storage", () => {
  it("separates reads, persistence writes, removals, and failures", () => {
    const storage = new ControllableStorage({
      "cloudframe:profiles-list": "stored-profile",
    });

    expect(storage.getItem("cloudframe:profiles-list")).toBe("stored-profile");
    storage.setItem("cloudframe:gallery:photos", "[]");
    storage.removeItem("cloudframe:profiles-list");

    expect(storage.getCalls).toEqual(["cloudframe:profiles-list"]);
    expect(storage.setCalls).toEqual([
      { key: "cloudframe:gallery:photos", value: "[]" },
    ]);
    expect(storage.removeCalls).toEqual(["cloudframe:profiles-list"]);
    expect(storage.length).toBe(1);
    expect(storage.key(0)).toBe("cloudframe:gallery:photos");

    storage.failReads();
    expect(() => storage.getItem("cloudframe:gallery:photos")).toThrow(
      "Storage read failed",
    );
    storage.clearFailures();

    storage.failWrites();
    expect(() => storage.setItem("sizes", "{}")).toThrow(
      "Storage write failed",
    );
    expect(storage.getItem("sizes")).toBeNull();
    storage.clearFailures();

    storage.failRemovals();
    expect(() => storage.removeItem("cloudframe:gallery:photos")).toThrow(
      "Storage remove failed",
    );
    expect(storage.getItem("cloudframe:gallery:photos")).toBe("[]");
  });
});
