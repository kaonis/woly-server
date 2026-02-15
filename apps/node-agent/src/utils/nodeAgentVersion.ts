import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from './logger';

let cachedVersion: string | null = null;

export function getNodeAgentVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    const packageJsonPath = join(__dirname, '../../package.json');
    const packageJsonRaw = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonRaw) as { version?: unknown };
    if (typeof packageJson.version === 'string' && packageJson.version.trim().length > 0) {
      cachedVersion = packageJson.version;
      return cachedVersion;
    }
  } catch (error) {
    logger.warn('Failed to resolve node-agent version from package.json', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  cachedVersion = '0.0.0';
  return cachedVersion;
}

export const NODE_AGENT_VERSION = getNodeAgentVersion();
