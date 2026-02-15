import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

export interface WsSessionTokenConfig {
  issuer: string;
  audience: string;
  ttlSeconds: number;
  secrets: string[];
}

export interface WsMintedSessionToken {
  token: string;
  expiresAt: number;
}

export interface WsSessionClaims {
  nodeId: string;
  expiresAt: number;
}

function encodeBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeBase64UrlJson(encoded: string): unknown {
  const json = Buffer.from(encoded, 'base64url').toString('utf8');
  return JSON.parse(json) as unknown;
}

function signHs256(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

function verifyHs256(input: string, signature: string, secret: string): boolean {
  const expected = signHs256(input, secret);
  const providedBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  return providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function mintWsSessionToken(nodeId: string, config: WsSessionTokenConfig): WsMintedSessionToken {
  if (!nodeId || nodeId.trim().length === 0) {
    throw new Error('nodeId is required');
  }
  if (!config.secrets.length) {
    throw new Error('At least one session token secret is required');
  }
  if (config.ttlSeconds <= 0) {
    throw new Error('ttlSeconds must be > 0');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: config.issuer,
    aud: config.audience,
    sub: nodeId,
    iat: now,
    exp: now + config.ttlSeconds,
    jti: randomUUID(),
    // Explicitly mark this as a WoLy WebSocket session token for node connections.
    typ: 'woly-ws-session',
  };

  const encodedHeader = encodeBase64UrlJson(header);
  const encodedPayload = encodeBase64UrlJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signHs256(signingInput, config.secrets[0]);
  return { token: `${signingInput}.${signature}`, expiresAt: payload.exp };
}

export function createWsSessionToken(nodeId: string, config: WsSessionTokenConfig): string {
  return mintWsSessionToken(nodeId, config).token;
}

export function verifyWsSessionToken(token: string, config: WsSessionTokenConfig): WsSessionClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed session token');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const header = decodeBase64UrlJson(encodedHeader);
  const payload = decodeBase64UrlJson(encodedPayload);
  const headerRecord = asRecord(header);
  const payloadRecord = asRecord(payload);

  const alg = asString(headerRecord?.alg);
  if (alg !== 'HS256') {
    throw new Error('Unsupported session token algorithm');
  }

  const secrets = config.secrets;
  if (!secrets.some((secret) => verifyHs256(signingInput, encodedSignature, secret))) {
    throw new Error('Invalid session token signature');
  }

  const issuer = asString(payloadRecord?.iss);
  const audience = asString(payloadRecord?.aud);
  const subject = asString(payloadRecord?.sub);
  const issuedAt = asNumber(payloadRecord?.iat);
  const expiresAt = asNumber(payloadRecord?.exp);
  const tokenType = asString(payloadRecord?.typ);

  if (!issuer || issuer !== config.issuer) {
    throw new Error('Invalid session token issuer');
  }

  if (!audience || audience !== config.audience) {
    throw new Error('Invalid session token audience');
  }

  if (tokenType !== 'woly-ws-session') {
    throw new Error('Invalid session token type');
  }

  if (!subject) {
    throw new Error('Session token subject is required');
  }

  if (!issuedAt) {
    throw new Error('Session token issued-at is required');
  }

  if (!expiresAt) {
    throw new Error('Session token expiry is required');
  }

  const now = Math.floor(Date.now() / 1000);
  const clockSkewSec = 5;

  if (issuedAt > now + clockSkewSec) {
    throw new Error('Session token issued-at is in the future');
  }

  // Enforce bounded lifetime even if an issuer is misconfigured.
  const lifetime = expiresAt - issuedAt;
  if (lifetime <= 0) {
    throw new Error('Session token lifetime is invalid');
  }
  if (lifetime > config.ttlSeconds + clockSkewSec) {
    throw new Error('Session token lifetime exceeds maximum');
  }

  if (now >= expiresAt) {
    throw new Error('Session token expired');
  }

  return { nodeId: subject, expiresAt };
}
