import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/api";
import {
  Validator,
  escapeRegex,
  parsePagination,
  requireObjectId,
} from "@/lib/validate";

/** Runs a validator body and returns the collected field errors, if any. */
function collectErrors(run: (v: Validator) => void, body: object) {
  const validator = new Validator(body as Record<string, unknown>);
  try {
    run(validator);
    validator.assert();
    return null;
  } catch (error) {
    if (error instanceof HttpError) return error.errors ?? {};
    throw error;
  }
}

describe("email validation", () => {
  it("accepts valid addresses and lowercases them", () => {
    const validator = new Validator({ email: "Ama.Mensah@Example.COM" });
    expect(validator.email()).toBe("ama.mensah@example.com");
  });

  it("rejects malformed addresses", () => {
    for (const email of ["", "no-at-sign", "a@b", "@example.com", "a b@c.com"]) {
      expect(collectErrors((v) => v.email(), { email })).toHaveProperty("email");
    }
  });
});

describe("password validation", () => {
  it("accepts a password with a letter and a digit", () => {
    expect(collectErrors((v) => v.password(), { password: "Password123" })).toBeNull();
  });

  it("rejects passwords that are too short or lack a letter or digit", () => {
    for (const password of ["short1", "alllettersonly", "12345678", ""]) {
      expect(
        collectErrors((v) => v.password(), { password }),
      ).toHaveProperty("password");
    }
  });

  it("rejects an absurdly long password", () => {
    expect(
      collectErrors((v) => v.password(), { password: `${"a".repeat(200)}1` }),
    ).toHaveProperty("password");
  });
});

describe("Ghanaian phone validation", () => {
  it("normalises a local number to international form", () => {
    const validator = new Validator({ phone: "0244123456" });
    expect(validator.phone()).toBe("+233244123456");
  });

  it("accepts an already-international number", () => {
    expect(new Validator({ phone: "+233244123456" }).phone()).toBe(
      "+233244123456",
    );
  });

  it("tolerates spaces, dashes, and brackets", () => {
    expect(new Validator({ phone: "024 412 3456" }).phone()).toBe(
      "+233244123456",
    );
    expect(new Validator({ phone: "+233-24-412-3456" }).phone()).toBe(
      "+233244123456",
    );
  });

  it("rejects non-Ghanaian and malformed numbers", () => {
    for (const phone of ["12345", "+14155551234", "024412345", "abcdefghij"]) {
      expect(collectErrors((v) => v.phone("phone", true), { phone })).toHaveProperty(
        "phone",
      );
    }
  });

  it("treats an absent phone as valid when it is optional", () => {
    expect(collectErrors((v) => v.phone("phone", false), {})).toBeNull();
  });
});

describe("number validation", () => {
  it("enforces bounds and integer-ness", () => {
    expect(
      collectErrors((v) => v.number("price", { min: 1 }), { price: 0 }),
    ).toHaveProperty("price");

    expect(
      collectErrors((v) => v.number("bedrooms", { integer: true }), {
        bedrooms: 2.5,
      }),
    ).toHaveProperty("bedrooms");

    expect(
      collectErrors((v) => v.number("price", { min: 1, max: 100 }), { price: 50 }),
    ).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(
      collectErrors((v) => v.number("price"), { price: "not a number" }),
    ).toHaveProperty("price");
  });
});

describe("enum validation", () => {
  it("accepts a permitted value and rejects anything else", () => {
    const allowed = ["tenant", "landlord"] as const;

    expect(new Validator({ role: "landlord" }).enum("role", allowed)).toBe(
      "landlord",
    );
    expect(
      collectErrors((v) => v.enum("role", allowed), { role: "admin" }),
    ).toHaveProperty("role");
  });
});

