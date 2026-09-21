/** Runtime inspection handles used only after the headless harness has booted.
 * Captures request GLTF explicitly and check source.scene before using the rig. */
import type { ThreeRenderer } from '../src/render';
import type { FrameBuilder } from '../src/render/frame';
import type { GltfBike } from '../src/render/hero/gltfBike';
import type { GltfRider } from '../src/render/hero/gltfRider';

type RendererProbe = Pick<ThreeRenderer, 'whenReady' | 'render' | 'debugInfo' | 'setRiderLod' | 'setQuality' | 'resize' | 'setDeviceClass'> & {
  readonly frames: FrameBuilder;
  readonly debug: Omit<ThreeRenderer['debug'], 'rider' | 'bike'> & { rider: GltfRider; bike: GltfBike };
};

export interface HeroHarnessWindow extends Window {
  __render: RendererProbe;
  __assetProof: { hashes: Record<string, string>; pending: Promise<void>[]; errors: string[] };
}
