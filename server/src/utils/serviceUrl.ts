// Turns whatever is configured as a service's address into a URL `fetch` can
// call.
//
// Why this exists: `render.yaml` used to fill AI_SERVICE_URL with
// `fromService … property: hostport`, a bare "host:port" such as
// "sana-ai-service:10000" with no scheme. `fetch` rejects that ("unknown
// scheme"), and every AI call failed as "Sana AI is currently unavailable".
// This makes a scheme-less value callable instead of failing on it.
//
// NOTE: adding the scheme only fixes the format, not reachability. On Render
// that private host name did not resolve from the server at all (ENOTFOUND), so
// render.yaml now sets the AI service's public https URL explicitly; this
// function stays as a guard against a typo'd or scheme-less value.
//
// - A value that already starts with http:// or https:// is kept as it is.
// - A bare host:port gets http://.
// - A trailing slash is dropped so `${url}/v1/consult` never has a double slash.
export function withScheme(address: string): string {
  const trimmed = address.trim().replace(/\/+$/, '')
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
}
