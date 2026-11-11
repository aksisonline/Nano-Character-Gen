// Deny-by-default authorization. Identity (sub) only ever comes from the verified session cookie.
// Roles are assigned here in code, never from a client-supplied value or an upstream claim.
export type Role = 'user'
export type Action = 'account:read' | 'account:update' | 'account:unlink' | 'character:list' | 'character:read' | 'character:create' | 'character:update' | 'character:delete' | 'character:duplicate'

// `own` = the resource is looked up inside the caller's own per-sub store; there is no way to name another user's.
// A future `admin` is intentionally absent: it must be a separate, audited, read-only-by-default path, not a flag here.
const PERMISSIONS: Record<Role, Partial<Record<Action, 'own'>>> = {
  user: {
    'account:read': 'own', 'account:update': 'own', 'account:unlink': 'own',
    'character:list': 'own', 'character:read': 'own', 'character:create': 'own',
    'character:update': 'own', 'character:delete': 'own', 'character:duplicate': 'own',
  },
}

export interface Principal { sub: string; role: Role }

export function roleFor(session: { sub?: unknown } | null): Principal | null {
  if (!session || typeof session.sub !== 'string' || session.sub.length < 1 || session.sub.length > 128) return null
  return { sub: session.sub, role: 'user' }
}

export function can(principal: Principal | null, action: Action): principal is Principal {
  return !!principal && PERMISSIONS[principal.role]?.[action] === 'own'
}
