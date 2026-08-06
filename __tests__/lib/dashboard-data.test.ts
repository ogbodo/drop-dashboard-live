import {
  buildSearchMatcher,
  normalizePhoneNumber,
  isLeadershipViewer,
  maskRideFinancialsForStaff,
  maskDriverForStaff,
  maskCustomerForStaff,
} from "@/lib/dashboard-data";

describe("normalizePhoneNumber", () => {
  it("converts a local 11-digit number starting with 0 to E.164 (234) form", () => {
    expect(normalizePhoneNumber("08031234567")).toBe("2348031234567");
  });

  it("prefixes a bare 10-digit subscriber number with the 234 country code", () => {
    expect(normalizePhoneNumber("8031234567")).toBe("2348031234567");
  });

  it("strips non-digit characters (spaces, dashes, plus, parens) before normalizing", () => {
    expect(normalizePhoneNumber("+234 803-123-4567")).toBe("2348031234567");
    expect(normalizePhoneNumber("(080) 3123 4567")).toBe("2348031234567");
  });

  it("leaves an already-normalized 234-prefixed number unchanged", () => {
    expect(normalizePhoneNumber("2348031234567")).toBe("2348031234567");
  });

  it("returns an empty string for empty, null, or undefined input", () => {
    expect(normalizePhoneNumber("")).toBe("");
    expect(normalizePhoneNumber(null)).toBe("");
    expect(normalizePhoneNumber(undefined)).toBe("");
    expect(normalizePhoneNumber("no-digits-here")).toBe("");
  });

  it("returns the raw digits for lengths it does not specially handle", () => {
    // 7 digits: not 10, not 11-with-leading-0 -> returned as-is
    expect(normalizePhoneNumber("1234567")).toBe("1234567");
  });

  // ---- Additional thorough coverage ----

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizePhoneNumber("   ")).toBe("");
    expect(normalizePhoneNumber("\t\n ")).toBe("");
  });

  it("accepts a numeric input and normalizes by digit length", () => {
    // 10-digit number -> prefixed with 234
    expect(normalizePhoneNumber(8031234567)).toBe("2348031234567");
  });

  it("treats numeric 0 as falsy (0 || \"\") and returns an empty string", () => {
    // value || "" makes the number 0 collapse to "" before digit extraction
    expect(normalizePhoneNumber(0)).toBe("");
  });

  it("prefixes a 10-digit number that does NOT start with 0 with 234", () => {
    // Length === 10 branch applies regardless of leading digit
    expect(normalizePhoneNumber("9031234567")).toBe("2349031234567");
  });

  it("returns the raw 11 digits unchanged when they do NOT start with 0", () => {
    // 11 digits but no leading 0 -> falls through to the `return digits` branch
    expect(normalizePhoneNumber("12345678901")).toBe("12345678901");
  });

  it("returns a 13-digit local-with-leading-zero number unchanged (only 11-digit gets the slice)", () => {
    // 13 digits -> no branch matches -> returned as-is
    expect(normalizePhoneNumber("0803123456789")).toBe("0803123456789");
  });

  it("strips a leading + and normalizes the remaining 13 digits as-is", () => {
    expect(normalizePhoneNumber("+2348031234567")).toBe("2348031234567");
  });

  it("strips letters interleaved with digits and keeps only the digits", () => {
    expect(normalizePhoneNumber("abc803def123ghi4567")).toBe("2348031234567");
  });

  it("does NOT treat non-ASCII (Arabic-indic) digits as digits and returns empty", () => {
    // JS \D only excludes ASCII 0-9, so ٠٨٠٣ are stripped -> "" -> ""
    expect(normalizePhoneNumber("٠٨٠٣")).toBe("");
  });

  it("handles a unicode string with embedded ASCII digits", () => {
    expect(normalizePhoneNumber("☎️0803📞123🚕4567")).toBe("2348031234567");
  });

  it("returns very large all-digit input verbatim (no special-length branch)", () => {
    const huge = "9".repeat(40);
    expect(normalizePhoneNumber(huge)).toBe(huge);
  });

  it("handles a single leading-zero 11-digit number where the slice drops only the first 0", () => {
    expect(normalizePhoneNumber("00000000000")).toBe("2340000000000");
  });
});

