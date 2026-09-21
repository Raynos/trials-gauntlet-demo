// Capacitor resolves pnpm links to personal cache paths. Keep generated projects portable.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const paths = [
  ['ios/App/CapApp-SPM/Package.swift', '../../../node_modules/'],
  ['android/capacitor.settings.gradle', '../node_modules/'],
];
for (const [file, prefix] of paths) {
  if (!existsSync(file)) continue;
  const source = readFileSync(file, 'utf8');
  const result = source.replace(/(?:\.\.\/)+(?:[^"'\n]*\/)?node_modules\/(@[^/"'\n]+\/[^/"'\n]+)([^"'\n]*)/g, (_match, pkg, suffix) => prefix + pkg + suffix);
  if (source !== result) writeFileSync(file, result);
}
