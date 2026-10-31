import { describe, expect, it } from "vitest";
import type { CustomerInput } from "@/lib/contracts";

describe("Customer input validation & payload constraints", () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateCustomer(input: CustomerInput): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!input.company.trim()) errors.company = "Company name is required";
    if (!input.name.trim()) errors.name = "Contact person name is required";
    if (!input.email.trim()) {
      errors.email = "Email address is required";
    } else if (!emailRegex.test(input.email.trim())) {
      errors.email = "Please enter a valid email address";
    }
    if (!input.address.trim()) errors.address = "Address is required";
    return errors;
  }

  it("validates that all required fields must be non-empty", () => {
    const emptyInput: CustomerInput = {
      company: "",
      name: "",
      email: "",
      address: "",
    };
    const errors = validateCustomer(emptyInput);
    expect(errors.company).toBe("Company name is required");
    expect(errors.name).toBe("Contact person name is required");
    expect(errors.email).toBe("Email address is required");
    expect(errors.address).toBe("Address is required");
  });

  it("rejects invalid email formats and accepts valid ones", () => {
    const invalidInput: CustomerInput = {
      company: "Acme Corp",
      name: "Jane",
      email: "invalid-email-address",
      address: "123 Main St",
    };
    const errors = validateCustomer(invalidInput);
    expect(errors.email).toBe("Please enter a valid email address");

    const validInput: CustomerInput = {
      company: "Acme Corp",
      name: "Jane",
      email: "jane.doe@acme.co.in",
      address: "123 Main St",
    };
    const validErrors = validateCustomer(validInput);
    expect(Object.keys(validErrors).length).toBe(0);
  });

  it("sanitizes whitespace in submitted payloads", () => {
    const rawInput = {
      company: "   LoopLedger Ltd   ",
      name: "  Hannath  ",
      email: "  hannath@example.test  ",
      address: "  Kochi, Kerala  ",
    };

    const sanitized: CustomerInput = {
      company: rawInput.company.trim(),
      name: rawInput.name.trim(),
      email: rawInput.email.trim(),
      address: rawInput.address.trim(),
    };

    expect(sanitized.company).toBe("LoopLedger Ltd");
    expect(sanitized.name).toBe("Hannath");
    expect(sanitized.email).toBe("hannath@example.test");
    expect(sanitized.address).toBe("Kochi, Kerala");
    // Ensure no auth/password/role fields leak
    expect((sanitized as Record<string, unknown>).password).toBeUndefined();
    expect((sanitized as Record<string, unknown>).role).toBeUndefined();
  });
});