describe("buildSearchMatcher", () => {
  it("returns a matcher that accepts everything when the search term is blank", () => {
    const matchAll = buildSearchMatcher("");
    expect(matchAll("anything")).toBe(true);
    expect(matchAll("")).toBe(true);
    expect(matchAll(null)).toBe(true);
  });

  it("treats whitespace-only search as blank (match-all)", () => {
    const matchAll = buildSearchMatcher("   ");
    expect(matchAll("literally anything")).toBe(true);
  });

  it("matches case-insensitively on substrings", () => {
    const matcher = buildSearchMatcher("Ada");
    expect(matcher("Adaeze Okafor")).toBe(true);
    expect(matcher("ADAEZE")).toBe(true);
    expect(matcher("grace")).toBe(false);
  });

  it("trims the search term before matching", () => {
    const matcher = buildSearchMatcher("  lagos  ");
    expect(matcher("Lagos Island")).toBe(true);
    expect(matcher("Abuja")).toBe(false);
  });

  it("handles null/undefined candidate values without throwing", () => {
    const matcher = buildSearchMatcher("x");
    expect(matcher(null)).toBe(false);
    expect(matcher(undefined)).toBe(false);
  });

  it("coerces non-string candidate values to strings before matching", () => {
    const matcher = buildSearchMatcher("23");
    expect(matcher(1234)).toBe(true);
    expect(matcher(99)).toBe(false);
  });

  // ---- Additional thorough coverage ----

  it("treats null/undefined search as match-all", () => {
    expect(buildSearchMatcher(null)("anything")).toBe(true);
    expect(buildSearchMatcher(undefined)("anything")).toBe(true);
  });

  it("treats numeric 0 and boolean false as falsy searches -> match-all", () => {
    // (search || "") collapses 0 / false / NaN to "" -> blank -> match-all
    expect(buildSearchMatcher(0 as unknown as string)("nope")).toBe(true);
    expect(buildSearchMatcher(false as unknown as string)("nope")).toBe(true);
    expect(buildSearchMatcher(NaN as unknown as string)("nope")).toBe(true);
  });

  it("treats a non-empty NUMERIC search (e.g. \"0\" via number) as a real substring term", () => {
    // The STRING "0" is truthy, so it is a genuine search term, not match-all
    const matcher = buildSearchMatcher("0");
    expect(matcher("role 0")).toBe(true);
    expect(matcher(10)).toBe(true); // "10" includes "0"
    // numeric 0 candidate -> String(0 || "") === "" -> does NOT contain "0"
    expect(matcher(0)).toBe(false);
  });

  it("matches as a CONTIGUOUS substring only (it is NOT tokenized/multi-term)", () => {
    // Documenting actual behavior: a multi-word search is a single substring,
    // not independent terms. "john lagos" does NOT match "John from Lagos".
    const matcher = buildSearchMatcher("john lagos");
    expect(matcher("John from Lagos")).toBe(false);
    expect(matcher("john lagos trip")).toBe(true);
    expect(matcher("JOHN LAGOS")).toBe(true);
  });

  it("matches unicode substrings case-insensitively", () => {
    const matcher = buildSearchMatcher("café");
    expect(matcher("Café Royale")).toBe(true);
    expect(matcher("CAFÉ")).toBe(true);
    expect(matcher("coffee")).toBe(false);
  });

  it("matches emoji and other multi-byte characters as plain substrings", () => {
    const matcher = buildSearchMatcher("🚕");
    expect(matcher("ride 🚕 booked")).toBe(true);
    expect(matcher("no taxi here")).toBe(false);
  });

  it("matches an interior whitespace-containing term verbatim when present", () => {
    const matcher = buildSearchMatcher("lagos island");
    expect(matcher("12 Lagos Island Road")).toBe(true);
    expect(matcher("Lagos  Island")).toBe(false); // double space differs
  });

  it("returns false for a zero-length candidate when a real term is set", () => {
    const matcher = buildSearchMatcher("x");
    expect(matcher("")).toBe(false);
    expect(matcher(0)).toBe(false); // coerces to "" via (value || "")
  });

  it("returns a fresh matcher each call (no shared state across calls)", () => {
    const a = buildSearchMatcher("lagos");
    const b = buildSearchMatcher("abuja");
    expect(a("Lagos")).toBe(true);
    expect(a("Abuja")).toBe(false);
    expect(b("Abuja")).toBe(true);
    expect(b("Lagos")).toBe(false);
  });
});

