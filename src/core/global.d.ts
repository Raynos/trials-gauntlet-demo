import type { TrialsHook } from './types';

declare global {
  interface Window {
    __trials?: TrialsHook;
  }
}

export {};
