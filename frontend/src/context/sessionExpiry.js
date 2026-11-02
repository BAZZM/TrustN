/**
 * True when an axios error means the stored session is no longer valid: a 401 from any API route
 * except the auth endpoints themselves (a wrong code at login is not an expired session).
 */
export function isSessionExpiredError(error) {
  if (!error || !error.response || error.response.status !== 401) return false;
  const url = (error.config && error.config.url) || "";
  return !/\/api\/auth\//.test(url);
}
