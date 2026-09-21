import { createHash, createPublicKey } from 'node:crypto';

/** Fingerprint only the public RSA key, independent of optional JWK annotations. */
export function publicKeyFingerprint(jwk) {
  if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e || ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some(k => k in jwk)) throw new Error('Mobile update key must be a public RSA JWK');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  if (key.asymmetricKeyDetails.modulusLength < 2048) throw new Error('Mobile update RSA key must be at least 2048 bits');
  return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}

function channel(value, production) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/manifest.json')) throw new Error('Mobile channel must be a plain HTTPS manifest.json URL');
  const host = url.hostname.toLowerCase();
  if (production && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.test') || host.endsWith('.invalid') || host.endsWith('.example') || host === 'example.com' || host.endsWith('.example.com') || /^[\d.]+$/.test(host) || host.startsWith('['))) throw new Error('Store builds require a production channel hostname');
  return url.href;
}

/** Build and packager share this contract; no private configuration is emitted. */
export function nativeBuildContract(env, { production = false, sourceRevision = 'unknown' } = {}) {
  const ios = env.VITE_MOBILE_MANIFEST_IOS, android = env.VITE_MOBILE_MANIFEST_ANDROID, key = env.VITE_MOBILE_PUBLIC_KEY;
  const configured = Boolean(ios || android || key);
  if ((production || configured) && !(ios && android && key)) throw new Error('Native updates require both platform manifest URLs and VITE_MOBILE_PUBLIC_KEY');
  const channels = configured ? { ios: channel(ios, production), android: channel(android, production) } : null;
  if (channels && channels.ios === channels.android) throw new Error('iOS and Android need separate update manifests');
  return {
    schema: 1, target: 'native', runtime: 'native-v1', saveSchema: 1,
    sourceRevision, production, channels,
    publicKeyFingerprint: configured ? publicKeyFingerprint(JSON.parse(key)) : null,
  };
}
