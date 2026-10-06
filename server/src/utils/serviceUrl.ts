// Turns whatever is configured as a service's address into a URL `fetch` can
// call.
//
// Why this exists: on Render, `render.yaml` fills AI_SERVICE_URL from the AI
// service with `fromService … property: hostport`, which yields a bare
// "host:port" such as "sana-ai-service:10000" — no scheme. `fetch` rejects that
// with "unknown scheme", and every AI call failed as "Sana AI is currently
// unavailable". Rather than depend on the platform always handing over a full
// URL (a Blueprint re-sync silently put the bare value back over a hand-set
// one), the address is normalised here.
//
// - A value that already starts with http:// or https:// is kept as it is.
// - A bare host:port gets http:// — that form is Render's private-network
//   address, which has no TLS in front of it.
// - A trailing slash is dropped so `${url}/v1/consult` never has a double slash.
export function withScheme(address: string): string {
  const trimmed = address.trim().replace(/\/+$/, '')
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
}
