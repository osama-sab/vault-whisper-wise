import { describe, it, expect } from "vitest";
import { findMerchant } from "@/lib/merchants";

describe("findMerchant", () => {
  it("matches real payees", () => {
    expect(findMerchant("REWE SAGT DANKE 1234")?.label).toBe("REWE");
    expect(findMerchant("REWE-MARKT GMBH")?.label).toBe("REWE");
    expect(findMerchant("NETFLIX.COM")?.label).toBe("Netflix");
    expect(findMerchant("Spotify AB")?.label).toBe("Spotify");
    expect(findMerchant("LIDL DIENSTLEISTUNG")?.label).toBe("Lidl");
    expect(findMerchant("E.ON ENERGIE DEUTSCHLAND")?.label).toBe("E.ON");
  });

  it("does not match short keywords inside unrelated words", () => {
    // Each of these matched the wrong brand before boundaries were enforced,
    // which also dragged the transaction into the wrong category.
    expect(findMerchant("PARKING GEBUEHR LEIPZIG")).toBeNull();
    expect(findMerchant("SHOPPING CENTER PASSAGE")).toBeNull();
    expect(findMerchant("ERWERB VON ANTEILEN")).toBeNull();
    expect(findMerchant("Montreal Cafe")).toBeNull();
    expect(findMerchant("REALSCHULE LEIPZIG")).toBeNull();
    expect(findMerchant("STARTUPS GMBH")).toBeNull();
    expect(findMerchant("CATERING SERVICE")).toBeNull();
  });

  it("still matches those brands when they stand as their own word", () => {
    expect(findMerchant("ING DIBA AG")?.label).toBe("ING");
    expect(findMerchant("UPS PAKETDIENST")?.label).toBe("UPS");
    expect(findMerchant("RWE AG")?.label).toBe("RWE");
    expect(findMerchant("REAL SB-WARENHAUS")?.label).toBe("Real");
  });

  it("handles empty input", () => {
    expect(findMerchant("")).toBeNull();
    expect(findMerchant(undefined as unknown as string)).toBeNull();
  });
});
