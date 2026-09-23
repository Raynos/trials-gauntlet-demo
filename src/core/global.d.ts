import type { RockhopHook } from './types';

declare global {
  interface Window {
    __rockhop?: RockhopHook;
  }
}

export {};
