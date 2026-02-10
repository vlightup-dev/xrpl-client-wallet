/**
 * Shared async "current location" for escrow flows, auth refresh, risk checks, and SBT registration.
 * When VITE_USE_DEFAULT_COORDS is set, returns DEFAULT_COORDS without calling GNSS.
 * Otherwise fetches from localhost GNSS API; on failure returns DEFAULT_COORDS.
 */

const GNSS_API_URL = 'http://localhost:8000/api/gnss';

const USE_DEFAULT_COORDS =
  (import.meta.env.VITE_USE_DEFAULT_COORDS as string)?.toLowerCase() === 'true' ||
  (import.meta.env.VITE_USE_DEFAULT_COORDS as string) === '1';

export const DEFAULT_COORDS = { latitude: 35.6895, longitude: 139.6917 };

export type Coords = { latitude: number; longitude: number };

/**
 * Get current location asynchronously.
 * If VITE_USE_DEFAULT_COORDS is true/1, returns default. Otherwise fetches GNSS; on failure returns default.
 */
export async function getCoords(): Promise<Coords> {
  if (USE_DEFAULT_COORDS) {
    return DEFAULT_COORDS;
  }
  try {
    const response = await fetch(GNSS_API_URL);
    if (!response.ok) {
      throw new Error(`GNSS API error: ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('No location data available from GNSS API');
    }
    const first = data[0] as { lat?: number; lon?: number };
    return {
      latitude: first.lat ?? 0,
      longitude: first.lon ?? 0,
    };
  } catch {
    return DEFAULT_COORDS;
  }
}
