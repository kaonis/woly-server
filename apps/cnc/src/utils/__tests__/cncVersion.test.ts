import { getCncVersion, resolveCncVersion, resetCncVersionCacheForTests } from '../cncVersion';

describe('cncVersion utilities', () => {
  afterEach(() => {
    resetCncVersionCacheForTests();
  });

  describe('resolveCncVersion', () => {
    it('returns package version when valid', () => {
      const version = resolveCncVersion(() => JSON.stringify({ version: '1.2.3' }), '/tmp/package.json');

      expect(version).toBe('1.2.3');
    });

    it('returns fallback version when version field is missing', () => {
      const version = resolveCncVersion(() => JSON.stringify({ name: 'cnc' }), '/tmp/package.json');

      expect(version).toBe('0.0.0');
    });

    it('returns fallback version when package json is malformed', () => {
      const version = resolveCncVersion(() => '{invalid-json', '/tmp/package.json');

      expect(version).toBe('0.0.0');
    });

    it('returns fallback version when package json cannot be read', () => {
      const version = resolveCncVersion(() => {
        throw new Error('read failed');
      }, '/tmp/package.json');

      expect(version).toBe('0.0.0');
    });
  });

  describe('getCncVersion', () => {
    it('returns a stable cached value', () => {
      const first = getCncVersion();
      const second = getCncVersion();

      expect(second).toBe(first);
    });
  });
});

