export interface PixelForgeUsage { limit: number; remaining: number; resetsAt: string }
export type PutResult =
  | { ok: true; rev: number; updatedAt: number }
  | { ok: false; reason: 'exists' | 'conflict' | 'not_found' | 'too_large' | 'item_limit' | 'storage_limit' | 'rate_limit' | 'invalid'; currentRev?: number; retryAfterMs?: number }
export interface CharacterSummary { id: string; name: string; updatedAt: number; bytes: number }
export interface StorageUsage { items: number; bytes: number; maxItems: number; maxBytes: number; maxItemBytes: number }

/** Internal AccessService RPC (service binding). Every method takes the VERIFIED OIDC sub. */
export interface AccessRpc {
  reservePixelForge(userId: string, turnId: string, kind: 'sprite' | 'animation'): Promise<{
    allowed: boolean; reason?: string; remaining: number; resetsAt: string; reservationId?: string
  }>
  finishPixelForge(userId: string, turnId: string, reservationId: string, succeeded: boolean): Promise<void>
  getPixelForgeUsage(userId: string): Promise<PixelForgeUsage>
  listPixelForgeCharacters(userId: string): Promise<CharacterSummary[]>
  getPixelForgeCharacter(userId: string, id: string): Promise<{ id: string; name: string; doc: string; rev: number; updatedAt: number } | null>
  putPixelForgeCharacter(userId: string, id: string, name: string, doc: string, baseRev: number | null): Promise<PutResult>
  deletePixelForgeCharacter(userId: string, id: string): Promise<boolean>
  duplicatePixelForgeCharacter(userId: string, id: string, newId: string, newName: string): Promise<PutResult>
  getPixelForgeStorageUsage(userId: string): Promise<StorageUsage>
}
export interface Env {
  ASSETS: Fetcher
  ACCESS: AccessRpc
  GEMINI_API_KEY: string
  SESSION_SECRET: string
  OIDC_CLIENT_SECRET: string
  OIDC_ISSUER: string
  OIDC_CLIENT_ID: string
  MODEL_NAME: string
}
