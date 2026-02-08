export interface AuthContext {
  sub: string;
  roles: string[];
  claims: Record<string, unknown>;
}

export interface JwtPayload {
  sub?: unknown;
  role?: unknown;
  roles?: unknown;
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iat?: unknown;
  [key: string]: unknown;
}
