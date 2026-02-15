import { readFileSync } from 'fs';
import { join } from 'path';
import logger from './logger';

const FALLBACK_VERSION = '0.0.0';
let cachedVersion: string | null = null;

type ReadPackageJson = (path: string) => string;

export function resolveCncVersion(
  readPackageJson: ReadPackageJson = (path: string) => readFileSync(path, 'utf8'),
  packageJsonPath: string = join(__dirname, '../../package.json'),
): string {
  try {
    const packageJsonRaw = readPackageJson(packageJsonPath);
    const packageJson = JSON.parse(packageJsonRaw) as { version?: unknown };

    if (typeof packageJson.version === 'string' && packageJson.version.trim().length > 0) {
      return packageJson.version;
    }

    logger.warn('C&C package.json did not contain a valid version field', { packageJsonPath });
  } catch (error) {
    logger.warn('Failed to resolve C&C version from package.json', {
      packageJsonPath,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return FALLBACK_VERSION;
}

export function getCncVersion(): string {
  if (!cachedVersion) {
    cachedVersion = resolveCncVersion();
  }

  return cachedVersion;
}

export function resetCncVersionCacheForTests(): void {
  cachedVersion = null;
}

export const CNC_VERSION = getCncVersion();