describe("objectId validation", () => {
  it("accepts a valid id and rejects a malformed one", () => {
    const valid = "507f1f77bcf86cd799439011";
    expect(new Validator({ id: valid }).objectId("id")).toBe(valid);

    for (const id of ["not-an-id", "123", ""]) {
      expect(collectErrors((v) => v.objectId("id"), { id })).toHaveProperty("id");
    }
  });

  it("throws a 400 for a bad path parameter", () => {
    expect(() => requireObjectId("507f1f77bcf86cd799439011")).not.toThrow();
    expect(() => requireObjectId("nonsense")).toThrow(HttpError);
  });
});

describe("future date validation", () => {
  it("accepts today and future dates", () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    expect(collectErrors((v) => v.futureDate("moveInDate"), {
      moveInDate: tomorrow,
    })).toBeNull();
  });

  it("rejects a past date", () => {
    const lastWeek = new Date(Date.now() - 7 * 86_400_000).toISOString();
    expect(
      collectErrors((v) => v.futureDate("moveInDate"), { moveInDate: lastWeek }),
    ).toHaveProperty("moveInDate");
  });

  it("rejects an unparseable date", () => {
    expect(
      collectErrors((v) => v.futureDate("moveInDate"), { moveInDate: "soon" }),
    ).toHaveProperty("moveInDate");
  });
});

describe("url array validation", () => {
  it("accepts https URLs only", () => {
    const validator = new Validator({
      images: ["https://res.cloudinary.com/a.jpg"],
    });
    expect(validator.urlArray("images")).toHaveLength(1);

    // http and javascript: URLs must not make it into a listing.
    expect(
      collectErrors((v) => v.urlArray("images"), {
        images: ["http://example.com/a.jpg"],
      }),
    ).toHaveProperty("images");

    expect(
      collectErrors((v) => v.urlArray("images"), {
        images: ["javascript:alert(1)"],
      }),
    ).toHaveProperty("images");
  });

  it("enforces the maximum number of images", () => {
    const many = Array.from({ length: 20 }, (_, i) => `https://x.test/${i}.jpg`);
    expect(
      collectErrors((v) => v.urlArray("images", { maxItems: 12 }), {
        images: many,
      }),
    ).toHaveProperty("images");
  });
});

describe("parsePagination", () => {
  it("applies defaults", () => {
    const { page, limit, skip } = parsePagination(new URLSearchParams());
    expect(page).toBe(1);
    expect(limit).toBe(12);
    expect(skip).toBe(0);
  });

  it("computes skip from page and limit", () => {
    const { skip } = parsePagination(
      new URLSearchParams({ page: "3", limit: "20" }),
    );
    expect(skip).toBe(40);
  });

  it("clamps a limit that would return the whole collection", () => {
    const { limit } = parsePagination(
      new URLSearchParams({ limit: "100000" }),
      { maxLimit: 100 },
    );
    expect(limit).toBe(100);
  });

  it("falls back on negative, zero, and non-numeric values", () => {
    for (const params of [
      { page: "-5", limit: "-1" },
      { page: "0", limit: "0" },
      { page: "abc", limit: "xyz" },
    ]) {
      const result = parsePagination(new URLSearchParams(params));
      expect(result.page).toBe(1);
      expect(result.limit).toBe(12);
      expect(result.skip).toBe(0);
    }
  });
});

describe("escapeRegex", () => {
  it("neutralises regex metacharacters in user search terms", () => {
    // Without escaping, a search for ".*" would match every document, and
    // pathological patterns could pin the database.
    const escaped = escapeRegex(".*+?^${}()|[]\\");
    expect(new RegExp(escaped).test(".*+?^${}()|[]\\")).toBe(true);
    expect(new RegExp(escapeRegex(".*")).test("anything")).toBe(false);
  });

  it("leaves ordinary text alone", () => {
    expect(escapeRegex("East Legon")).toBe("East Legon");
  });
});

describe("collecting multiple errors", () => {
  it("reports every invalid field at once", () => {
    const errors = collectErrors(
      (v) => {
        v.string("name", { min: 2 });
        v.email("email");
        v.password("password");
      },
      { name: "", email: "bad", password: "x" },
    );

    expect(Object.keys(errors ?? {}).sort()).toEqual([
      "email",
      "name",
      "password",
    ]);
  });
});