describe("isLeadershipViewer", () => {
  it("returns true for super_admin and admin (the leadership roles)", () => {
    expect(isLeadershipViewer("super_admin")).toBe(true);
    expect(isLeadershipViewer("admin")).toBe(true);
  });

  it("returns false for staff, partner, and other non-leadership roles", () => {
    expect(isLeadershipViewer("staff")).toBe(false);
    expect(isLeadershipViewer("partner")).toBe(false);
    expect(isLeadershipViewer("driver")).toBe(false);
    expect(isLeadershipViewer("customer")).toBe(false);
  });

  it("returns false for empty / null / undefined viewer roles", () => {
    expect(isLeadershipViewer("")).toBe(false);
    expect(isLeadershipViewer(null as unknown as string)).toBe(false);
    expect(isLeadershipViewer(undefined as unknown as string)).toBe(false);
  });

  it("is case-sensitive and exact-match (no trimming, no upper/lower coercion)", () => {
    expect(isLeadershipViewer("Admin")).toBe(false);
    expect(isLeadershipViewer("SUPER_ADMIN")).toBe(false);
    expect(isLeadershipViewer(" admin")).toBe(false);
    expect(isLeadershipViewer("admin ")).toBe(false);
  });
});

describe("maskRideFinancialsForStaff", () => {
  const fullEntry = {
    id: "fin-1",
    ride_id: "ride-1",
    booking_fare_amount: 1000,
    service_fee_amount: 50,
    customer_total_amount: 1050,
    driver_gross_amount: 900,
    driver_net_payout_amount: 850,
    drop_net_margin_amount: 200,
    partner_commission_amount: 75,
    partner_fee_amount: 60,
    payout_fee_amount: 25,
    processor_fee_amount: 30,
    currency: "NGN",
  };

  it("returns null for null / undefined / falsy input", () => {
    expect(maskRideFinancialsForStaff(null)).toBeNull();
    expect(maskRideFinancialsForStaff(undefined)).toBeNull();
    expect(maskRideFinancialsForStaff(0 as never)).toBeNull();
    expect(maskRideFinancialsForStaff("" as never)).toBeNull();
  });

  it("nulls out every sensitive payout/margin/fee field", () => {
    const masked = maskRideFinancialsForStaff(fullEntry);
    expect(masked).not.toBeNull();
    expect(masked!.driver_gross_amount).toBeNull();
    expect(masked!.driver_net_payout_amount).toBeNull();
    expect(masked!.drop_net_margin_amount).toBeNull();
    expect(masked!.partner_commission_amount).toBeNull();
    expect(masked!.partner_fee_amount).toBeNull();
    expect(masked!.payout_fee_amount).toBeNull();
    expect(masked!.processor_fee_amount).toBeNull();
  });

  it("sets the sensitive_fields_hidden flag to true", () => {
    const masked = maskRideFinancialsForStaff(fullEntry);
    expect(masked!.sensitive_fields_hidden).toBe(true);
  });

  it("PRESERVES non-sensitive, customer-facing amounts and identifiers", () => {
    const masked = maskRideFinancialsForStaff(fullEntry);
    expect(masked!.id).toBe("fin-1");
    expect(masked!.ride_id).toBe("ride-1");
    expect(masked!.booking_fare_amount).toBe(1000);
    expect(masked!.service_fee_amount).toBe(50);
    expect(masked!.customer_total_amount).toBe(1050);
    expect(masked!.currency).toBe("NGN");
  });

  it("does not mutate the original entry object", () => {
    const entry = { ...fullEntry };
    maskRideFinancialsForStaff(entry);
    expect(entry.driver_gross_amount).toBe(900);
    expect(entry.drop_net_margin_amount).toBe(200);
    expect((entry as Record<string, unknown>).sensitive_fields_hidden).toBeUndefined();
  });

  it("masks sensitive fields even on an entry that only has unrelated keys", () => {
    const masked = maskRideFinancialsForStaff({ id: "fin-x", extra: "keep" } as never);
    expect(masked!.extra).toBe("keep");
    expect(masked!.driver_gross_amount).toBeNull();
    expect(masked!.sensitive_fields_hidden).toBe(true);
  });
});

