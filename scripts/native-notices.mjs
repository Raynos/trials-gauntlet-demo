#!/usr/bin/env node
/** Generate bundled notices from shipped npm packages and captured resolved native inputs. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(root, 'docs/native/third-party-sources.json');
const outputPath = join(root, 'public/native-notices.txt');
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim();
const sha = (text) => createHash('sha256').update(text).digest('hex');
const runtime = ['three', '@capacitor/core', '@capacitor/android', '@capacitor/ios', '@capacitor/app', '@capacitor/filesystem', '@capgo/capacitor-updater'];
const inputPaths = ['android/variables.gradle', 'android/app/build.gradle', 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved',
  'node_modules/@capacitor/android/capacitor/build.gradle',
  ...['@capacitor/app', '@capacitor/filesystem', '@capgo/capacitor-updater'].map((name) => `node_modules/${name}/android/build.gradle`)];
const inputs = () => Object.fromEntries(inputPaths.map((path) => [path, sha(read(join(root, path)))]));

// Python's standard library reads Maven XML and nested JAR notices; no runtime/dev packages are installed.
if (process.argv.includes('--refresh-native')) {
  const capture = String.raw`
import hashlib, io, json, os, pathlib, re, urllib.request, xml.etree.ElementTree as E, zipfile
root=pathlib.Path.cwd()
cache=pathlib.Path(os.environ.get('GRADLE_USER_HOME',str(pathlib.Path.home()/'.gradle')))/'caches/modules-2/files-2.1'
report=root/'.native-build/android-release-dependencies.txt'
text=report.read_text()
if 'BUILD SUCCESSFUL' not in text or 'releaseRuntimeClasspath' not in text: raise RuntimeError('Need a successful releaseRuntimeClasspath report')
coords=set()
for line in text.splitlines():
 if '(c)' in line: continue
 m=re.search(r'--- ([\w.-]+):([\w.-]+)(?::([\w.+-]+))?(?: -> ([\w.+-]+))?',line)
 if m and (m[4] or m[3]): coords.add((m[1],m[2],m[4] or m[3]))
ns={'m':'http://maven.apache.org/POM/4.0.0'}
def pom_meta(g,a,v):
 paths=sorted((cache/g/a/v).glob('*/*.pom'))
 if not paths: raise RuntimeError('Missing resolved POM: '+':'.join((g,a,v)))
 p=E.parse(paths[0]).getroot()
 licenses=[{'name':n.findtext('m:name',namespaces=ns),'url':n.findtext('m:url',namespaces=ns)} for n in p.findall('m:licenses/m:license',ns)]
 source=p.findtext('m:scm/m:url',namespaces=ns) or p.findtext('m:url',namespaces=ns)
 parent=p.find('m:parent',ns)
 if (not licenses or not source) and parent is not None:
  inherited=pom_meta(*[parent.findtext('m:'+k,namespaces=ns) for k in ['groupId','artifactId','version']])
  licenses=licenses or inherited['licenses']; source=source or inherited['source']
 return {'licenses':licenses,'source':source}
def archive_notices(data,prefix=''):
 out=[]
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  for name in sorted(z.namelist()):
   if re.search(r'(^|/)(LICENSE|NOTICE|COPYING|COPYRIGHT)(\.|$)',name,re.I):
    out.append({'path':prefix+name,'text':z.read(name).decode('utf-8').replace('\r\n','\n').strip()})
   elif name=='classes.jar': out.extend(archive_notices(z.read(name),prefix+'classes.jar/'))
 return out
android=[]; metadata=[]
for g,a,v in sorted(coords):
 binaries=sorted(f for f in (cache/g/a/v).glob('*/*') if f.suffix in ['.jar','.aar'] and not f.name.endswith(('-sources.jar','-javadoc.jar')))
 if not binaries:
  metadata.append(':'.join((g,a,v))); continue
 meta=pom_meta(g,a,v)
 if not meta['licenses']: raise RuntimeError('No license in resolved POM/parent: '+':'.join((g,a,v)))
 notices=[]
 for binary in binaries: notices.extend(archive_notices(binary.read_bytes(),binary.name+'/'))
 android.append({'name':':'.join((g,a,v)),**meta,'notices':notices})
pins=json.loads((root/'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved').read_text())['pins']
checkouts=root/'.native-build/ios/SourcePackages/checkouts'
swift=[]
for pin in sorted(pins,key=lambda p:p['identity']):
 checkout=next((p for p in checkouts.iterdir() if p.name.lower()==pin['identity'].lower()),None)
 if checkout is None: raise RuntimeError('Missing Swift checkout: '+pin['identity'])
 notices=[{'path':p.name,'text':p.read_text().replace('\r\n','\n').strip()} for p in sorted(checkout.iterdir()) if p.is_file() and re.match(r'^(LICENSE|NOTICE|COPYING)(\.|$)',p.name,re.I)]
 if not notices: raise RuntimeError('No Swift license: '+pin['identity'])
 swift.append({'name':pin['identity'],'version':pin['state']['version'],'revision':pin['state']['revision'],'source':pin['location'].removesuffix('.git')+'/tree/'+pin['state']['revision'],'notices':notices})
