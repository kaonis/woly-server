export type CorsDecision = 'no-origin' | 'config' | 'ngrok' | 'netlify' | 'helios' | 'rejected';

const NGROK_ORIGIN_REGEX = /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/i;
const NETLIFY_ORIGIN_REGEX = /^https:\/\/[a-z0-9-]+\.netlify\.app$/i;
const HELIOS_ORIGIN_REGEX = /^https?:\/\/(.*\.)?helios\.kaonis\.com$/i;

export function evaluateCorsOrigin(origin: string | undefined, configuredOrigins: string[]): CorsDecision {
  if (!origin) return 'no-origin';
  if (configuredOrigins.includes(origin)) return 'config';
  if (NGROK_ORIGIN_REGEX.test(origin)) return 'ngrok';
  if (NETLIFY_ORIGIN_REGEX.test(origin)) return 'netlify';
  if (HELIOS_ORIGIN_REGEX.test(origin)) return 'helios';
  return 'rejected';
}

