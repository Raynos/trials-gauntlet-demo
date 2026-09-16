import * as THREE from 'three';

/** Bend the exported tube around a constant-length centerline. Its upper guide is fixed;
 * the caliper endpoint follows the fork. Vertex topology, UVs and material stay authored.
 * Only this instance owns the changing geometry (including when used by a ghost).
 */
export class BrakeHose {
  readonly geometry: THREE.BufferGeometry;
  readonly stations: THREE.Vector3[];
  readonly length: number;
  private readonly rest: THREE.Vector3[];
  private readonly sine: Float64Array;
  private readonly sineStepSquared: Float64Array;
  private readonly vertexStation: Uint16Array;
  private readonly offsets: Float64Array;
  private readonly normalOffsets: Float64Array;
  private readonly tx: Float64Array;
  private readonly ty: Float64Array;
  private readonly position: THREE.BufferAttribute;
  private readonly normal: THREE.BufferAttribute;

  constructor(mesh: THREE.Mesh) {
    const data = mesh.userData['hose_stations'] as unknown;
    const length = Number(mesh.userData['hose_length']);
    if (!Array.isArray(data) || data.length < 9 || data.length % 3 ||
        !data.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)) || !(length > 0)) {
      throw new Error('brake hose is missing its authored centerline');
    }
    this.length = length;
    this.rest = [];
    for (let i = 0; i < data.length; i += 3) this.rest.push(new THREE.Vector3(data[i], data[i + 1], data[i + 2]));
    if (this.rest.some(p => Math.abs(p.z - this.rest[0]!.z) > 1e-6)) throw new Error('brake hose centerline must lie in its authored side plane');
    this.stations = this.rest.map(p => p.clone());
    this.sine = Float64Array.from(this.rest, (_, i) => Math.sin(Math.PI * i / (this.rest.length - 1)));
    this.sineStepSquared = Float64Array.from(this.sine, (v, i) => i ? (v - this.sine[i - 1]!) ** 2 : 0);
    this.tx = new Float64Array(this.rest.length); this.ty = new Float64Array(this.rest.length);
    this.frames();
    this.geometry = mesh.geometry.clone();
    const source = this.geometry.getAttribute('position'), normals = this.geometry.getAttribute('normal');
    this.position = new THREE.Float32BufferAttribute(new Float32Array(source.count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.normal = new THREE.Float32BufferAttribute(new Float32Array(source.count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.vertexStation = new Uint16Array(source.count);
    this.offsets = new Float64Array(source.count * 3); this.normalOffsets = new Float64Array(source.count * 3);
    for (let i = 0; i < source.count; i++) {
      const x = source.getX(i), y = source.getY(i), z = source.getZ(i);
      let station = 0, best = Infinity;
      for (let j = 0; j < this.rest.length; j++) {
        const p = this.rest[j]!, d = (x - p.x) ** 2 + (y - p.y) ** 2 + (z - p.z) ** 2;
        if (d < best) { best = d; station = j; }
      }
      const p = this.rest[station]!, tx = this.tx[station]!, ty = this.ty[station]!;
      // Tangent, side normal (+Z), then tangent × side normal.
      this.vertexStation[i] = station;
      this.offsets.set([(x - p.x) * tx + (y - p.y) * ty, z - p.z, (x - p.x) * ty - (y - p.y) * tx], i * 3);
      this.normalOffsets.set([normals.getX(i) * tx + normals.getY(i) * ty, normals.getZ(i), normals.getX(i) * ty - normals.getY(i) * tx], i * 3);
      this.position.setXYZ(i, x, y, z); this.normal.setXYZ(i, normals.getX(i), normals.getY(i), normals.getZ(i));
    }
    this.geometry.setAttribute('position', this.position); this.geometry.setAttribute('normal', this.normal);
    mesh.geometry = this.geometry;
  }

  private frames(): void {
    for (let i = 0; i < this.stations.length; i++) {
      const a = this.stations[Math.max(0, i - 1)]!, b = this.stations[Math.min(this.stations.length - 1, i + 1)]!;
      const dx = b.x - a.x, dy = b.y - a.y, inverse = 1 / Math.hypot(dx, dy);
      this.tx[i] = dx * inverse; this.ty[i] = dy * inverse;
    }
  }

  update(dx: number, dy: number): void {
    const start = this.rest[0]!, end = this.rest[this.rest.length - 1]!;
    const x = end.x + dx - start.x, y = end.y + dy - start.y, chord = Math.hypot(x, y);
    if (!(chord > 0 && chord < this.length)) throw new Error('front brake hose endpoints exceed the authored hose length');
    const nx = -y / chord, ny = x / chord, count = this.stations.length - 1;
    // Arc length is monotone in nonnegative bulge amplitude because it is normal
    // to the chord. Fixed bisection bounds cost and never stretches the hose to fit.
    let lo = 0, hi = this.length;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (this.arcLength(chord, mid) < this.length) lo = mid; else hi = mid;
    }
    const amplitude = (lo + hi) / 2;
    for (let i = 0; i <= count; i++) this.stations[i]!.set(start.x + x * i / count + nx * amplitude * this.sine[i]!, start.y + y * i / count + ny * amplitude * this.sine[i]!, start.z);
    this.frames();
    for (let i = 0; i < this.position.count; i++) {
      const j = this.vertexStation[i]!, p = this.stations[j]!, tx = this.tx[j]!, ty = this.ty[j]!, k = i * 3;
      this.position.setXYZ(i, p.x + tx * this.offsets[k]! + ty * this.offsets[k + 2]!, p.y + ty * this.offsets[k]! - tx * this.offsets[k + 2]!, p.z + this.offsets[k + 1]!);
      this.normal.setXYZ(i, tx * this.normalOffsets[k]! + ty * this.normalOffsets[k + 2]!, ty * this.normalOffsets[k]! - tx * this.normalOffsets[k + 2]!, this.normalOffsets[k + 1]!);
    }
    this.position.needsUpdate = true; this.normal.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  private arcLength(chord: number, amplitude: number): number {
    const chordStepSquared = (chord / (this.stations.length - 1)) ** 2, a2 = amplitude * amplitude;
    let total = 0;
    for (let i = 1; i < this.stations.length; i++) total += Math.sqrt(chordStepSquared + a2 * this.sineStepSquared[i]!);
    return total;
  }

  dispose(): void { this.geometry.dispose(); }
}
