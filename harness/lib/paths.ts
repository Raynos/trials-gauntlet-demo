import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url)).replace(/\/lib$/, '');
export const REPO_ROOT = path.resolve(HARNESS_DIR, '..');
export const OUT_DIR = path.join(HARNESS_DIR, 'out');
export const DIST_DIR = path.join(REPO_ROOT, 'dist');
