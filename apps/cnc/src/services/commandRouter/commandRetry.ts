export function calculateBackoffDelay(
  retryBaseDelayMs: number,
  commandTimeout: number,
  retryCount: number,
): number {
  const exponentialDelay = retryBaseDelayMs * Math.pow(2, retryCount);
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  const delayWithJitter = Math.max(0, exponentialDelay + jitter);

  return Math.min(delayWithJitter, commandTimeout / 2);
}