# Supplemental licenses not included as text in their binary archive, plus complete bundled-font OFL.
urls={
 'ION Android filesystem MIT':'https://raw.githubusercontent.com/ionic-team/ion-android-filesystem/1.1.0/LICENSE',
 'Brotli MIT':'https://raw.githubusercontent.com/google/brotli/master/LICENSE',
 'Barlow OFL 1.1':'https://raw.githubusercontent.com/jpt/barlow/main/OFL.txt',
}
extras=[]
for name,url in urls.items():
 data=urllib.request.urlopen(url,timeout=30).read().decode('utf-8').replace('\r\n','\n').strip()
 extras.append({'name':name,'source':url,'sha256':hashlib.sha256(data.encode()).hexdigest(),'text':data})
print(json.dumps({'android':android,'swift':swift,'metadataOnly':metadata,'extras':extras},indent=2))
`;
  const native = JSON.parse(execFileSync('python3', ['-c', capture], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  native.inputs = inputs();
  writeFileSync(sourcePath, `${JSON.stringify(native, null, 2)}\n`);
}

const native = JSON.parse(read(sourcePath));
if (JSON.stringify(native.inputs) !== JSON.stringify(inputs())) throw new Error('Native dependency inputs changed. Resolve native projects and regenerate with --refresh-native (see docs/native/THIRD_PARTY.md).');
const sections = [];
const texts = new Map();
function fullText(label, text) {
  // Preserve wording and paragraph indentation; canonicalize insignificant line-end whitespace.
  text = text.replace(/[ \t]+$/gm, '');
  const id = sha(text).slice(0, 12);
  if (!texts.has(id)) texts.set(id, { labels: [], text });
  const item = texts.get(id);
  if (!item.labels.includes(label)) item.labels.push(label);
  return `Full license/notice text: ${id}`;
}
function section(title, lines) { sections.push(`${title}\n${'-'.repeat(Math.min(title.length, 80))}\n${lines.join('\n')}`.replace(/[ \t]+$/gm, '')); }
function packageRoot(name, from = join(root, 'package.json')) {
  if (from === join(root, 'package.json')) return realpathSync(join(root, 'node_modules', name));
  const require = createRequire(from);
  let directory = dirname(require.resolve(name));
  while (!existsSync(join(directory, 'package.json')) || JSON.parse(read(join(directory, 'package.json'))).name !== name) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot find metadata for ${name}`);
    directory = parent;
  }
  return directory;
}
const visited = new Set();
function npmPackage(name, from) {
  const directory = packageRoot(name, from);
  const pkg = JSON.parse(read(join(directory, 'package.json')));
  if (visited.has(`${name}@${pkg.version}`)) return;
  visited.add(`${name}@${pkg.version}`);
  const source = (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? pkg.homepage ?? `https://www.npmjs.com/package/${name}/v/${pkg.version}`).replace(/^git\+/, '').replace(/\.git$/, '');
  const notices = readdirSync(directory).filter((file) => /^(license|notice|copying|copyrightnotice)(\.|$)/i.test(file)).sort();
  if (!notices.length || !pkg.license) throw new Error(`Missing runtime package license: ${name}`);
  section(`${name} ${pkg.version}`, [`Declared package license: ${pkg.license}`, `Source: ${source}`, ...notices.map((file) => fullText(`${name}/${file}`, read(join(directory, file))))]);
  for (const dependency of Object.keys(pkg.dependencies ?? {}).sort()) npmPackage(dependency, join(directory, 'package.json'));
}
if (JSON.parse(read(join(root, 'node_modules/@capgo/capacitor-updater/package.json'))).version !== '8.51.20') throw new Error('Updater version changed; audit and replace the pinned MPL source-availability URL before generating notices.');
for (const name of runtime) npmPackage(name);
const mesh = read(join(root, 'node_modules/three/examples/jsm/libs/meshopt_decoder.module.js'));
const meshVersion = mesh.match(/Built from meshoptimizer ([\d.]+)/)?.[1];
if (!meshVersion) throw new Error('Cannot identify shipped meshopt decoder version');
section(`meshoptimizer ${meshVersion} decoder embedded in three.js`, ['Copyright (C) 2016-2026 Arseny Kapoulkine', 'Source: https://github.com/zeux/meshoptimizer', fullText('meshoptimizer/LICENSE.md', read(join(root, 'node_modules/meshoptimizer/LICENSE.md')))]);
for (const pkg of native.swift) section(`Swift: ${pkg.name} ${pkg.version}`, [`Source: ${pkg.source}`, ...pkg.notices.map((n) => fullText(`${pkg.name}/${n.path}`, n.text))]);
for (const pkg of native.android) section(`Android: ${pkg.name}`, [`Source/project: ${pkg.source ?? 'See artifact POM and license URL below'}`, ...pkg.licenses.map((l) => `License: ${l.name} — ${l.url}`), ...pkg.notices.map((n) => fullText(`${pkg.name}/${n.path}`, n.text))]);
for (const item of native.extras) section(item.name, [`Source: ${item.source}`, fullText(item.name, item.text)]);
section('Brotli decoder 0.1.2 source attribution', ['Copyright 2015 Google Inc. All Rights Reserved.', 'Distributed under MIT license.', 'Preserved from org/brotli/dec/Decode.java in the matching source artifact:', 'https://repo.maven.apache.org/maven2/org/brotli/dec/0.1.2/dec-0.1.2-sources.jar']);
const cordovaHeader = read(join(root, 'node_modules/@capacitor/ios/CapacitorCordova/CapacitorCordova/Classes/Public/CDV.h')).match(/^\/\*[\s\S]*?\*\//)?.[0];
if (!cordovaHeader) throw new Error('Missing bundled Cordova source notice');
section('Bundled Cordova source notice', [fullText('CapacitorCordova/Classes/Public/CDV.h', cordovaHeader)]);
section('Additional original asset source and retained license distinctions', ['grinsegold bodyparts06 original asset pack:', 'https://files2.makehumancommunity.org/asset_packs/bodyparts06/bodyparts06_cc-by.zip', 'The retained upstream evidence does not identify a CC BY-SA version for the Bystedt hair or resolve the differing CC-BY/AGPL notices for the beard. These notices preserve the distinctions; they do not assign a new license to either asset.', 'Any applicable derivative-groom share-alike/source delivery must accompany its distribution; an attribution notice alone does not supply that derivative source.']);
section('Cordova compatibility code bundled with Capacitor iOS', ['Apache License 2.0. Source headers retain the Apache Software Foundation notice.', 'Source: https://github.com/ionic-team/capacitor/tree/8.5.2/ios/CapacitorCordova', 'The complete Apache 2.0 text is included below with Android library license texts.']);
section('Capgo updater source availability', ['@capgo/capacitor-updater 8.51.20 is distributed under Mozilla Public License 2.0.', 'Unmodified covered source for this pinned release:', 'https://github.com/Cap-go/capacitor-updater/tree/189d2e28083af4b848b2dace85ed13e36c29e3b4', 'https://github.com/Cap-go/capacitor-updater/archive/189d2e28083af4b848b2dace85ed13e36c29e3b4.tar.gz', 'The full MPL 2.0 text is included above by reference and reproduced below.', 'If a distributor modifies covered files, it must make its corresponding modified source available under MPL 2.0 and replace this source pointer as appropriate.']);
section('Game assets and font attribution', [read(join(root, 'public/fonts/LICENSE.txt')), '', 'Human base topology and eyes: Dan Ulrich / Blender Studio, Human Base Meshes 1.4.1 (CC0).', 'https://www.blender.org/download/demo-files/#assets', 'MPFB / MakeHuman generated head, system skin and core assets: CC0; the tools have separate code licenses.', 'https://static.makehumancommunity.org/mpfb.html', 'Cotton Jersey and Denim Fabric 03: colormass (photography), Rico Cilliers (processing), Poly Haven (CC0).', 'https://polyhaven.com/a/cotton_jersey', 'https://polyhaven.com/a/denim_fabric_03', 'https://creativecommons.org/publicdomain/zero/1.0/', "Curly hair: adapted from Daniel Bystedt's Hair Styles Blender demo; CC BY-SA, version unspecified in the retained source evidence. Baked into the game's curl shell; attribution and share-alike apply to the derivative groom.", 'https://download.blender.org/demo/geometry-nodes/hair_nodes-female_hair_styles.blend', 'Beard and moustache: grinsegold, MakeHuman bodyparts06. The official pack identifies CC-BY; embedded MHCLO headers identify AGPL3. Both source notices are retained in the repository provenance; no license version is invented here.', 'https://static.makehumancommunity.org/assets/assetpacks/bodyparts06.html', read(join(root, 'docs/evidence/hero-art/delivery/provenance/LeePerrySmith_License.txt')), 'https://creativecommons.org/licenses/by/3.0/', 'Key art, track cards and medals were generated for the game. Biomes, bike and further authored derivatives retain their repository provenance.', 'Source provenance: docs/evidence/hero-art/delivery/provenance/ and docs/evidence/hero-r9-inputs/THIRD-PARTY.md.']);
const output = `TRIALS GAUNTLET — THIRD-PARTY SOFTWARE AND ASSET NOTICES\n\nGenerated by scripts/native-notices.mjs. This inventory covers shipped runtime components, including native transitive libraries; build/test tools are excluded. Component terms apply individually. Google Play libraries below retain their stated SDK terms.\n\n${sections.join('\n\n')}\n\nFULL LICENSE AND NOTICE TEXTS\n============================\n\n${[...texts].map(([id, { labels, text }]) => `${id} — ${labels.join('; ')}\n\n${text}`).join('\n\n' + '='.repeat(80) + '\n\n')}\n`;
if (process.argv.includes('--check')) {
  if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== output) throw new Error('public/native-notices.txt is stale; run node scripts/native-notices.mjs');
  console.log(`Native notices current: ${visited.size} npm packages, ${native.swift.length} Swift packages, ${native.android.length} Android artifacts.`);
} else {
  writeFileSync(outputPath, output);
  console.log(`Wrote public/native-notices.txt (${Buffer.byteLength(output)} bytes).`);
}
