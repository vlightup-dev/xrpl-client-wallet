/**
 * Persist register-sbt response in chrome.storage.local so it survives browser/PC restart.
 * Same approach as wallet storage; no Firebase required for the extension.
 */

const SBT_STORAGE_KEYS = {
  USER_ID: 'sbtUserId',
  DIGITAL_ID: 'sbtDigitalId',
  DIGITAL_SECRET: 'sbtDigitalSecret',
  GEOAUTH_SECRET: 'sbtGeoauthSecret',
  ACCESS_TOKEN: 'sbtAccessToken',
  API_KEY: 'sbtApiKey',
} as const;

export type SbtCredentials = {
  user_id: string;
  digital_id: string;
  digital_secret: string;
  geoauth_secret: string;
  access_token: string;
  api_key?: string;
};

export async function setSbtCredentials(creds: SbtCredentials): Promise<void> {
  await chrome.storage.local.set({
    [SBT_STORAGE_KEYS.USER_ID]: creds.user_id,
    [SBT_STORAGE_KEYS.DIGITAL_ID]: creds.digital_id,
    [SBT_STORAGE_KEYS.DIGITAL_SECRET]: creds.digital_secret,
    [SBT_STORAGE_KEYS.GEOAUTH_SECRET]: creds.geoauth_secret,
    [SBT_STORAGE_KEYS.ACCESS_TOKEN]: creds.access_token,
    [SBT_STORAGE_KEYS.API_KEY]: creds.api_key ?? null,
  });
}

export async function getSbtCredentials(): Promise<SbtCredentials | null> {
  const result = await chrome.storage.local.get([
    SBT_STORAGE_KEYS.USER_ID,
    SBT_STORAGE_KEYS.DIGITAL_ID,
    SBT_STORAGE_KEYS.DIGITAL_SECRET,
    SBT_STORAGE_KEYS.GEOAUTH_SECRET,
    SBT_STORAGE_KEYS.ACCESS_TOKEN,
    SBT_STORAGE_KEYS.API_KEY,
  ]);
  const user_id = result[SBT_STORAGE_KEYS.USER_ID] as string | undefined;
  const access_token = result[SBT_STORAGE_KEYS.ACCESS_TOKEN] as string | undefined;
  if (!user_id || !access_token) return null;
  return {
    user_id,
    digital_id: (result[SBT_STORAGE_KEYS.DIGITAL_ID] as string) ?? '',
    digital_secret: (result[SBT_STORAGE_KEYS.DIGITAL_SECRET] as string) ?? '',
    geoauth_secret: (result[SBT_STORAGE_KEYS.GEOAUTH_SECRET] as string) ?? '',
    access_token,
    api_key: (result[SBT_STORAGE_KEYS.API_KEY] as string) || undefined,
  };
}

export async function clearSbtCredentials(): Promise<void> {
  await chrome.storage.local.remove(Object.values(SBT_STORAGE_KEYS));
}

export async function hasSbtCredentials(): Promise<boolean> {
  const creds = await getSbtCredentials();
  return creds != null;
}
