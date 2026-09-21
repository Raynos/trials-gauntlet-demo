import type { ShaderMaterial } from 'three';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

/** Three r186's bundled SMAA color-edge pass. Its neighborhood shader gamma-decodes
 * and re-encodes the graded samples, so it consumes the composite's display colors.
 * LOW follows Wildshard's phone threshold/search budget; desktop keeps the bundled
 * medium algorithm (it does not implement Wildshard HIGH's diagonal search).
 */
export class FinalSMAA extends SMAAPass {
  private low = false;

  setLow(low: boolean): void {
    if (low === this.low) return;
    this.low = low;
    // r186 renamed these fields; @types/three still exposes the older public names.
    const materials = this as unknown as { _materialEdges: ShaderMaterial; _materialWeights: ShaderMaterial };
    materials._materialEdges.defines.SMAA_THRESHOLD = low ? '0.15' : '0.1';
    materials._materialWeights.defines.SMAA_MAX_SEARCH_STEPS = low ? '4' : '8';
    materials._materialEdges.needsUpdate = true;
    materials._materialWeights.needsUpdate = true;
  }
}
