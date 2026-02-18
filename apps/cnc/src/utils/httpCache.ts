import { createHash } from 'crypto';

function normalizeEtag(value: string): string {
  const trimmed = value.trim();
  if (trimmed.toUpperCase().startsWith('W/')) {
    return trimmed.slice(2).trim();
  }
  return trimmed;
}

export function createJsonEtag(payload: unknown): string {
  const json = JSON.stringify(payload);
  const digest = createHash('sha256').update(json).digest('base64url');
  return `"${digest}"`;
}

export function isIfNoneMatchSatisfied(ifNoneMatchHeader: string | undefined, etag: string): boolean {
  if (!ifNoneMatchHeader) {
    return false;
  }

  const candidates = ifNoneMatchHeader
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (!candidates.length) {
    return false;
  }

  if (candidates.includes('*')) {
    return true;
  }

  const normalizedEtag = normalizeEtag(etag);
  return candidates.some((candidate) => normalizeEtag(candidate) === normalizedEtag);
}
