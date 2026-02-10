/**
 * Shared async "current location" for escrow flows, auth refresh, and risk checks.
 * For now always returns default coords; later can use navigator.geolocation.getCurrentPosition with fallback.
 */

export const DEFAULT_COORDS = { latitude: 35.6895, longitude: 139.6917 };

export type Coords = { latitude: number; longitude: number };

/**
 * Get current location asynchronously.
 * Currently returns default coords; can be extended to use geolocation with fallback.
 */
export function getCoords(): Promise<Coords> {
  return Promise.resolve(DEFAULT_COORDS);
  // Future: navigator.geolocation.getCurrentPosition with fallback to DEFAULT_COORDS
}
