import * as THREE from 'three';
// Standalone garage preview. Belt and constant-length hose math adapted from the
// repository's production mechanism; this is authored kinematics, not physics.
function beltPoint(u: number, rear: THREE.Vector3, rr: number, front: THREE.Vector3, fr: number, point: THREE.Vector3, normal: THREE.Vector3): number {
  const dx = front.x - rear.x, dy = front.y - rear.y;
  const distance = Math.hypot(dx, dy);
  const phi = Math.atan2(dy, dx), alpha = Math.acos((rr - fr) / distance);
  const top = phi + alpha, bottom = phi - alpha;
  const tangent = Math.sqrt(distance * distance - (rr - fr) ** 2);
  const frontArc = 2 * alpha * fr, total = 2 * tangent + frontArc + (Math.PI * 2 - 2 * alpha) * rr;
  const v = (u - Math.floor(u)) * total;
  let angle: number;
  if (v < tangent) {
    const k = v / tangent; angle = top;
    point.set(rear.x + rr * Math.cos(top) + k * (dx + (fr - rr) * Math.cos(top)), rear.y + rr * Math.sin(top) + k * (dy + (fr - rr) * Math.sin(top)), rear.z);
  } else if (v < tangent + frontArc) {
    angle = top - (v - tangent) / fr;
    point.set(front.x + fr * Math.cos(angle), front.y + fr * Math.sin(angle), rear.z);
  } else if (v < 2 * tangent + frontArc) {
    const k = (v - tangent - frontArc) / tangent; angle = bottom;
    point.set(front.x + fr * Math.cos(bottom) + k * (-dx + (rr - fr) * Math.cos(bottom)), front.y + fr * Math.sin(bottom) + k * (-dy + (rr - fr) * Math.sin(bottom)), rear.z);
  } else {
    angle = bottom - (v - 2 * tangent - frontArc) / rr;
    point.set(rear.x + rr * Math.cos(angle), rear.y + rr * Math.sin(angle), rear.z);
  }
  normal.set(Math.cos(angle), Math.sin(angle), 0);
  return total;
}


/** Bend the exported tube around a constant-length centerline. Its upper guide is fixed;
 * the caliper endpoint follows the fork. Vertex topology, UVs and material stay authored.
 * Only this instance owns the changing geometry (including when used by a ghost).
 */
