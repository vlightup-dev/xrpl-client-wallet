/**
 * Client-side location hash for escrow finish.
 * Matches server: geohash2.encode(lat, lon, precision=8), salted = geohash + ':' + digital_secret,
 * then HMAC-SHA256(geoauth_secret_bytes, salted) -> '0x' + hex.
 */

import geohash from 'ngeohash';

/**
 * Compute location_signature for escrow finish: HMAC-SHA256(geoauth_secret, geohash:digital_secret).
 * geoauth_secret is base64; digital_secret is the salt from register-sbt (digital_secret).
 * Uses ngeohash for encoding (precision 8 to match server GEOHASH2_PRECISION).
 */
export async function computeLocationSignature(
  geoauthSecretBase64: string,
  digitalSecret: string,
  latitude: number,
  longitude: number,
  precision: number = 8
): Promise<string> {
  const geohashStr = geohash.encode(latitude, longitude, precision);
  const salted = `${geohashStr}:${digitalSecret}`;

  const keyBytes = Uint8Array.from(atob(geoauthSecretBase64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const data = new TextEncoder().encode(salted);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return '0x' + hex;
}
