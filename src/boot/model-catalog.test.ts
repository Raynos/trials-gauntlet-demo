import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { modelAssetsPlugin, readModelCatalog, writeModelCatalog } from './model-catalog';

const directories: string[] = [];
const servers: ViteDevServer[] = [];
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()));
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const base = path.resolve('harness/out/model-catalog-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'case-'));
  directories.push(root);
  const publicDir = path.join(root, 'public');
  await mkdir(path.join(publicDir, 'models'), { recursive: true });
  await mkdir(path.join(root, 'src/render/hero'), { recursive: true });
  const full = Buffer.from([0, 1, 2, 3, 250]);
  const lod = Buffer.from([6, 7, 8]);
  await writeFile(path.join(publicDir, 'models/bike.glb'), full);
  await writeFile(path.join(publicDir, 'models/bike-lod.glb'), lod);
  return { root, publicDir, full, lod };
}

describe('content-addressed model byte snapshots', () => {
  it('hashes actual bytes, generates the same runtime URLs, and advances both paths together', async () => {
    const { root, publicDir, full, lod } = await fixture();
    const before = readModelCatalog(publicDir, ['models/bike.glb', 'models/bike-lod.glb']);
    const fullAsset = before.find(asset => asset.logical === 'models/bike.glb')!;
    const lodAsset = before.find(asset => asset.logical === 'models/bike-lod.glb')!;
    expect(fullAsset.sha256).toBe(hash(full));
    expect(lodAsset.sha256).toBe(hash(lod));
    expect(fullAsset.url).toContain(`bike-${hash(full).slice(0, 16)}.glb`);
    expect(path.posix.dirname(fullAsset.url)).toBe(path.posix.dirname(lodAsset.url));
    expect(fullAsset.url).not.toContain('?');
    writeModelCatalog(root, before);
    const source = await readFile(path.join(root, 'src/render/hero/models.generated.ts'), 'utf8');
    expect(source).toContain(JSON.stringify(fullAsset.url));
    expect(source).toContain(JSON.stringify(lodAsset.url));
    await writeFile(path.join(publicDir, 'models/bike.glb'), Buffer.from([0, 1, 2, 3, 249]));
    const after = readModelCatalog(publicDir);
    for (const asset of before) expect(after.find(next => next.logical === asset.logical)!.url).not.toBe(asset.url);
    expect(after.find(asset => asset.logical === lodAsset.logical)!.sha256).toBe(lodAsset.sha256);
    expect(fullAsset.bytes).toEqual(full); // an existing URL never starts serving newer disk bytes
  });

  it('rejects absent required assets and incomplete full/LOD pairs', async () => {
    const { publicDir } = await fixture();
    expect(() => readModelCatalog(publicDir, ['models/rider-street.glb'])).toThrow('missing required asset models/rider-street.glb');
    await rm(path.join(publicDir, 'models/bike-lod.glb'));
    expect(() => readModelCatalog(publicDir)).toThrow('full/LOD pair is incomplete');
  });

  it('serves and emits byte-identical bodies at the generated URLs, with unknown snapshots rejected', async () => {
    const { root, publicDir } = await fixture();
    const plugin = modelAssetsPlugin(['models/bike.glb', 'models/bike-lod.glb']);
    const server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [plugin], server: { host: '127.0.0.1', port: 0 } });
    servers.push(server);
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('Expected local HTTP server');
    const assets = readModelCatalog(publicDir);
    const emitted: { fileName: string; source: Uint8Array | string }[] = [];
    // Exercise the emission hook without starting a build or writing dist.
    const emit = plugin.generateBundle as (this: { emitFile(asset: { fileName: string; source: Uint8Array | string }): void }) => void;
    emit.call({ emitFile: asset => { emitted.push(asset); } });
    const catalog = emitted.find(item => item.fileName === 'model-catalog.json')!;
    const metadata = JSON.parse(typeof catalog.source === 'string' ? catalog.source : Buffer.from(catalog.source).toString()) as { models: { logical: string; url: string; bytes: number; sha256: string }[] };
    expect(metadata.models).toEqual(assets.map(asset => ({ logical: asset.logical, url: asset.url, bytes: asset.bytes.length, sha256: asset.sha256 })));
    for (const asset of assets) {
      const response = await fetch(`http://127.0.0.1:${address.port}/${asset.url}?ignored-by-old-sw=1`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('model/gltf-binary');
      expect(Number(response.headers.get('content-length'))).toBe(asset.bytes.length);
      const served = Buffer.from(await response.arrayBuffer());
      expect(hash(served)).toBe(asset.sha256);
      expect(served).toEqual(asset.bytes);
      expect(Buffer.from(emitted.find(item => item.fileName === asset.url)!.source)).toEqual(served);
    }
    const missing = await fetch(`http://127.0.0.1:${address.port}/models/0000000000000000/bike-0000000000000000.glb`);
    expect(missing.status).toBe(404);
  });
});