describe("maskDriverForStaff", () => {
  const fullDriver = {
    id: "driver-1",
    full_name: "Adaeze Okafor",
    phone: "2348031234567",
    email: "ada@example.com",
    nin_number: "12345678901",
    license_number: "LIC-001",
    license_expiry: "2030-01-01",
    license_photo_url: "https://x/license.jpg",
    license_selfie_url: "https://x/selfie.jpg",
    dob: "1990-05-05",
    emergency_contact: "Kunle 2348000000000",
    default_payout_account: { id: "pa-1", account_number: "0123456789" },
    payout_accounts: [{ id: "pa-1" }],
    recent_payouts: [{ id: "po-1" }],
    latest_otp: { id: "otp-1", code: "123456" },
    wallet: { available_balance: 5000 },
    vehicle: {
      id: "veh-1",
      plate_number: "ABC-123",
      make: "Toyota",
      registration_photo_url: "https://x/reg.jpg",
    },
    rating: 4.8,
    is_verified: true,
  };

  it("returns the falsy value as-is for null / undefined (does NOT coerce to null literal)", () => {
    // Implementation returns `driver` (the original falsy value), not a forced null.
    expect(maskDriverForStaff(null)).toBeNull();
    expect(maskDriverForStaff(undefined)).toBeUndefined();
  });

  it("nulls out all PII document/identity fields", () => {
    const masked = maskDriverForStaff(fullDriver);
    expect(masked.nin_number).toBeNull();
    expect(masked.license_number).toBeNull();
    expect(masked.license_expiry).toBeNull();
    expect(masked.license_photo_url).toBeNull();
    expect(masked.license_selfie_url).toBeNull();
    expect(masked.dob).toBeNull();
    expect(masked.emergency_contact).toBeNull();
    expect(masked.default_payout_account).toBeNull();
    expect(masked.latest_otp).toBeNull();
    expect(masked.wallet).toBeNull();
  });

  it("empties payout/account arrays", () => {
    const masked = maskDriverForStaff(fullDriver);
    expect(masked.payout_accounts).toEqual([]);
    expect(masked.recent_payouts).toEqual([]);
  });

  it("sets the sensitive_fields_hidden flag", () => {
    expect(maskDriverForStaff(fullDriver).sensitive_fields_hidden).toBe(true);
  });

  it("masks the vehicle registration photo but keeps other vehicle fields", () => {
    const masked = maskDriverForStaff(fullDriver);
    expect(masked.vehicle).not.toBeNull();
    expect(masked.vehicle.registration_photo_url).toBeNull();
    expect(masked.vehicle.plate_number).toBe("ABC-123");
    expect(masked.vehicle.make).toBe("Toyota");
    expect(masked.vehicle.id).toBe("veh-1");
  });

  it("sets vehicle to null when the driver has no vehicle", () => {
    const masked = maskDriverForStaff({ id: "d2", vehicle: null });
    expect(masked.vehicle).toBeNull();
  });

  it("PRESERVES non-sensitive identity/profile fields (name, phone, email, rating)", () => {
    const masked = maskDriverForStaff(fullDriver);
    expect(masked.id).toBe("driver-1");
    expect(masked.full_name).toBe("Adaeze Okafor");
    expect(masked.phone).toBe("2348031234567");
    expect(masked.email).toBe("ada@example.com");
    expect(masked.rating).toBe(4.8);
    expect(masked.is_verified).toBe(true);
  });

  it("does not mutate the original driver (or its vehicle)", () => {
    const driver = JSON.parse(JSON.stringify(fullDriver));
    maskDriverForStaff(driver);
    expect(driver.nin_number).toBe("12345678901");
    expect(driver.vehicle.registration_photo_url).toBe("https://x/reg.jpg");
    expect(driver.payout_accounts).toHaveLength(1);
  });
});