class BrakeHose {
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

/** Create once after catalog placement; call apply after setting the rider clip time. */
export function createBikeSuspension(bike: THREE.Object3D, rider: THREE.Object3D) {
  const get=(name:string)=>{const o=bike.getObjectByName(name);if(!o)throw new Error(`Missing bike part ${name}`);return o;};
  bike.updateWorldMatrix(true,true);
  const point=(name:string)=>bike.worldToLocal(get('attach_'+name).getWorldPosition(new THREE.Vector3()));
  const F=point('front_axle_rest'), A=point('rear_axle_rest'), P=point('swing_pivot');
  const axis=point('fork_top').sub(F).normalize(), length=A.distanceTo(P), z=new THREE.Vector3(0,0,1);
  const top=point('shock_top'), linkRest=point('shock_link'), direction=linkRest.clone().sub(top).normalize();
  const upper=top.distanceTo(point('shock_upper_seat')), lower=linkRest.distanceTo(point('shock_lower_seat'));
  const inset=top.distanceTo(point('shock_rod_top')), rod=linkRest.distanceTo(point('shock_rod_top'));
  const spring=point('shock_upper_seat').distanceTo(point('shock_lower_seat'));
  const names=['wheel_front','wheel_rear','fork_lower','swingarm','shock_body','shock_shaft','shock_clevis','shock_spring'];
  const nodes=names.map(get), snapshots=[bike,rider,...nodes].map(o=>({o,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}));
  const base=snapshots[0]!, riderBase=snapshots[1]!;
  if(bike.parent!==rider.parent || bike.position.distanceTo(rider.position)>1e-6 || bike.quaternion.angleTo(rider.quaternion)>1e-6 || bike.scale.distanceTo(rider.scale)>1e-6)throw new Error('Suspension preview requires shared rider/bike placement');
  const shockQ=get('shock_body').quaternion.clone();
  const chain=get('chain') as THREE.Mesh; chain.geometry=chain.geometry.clone();
  const hoseMesh=get('brake_hose') as THREE.Mesh;
  const hose=new BrakeHose(hoseMesh);
  const geometryStates=[chain,hoseMesh].map(m=>({m,p:m.geometry.getAttribute('position').array.slice(),n:m.geometry.getAttribute('normal').array.slice()}));
  const counter=point('countershaft'), rr=point('rear_pitch').distanceTo(point('rear_sprocket')), fr=point('front_pitch').distanceTo(counter), radius=Number(chain.userData.tube_radius);
  const cp=new THREE.Vector3(),cn=new THREE.Vector3();
  let diagnostics={amount:0,stroke:0,chassisPitch:0,armLengthError:0,frontAxleError:0,rearAxleError:0};
  function reset(){
    for(const {o,p,q,s} of snapshots){o.position.copy(p);o.quaternion.copy(q);o.scale.copy(s);}
    for(const {m,p,n} of geometryStates){const gp=m.geometry.getAttribute('position'),gn=m.geometry.getAttribute('normal');gp.array.set(p);gn.array.set(n);gp.needsUpdate=gn.needsUpdate=true;m.geometry.computeBoundingBox();m.geometry.computeBoundingSphere();}
    bike.updateWorldMatrix(true,true);rider.updateWorldMatrix(true,true);
  }
  function apply(amount:number){
    reset(); const a=THREE.MathUtils.clamp(Number.isFinite(amount)?amount:0,0,1),s=.025*a;
    if(s===0){diagnostics={amount:0,stroke:0,chassisPitch:0,armLengthError:0,frontAxleError:0,rearAxleError:0};return diagnostics;}
    // The fork slider fixes translation for a chosen chassis pitch. Solve pitch
    // against the rigid rear arm, keeping both tyre centers fixed in the parent.
    const rearAt=(theta:number)=>A.clone().sub(F).applyAxisAngle(z,-theta).add(F).addScaledVector(axis,s);
    const error=(theta:number)=>rearAt(theta).distanceToSquared(P)-length*length;
    let theta=0;
    for(let i=0;i<12;i++){const e=error(theta),h=1e-6,derivative=(error(theta+h)-error(theta-h))/(2*h);if(Math.abs(derivative)<1e-8)throw new Error('Singular suspension preview');theta-=e/derivative;}
    if(Math.abs(error(theta))>1e-9 || Math.abs(theta)>.15)throw new Error('Suspension preview closure failed');
    const rotation=new THREE.Quaternion().setFromAxisAngle(z,theta);
    const translation=F.clone().sub(F.clone().addScaledVector(axis,s).applyQuaternion(rotation));
    bike.position.copy(base.p).add(translation.clone().multiply(base.s).applyQuaternion(base.q));bike.quaternion.copy(base.q).multiply(rotation);
    rider.position.copy(riderBase.p).add(translation.clone().multiply(base.s).applyQuaternion(base.q));rider.quaternion.copy(riderBase.q).multiply(rotation);
    const front=F.clone().addScaledVector(axis,s),rear=rearAt(theta);
    get('wheel_front').position.copy(front);get('wheel_rear').position.copy(rear);get('fork_lower').position.copy(front);
    // Counter-rotate tyres so their authored tread contacts remain fixed too.
    get('wheel_front').quaternion.premultiply(rotation.clone().invert());get('wheel_rear').quaternion.premultiply(rotation.clone().invert());
    get('swingarm').rotation.z+=Math.atan2(rear.y-P.y,rear.x-P.x)-Math.atan2(A.y-P.y,A.x-P.x);
    bike.updateWorldMatrix(true,true);
    const link=point('shock_link'),delta=link.clone().sub(top),shockLength=delta.length();delta.normalize();
    const q=new THREE.Quaternion().setFromUnitVectors(direction,delta).multiply(shockQ);
    get('shock_body').quaternion.copy(q);
    for(const name of ['shock_clevis','shock_shaft']){get(name).position.copy(link);get(name).quaternion.copy(q);}
    get('shock_shaft').scale.y=(shockLength-inset)/rod;
    get('shock_spring').position.copy(top).addScaledVector(delta,upper);get('shock_spring').quaternion.copy(q);get('shock_spring').scale.y=(shockLength-upper-lower)/spring;
    const sprocket=point('rear_sprocket'),pos=chain.geometry.getAttribute('position'),normal=chain.geometry.getAttribute('normal'),uv=chain.geometry.getAttribute('uv');
    for(let i=0;i<pos.count;i++){beltPoint(uv.getX(i),sprocket,rr,counter,fr,cp,cn);const angle=(1-uv.getY(i))*Math.PI*2,c=Math.cos(angle),sn=Math.sin(angle);pos.setXYZ(i,cp.x+cn.x*radius*c,cp.y+cn.y*radius*c,cp.z-radius*sn);normal.setXYZ(i,cn.x*c,cn.y*c,-sn);}
    pos.needsUpdate=normal.needsUpdate=true;chain.geometry.computeBoundingBox();chain.geometry.computeBoundingSphere();hose.update(front.x-F.x,front.y-F.y);hoseMesh.geometry.computeBoundingBox();
    bike.updateWorldMatrix(true,true);rider.updateWorldMatrix(true,true);
    const parentPoint=(o:THREE.Object3D)=>o.getWorldPosition(new THREE.Vector3()).applyMatrix4(bike.parent!.matrixWorld.clone().invert());
    const expected=(v:THREE.Vector3)=>v.clone().multiply(base.s).applyQuaternion(base.q).add(base.p);
    diagnostics={amount:a,stroke:s,chassisPitch:theta,armLengthError:Math.abs(rear.distanceTo(P)-length),frontAxleError:parentPoint(get('wheel_front')).distanceTo(expected(F)),rearAxleError:parentPoint(get('wheel_rear')).distanceTo(expected(A))};
    return diagnostics;
  }
  return {apply,setAmount:apply,reset,getDiagnostics:()=>({...diagnostics})};
}
