export interface NativeBuildContract {
  schema: 1;
  target: 'native';
  runtime: string;
  saveSchema: number;
  sourceRevision: string;
  production: boolean;
  channels: { ios: string; android: string } | null;
  publicKeyFingerprint: string | null;
}
export function nativeBuildContract(env: Record<string, string | undefined>, options?: { production?: boolean; sourceRevision?: string }): NativeBuildContract;
export function publicKeyFingerprint(jwk: Record<string, unknown>): string;
