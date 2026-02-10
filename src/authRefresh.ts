/**
 * Refresh JWT via POST /access-token when API returns 401.
 * Uses stored SBT credentials and location signature (same as escrow flows).
 */

import { getCoords } from './coords';
import { computeLocationSignature } from './geohashLocationHash';
import { getSbtCredentials, setSbtCredentials } from './trustauthyStorage';

/**
 * Call POST /access-token to get a fresh JWT, then update stored credentials.
 * Requires user_id, digital_id, digital_secret, geoauth_secret, api_key.
 * Returns updated creds or null on failure.
 */
export async function refreshAccessToken(apiBaseUrl: string): Promise<Awaited<ReturnType<typeof getSbtCredentials>> | null> {
  const creds = await getSbtCredentials();
  if (!creds?.user_id || !creds.digital_id || !creds.geoauth_secret || !creds.digital_secret || !creds.api_key) {
    return null;
  }
  const base = apiBaseUrl.replace(/\/$/, '');
  const coords = await getCoords();
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID?.() ?? `${timestamp}-${Math.random().toString(36).slice(2)}`;
  const locationSignature = await computeLocationSignature(
    creds.geoauth_secret,
    creds.digital_secret,
    coords.latitude,
    coords.longitude
  );
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-KEY': creds.api_key,
  };
  const res = await fetch(`${base}/access-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: creds.user_id,
      digital_id: creds.digital_id,
      timestamp,
      nonce,
      location_signature: locationSignature,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; user_id?: string };
  if (!data.access_token) return null;
  const updated = {
    ...creds,
    access_token: data.access_token,
  };
  await setSbtCredentials(updated);
  return updated;
}

/**
 * Build auth headers from credentials.
 */
export function authHeaders(creds: { access_token: string; api_key?: string } | null): Record<string, string> {
  if (!creds?.access_token) return {};
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${creds.access_token}`,
    ...(creds.api_key ? { 'X-API-KEY': creds.api_key } : {}),
  };
}

/**
 * If body is JSON with nonce/timestamp/location_signature, regenerate them so retry doesn't reuse a consumed nonce.
 */
async function refreshBodyNonce(
  bodyStr: string,
  creds: { geoauth_secret: string; digital_secret: string; digital_id: string }
): Promise<string | null> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyStr) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (body == null || typeof body.nonce === 'undefined') return null;
  const coords = await getCoords();
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID?.() ?? `${timestamp}-${Math.random().toString(36).slice(2)}`;
  const locationSignature = await computeLocationSignature(
    creds.geoauth_secret,
    creds.digital_secret,
    coords.latitude,
    coords.longitude
  );
  return JSON.stringify({
    ...body,
    timestamp,
    nonce,
    location_signature: locationSignature,
  });
}

/**
 * Fetch with auth; on 401, call /access-token to refresh JWT and retry once.
 * For requests whose body contains a nonce, the retry uses a fresh nonce/timestamp/location_signature to avoid "Nonce already used".
 * Returns the response (caller should check res.ok and parse body).
 */
export async function fetchWithAuth(
  apiBaseUrl: string,
  path: string,
  init?: RequestInit,
  options?: { skipRetry?: boolean }
): Promise<Response> {
  const base = apiBaseUrl.replace(/\/$/, '');
  let creds = await getSbtCredentials();
  if (!creds?.access_token) {
    return new Response(JSON.stringify({ error: 'Register SBT first and sign in.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const headers: Record<string, string> = {
    ...authHeaders(creds),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  let res = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, { ...init, headers });
  if (res.status === 401 && !options?.skipRetry) {
    const newCreds = await refreshAccessToken(apiBaseUrl);
    if (newCreds) {
      const retryHeaders = { ...headers, ...authHeaders(newCreds) };
      let retryBody = init?.body;
      if (typeof init?.body === 'string' && newCreds.geoauth_secret && newCreds.digital_secret) {
        const refreshed = await refreshBodyNonce(init.body, newCreds);
        if (refreshed != null) retryBody = refreshed;
      }
      res = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
        ...init,
        headers: retryHeaders,
        body: retryBody,
      });
    }
  }
  return res;
}
