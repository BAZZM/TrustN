import { isSessionExpiredError } from "./sessionExpiry";

const err = (status, url) => ({ response: { status }, config: { url } });

describe("isSessionExpiredError", () => {
  it("treats a 401 from a data route as an expired session", () => {
    expect(isSessionExpiredError(err(401, "/api/me/dashboard"))).toBe(true);
    expect(isSessionExpiredError(err(401, "http://api.example.com/api/contacts"))).toBe(true);
  });

  it("ignores 401s from the auth endpoints", () => {
    expect(isSessionExpiredError(err(401, "/api/auth/verify"))).toBe(false);
  });

  it("ignores other statuses and network errors", () => {
    expect(isSessionExpiredError(err(403, "/api/admin/config"))).toBe(false);
    expect(isSessionExpiredError(err(500, "/api/contacts"))).toBe(false);
    expect(isSessionExpiredError({ message: "Network Error" })).toBe(false);
    expect(isSessionExpiredError(null)).toBe(false);
  });
});
