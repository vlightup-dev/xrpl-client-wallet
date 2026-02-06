import { useState, useCallback } from 'react';
import { setSbtCredentials } from '../trustauthyStorage';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string)?.trim() ||
  (import.meta.env.VITE_API_SERVER_URL as string)?.trim() ||
  '';

type RegisterSbtPageProps = {
  address: string;
  onBack: () => void;
};

export function RegisterSbtPage({ address, onBack }: RegisterSbtPageProps) {
  const [nickname, setNickname] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'getting' | 'ok' | 'denied'>('idle');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const getLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    setLocationStatus('getting');
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      setLocationStatus('idle');
      return null;
    }
    try {
      // TODO: switch to fetching the location from the GNSS API
      // const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      //   navigator.geolocation.getCurrentPosition(resolve, reject, {
      //     timeout: 25000,
      //     maximumAge: 300000,
      //     enableHighAccuracy: false,
      //   });
      // });
      const result = {
        latitude: 35.6895,
        longitude: 139.6917,
      };
      setCoords(result);
      setLocationStatus('ok');
      return result;
    } catch (err) {
      const code = (err as GeolocationPositionError).code;
      const msg =
        code === 1
          ? 'Location denied. Allow location for this extension in Chrome (extension puzzle icon → TRUSTAUTHY Wallet → Allow location).'
          : code === 3
            ? 'Location timed out. Try again.'
            : (err as Error).message || 'Could not get location.';
      setError(msg);
      setLocationStatus('idle');
      return null;
    }
  };

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSuccess(null);
    if (!nickname.trim()) {
      setError('Please enter a nickname.');
      return;
    }
    if (!apiKey.trim()) {
      setError('Please enter your API key.');
      return;
    }
    if (!API_BASE_URL) {
      setError('API base URL is not configured (VITE_API_BASE_URL or VITE_API_SERVER_URL).');
      return;
    }
    let lat = coords?.latitude;
    let lng = coords?.longitude;
    if (lat == null || lng == null) {
      const location = await getLocation();
      if (location == null) return;
      lat = location.latitude;
      lng = location.longitude;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/register-sbt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey.trim(),
        },
        body: JSON.stringify({
          nickname: nickname.trim(),
          latitude: lat,
          longitude: lng,
          wallet_address: address,
          chain: 'xrpl',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        user_id?: string;
        digital_id?: string;
        digital_secret?: string;
        geoauth_secret?: string;
        access_token?: string;
        location_hash?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || `Request failed: ${res.status}`);
        return;
      }
      if (
        data.user_id &&
        data.digital_id != null &&
        data.digital_secret != null &&
        data.geoauth_secret != null &&
        data.access_token
      ) {
        await setSbtCredentials({
          user_id: data.user_id,
          digital_id: data.digital_id,
          digital_secret: data.digital_secret,
          geoauth_secret: data.geoauth_secret,
          access_token: data.access_token,
          location_hash: data.location_hash,
          api_key: apiKey.trim(),
        });
        setSuccess('SBT registered. Credentials saved on this device.');
      } else {
        setSuccess('SBT registered successfully.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  }, [nickname, apiKey, address, coords]);

  return (
    <div className="flex flex-col gap-4 max-w-[360px] min-h-[400px] bg-gray-900 text-white p-4">
      <header className="flex items-center justify-between pb-2 border-b border-gray-700">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-sky-400 hover:text-white transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold text-white">Register SBT</h1>
        <span className="w-10" />
      </header>

      <p className="text-xs text-gray-400">
        Register a Soulbound Token (SBT) on XRPL. Your wallet address and current location will be sent to the platform.
      </p>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400" htmlFor="register-sbt-nickname">
          Nickname
        </label>
        <input
          id="register-sbt-nickname"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Your display name"
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-sky-500 focus:outline-none"
        />
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-400" htmlFor="register-sbt-apikey">
          API Key
        </label>
        <input
          id="register-sbt-apikey"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API keyfrom trustauthy platform"
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm placeholder-gray-500 focus:border-sky-500 focus:outline-none"
        />
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-xs font-medium text-gray-400">Location</span>
        {coords ? (
          <p className="text-xs text-gray-300">
            {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
          </p>
        ) : (
          <p className="text-xs text-gray-500">Not yet retrieved</p>
        )}
        <button
          type="button"
          onClick={getLocation}
          disabled={locationStatus === 'getting'}
          className="text-xs text-sky-400 hover:text-white disabled:opacity-50"
        >
          {locationStatus === 'getting' ? 'Getting location…' : 'Use my location'}
        </button>
      </section>

      <p className="text-[11px] text-gray-500 font-mono break-all">
        Wallet: {address}
      </p>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      {success && (
        <p className="text-xs text-green-400">{success}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-center text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-auto"
      >
        {submitting ? 'Registering…' : 'Register SBT'}
      </button>
    </div>
  );
}