describe("maskCustomerForStaff", () => {
  const fullCustomer = {
    id: "cust-1",
    full_name: "Grace Eze",
    phone: "2348090000000",
    email: "grace@example.com",
    dob: "1995-03-03",
    latest_otp: { id: "otp-9", code: "999999" },
    rating: 4.9,
    total_trips: 12,
  };

  it("returns the falsy value as-is for null / undefined", () => {
    expect(maskCustomerForStaff(null)).toBeNull();
    expect(maskCustomerForStaff(undefined)).toBeUndefined();
  });

  it("nulls out dob and latest_otp", () => {
    const masked = maskCustomerForStaff(fullCustomer);
    expect(masked.dob).toBeNull();
    expect(masked.latest_otp).toBeNull();
  });

  it("sets the sensitive_fields_hidden flag", () => {
    expect(maskCustomerForStaff(fullCustomer).sensitive_fields_hidden).toBe(true);
  });

  it("PRESERVES non-sensitive profile fields (name, phone, email, rating, trips)", () => {
    const masked = maskCustomerForStaff(fullCustomer);
    expect(masked.id).toBe("cust-1");
    expect(masked.full_name).toBe("Grace Eze");
    expect(masked.phone).toBe("2348090000000");
    expect(masked.email).toBe("grace@example.com");
    expect(masked.rating).toBe(4.9);
    expect(masked.total_trips).toBe(12);
  });

  it("does not mutate the original customer", () => {
    const customer = { ...fullCustomer };
    maskCustomerForStaff(customer);
    expect(customer.dob).toBe("1995-03-03");
    expect(customer.latest_otp).toEqual({ id: "otp-9", code: "999999" });
    expect((customer as Record<string, unknown>).sensitive_fields_hidden).toBeUndefined();
  });
});

describe("PII masking vs leadership (unmasked) — cross-helper invariant", () => {
  // The data loaders apply maskX helpers ONLY when isLeadershipViewer(viewerRole)
  // is false. This documents that contract at the helper level: leadership sees
  // raw data (no masking applied), staff/others get the masked projection.
  const applyDriverMaskingFor = (viewerRole: string, driver: Record<string, unknown>) =>
    isLeadershipViewer(viewerRole) ? driver : maskDriverForStaff(driver);

  const sensitiveDriver = {
    id: "d-1",
    nin_number: "11122233344",
    license_number: "LIC-9",
    dob: "1991-01-01",
  };

  it("leadership roles see UNMASKED driver PII", () => {
    for (const role of ["super_admin", "admin"]) {
      const out = applyDriverMaskingFor(role, { ...sensitiveDriver }) as Record<string, unknown>;
      expect(out.nin_number).toBe("11122233344");
      expect(out.license_number).toBe("LIC-9");
      expect(out.dob).toBe("1991-01-01");
      expect(out.sensitive_fields_hidden).toBeUndefined();
    }
  });

  it("non-leadership roles get MASKED driver PII", () => {
    for (const role of ["staff", "partner", ""]) {
      const out = applyDriverMaskingFor(role, { ...sensitiveDriver }) as Record<string, unknown>;
      expect(out.nin_number).toBeNull();
      expect(out.license_number).toBeNull();
      expect(out.dob).toBeNull();
      expect(out.sensitive_fields_hidden).toBe(true);
    }
  });
});
