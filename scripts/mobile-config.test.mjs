import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { nativeBuildContract, publicKeyFingerprint } from './mobile-config.mjs';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = keys.publicKey.export({ format: 'jwk' });
const env = {
  VITE_MOBILE_MANIFEST_IOS: 'https://updates.trialsgauntlet.app/ios/manifest.json',
  VITE_MOBILE_MANIFEST_ANDROID: 'https://updates.trialsgauntlet.app/android/manifest.json',
  VITE_MOBILE_PUBLIC_KEY: JSON.stringify(jwk),
};

test('local build can omit OTA, but store builds require both real channels and a public key', () => {
  assert.equal(nativeBuildContract({}).channels, null);
  assert.throws(() => nativeBuildContract({}, { production: true }), /require both/);
  assert.throws(() => nativeBuildContract({ VITE_MOBILE_PUBLIC_KEY: env.VITE_MOBILE_PUBLIC_KEY }), /require both/);
  const c = nativeBuildContract(env, { production: true, sourceRevision: 'abc123' });
  assert.equal(c.production, true);
  assert.equal(c.sourceRevision, 'abc123');
  assert.equal(c.publicKeyFingerprint, publicKeyFingerprint(jwk));
  assert.equal(publicKeyFingerprint({ ...jwk, kid: 'annotation' }), c.publicKeyFingerprint);
});

test('channel mistakes fail before producing an unusable store build', () => {
  for (const url of ['http://updates.trialsgauntlet.app/ios/manifest.json', 'https://user:pass@updates.trialsgauntlet.app/ios/manifest.json', env.VITE_MOBILE_MANIFEST_IOS + '?secret=x', 'https://updates.trialsgauntlet.app/ios/wrong.json']) {
    assert.throws(() => nativeBuildContract({ ...env, VITE_MOBILE_MANIFEST_IOS: url }), /channel must/);
  }
  assert.throws(() => nativeBuildContract({ ...env, VITE_MOBILE_MANIFEST_ANDROID: env.VITE_MOBILE_MANIFEST_IOS }), /separate/);
  for (const host of ['localhost:8443', '10.0.2.2:8443', '[::1]', 'updates.example']) {
    const local = { ...env, VITE_MOBILE_MANIFEST_IOS: `https://${host}/ios/manifest.json` };
    assert.ok(nativeBuildContract(local).channels);
    assert.throws(() => nativeBuildContract(local, { production: true }), /production channel/);
  }
});

test('private or weak keys cannot leak through public build configuration', () => {
  for (const field of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth']) assert.throws(() => publicKeyFingerprint({ ...jwk, [field]: 'secret' }), /public RSA/);
  const weak = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ format: 'jwk' });
  assert.throws(() => publicKeyFingerprint(weak), /2048/);
  assert.throws(() => publicKeyFingerprint({ kty: 'EC' }), /public RSA/);
});
