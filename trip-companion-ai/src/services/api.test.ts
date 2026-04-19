import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

describe("api base URL", () => {
  const originalApiBase = import.meta.env.VITE_API_BASE_URL;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      } as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalApiBase === undefined) {
      delete import.meta.env.VITE_API_BASE_URL;
    } else {
      import.meta.env.VITE_API_BASE_URL = originalApiBase;
    }
  });

  it("uses VITE_API_BASE_URL when provided", async () => {
    import.meta.env.VITE_API_BASE_URL = "https://api.example.com";

    const api = await import("./api");
    await api.getTrips();

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/trips",
      expect.any(Object),
    );
  });
});
