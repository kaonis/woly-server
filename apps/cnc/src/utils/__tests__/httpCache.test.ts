import { createJsonEtag, isIfNoneMatchSatisfied } from '../httpCache';

describe('httpCache', () => {
  it('creates deterministic etags for equivalent payloads', () => {
    const a = createJsonEtag({ hosts: [{ name: 'office' }], stats: { total: 1 } });
    const b = createJsonEtag({ hosts: [{ name: 'office' }], stats: { total: 1 } });

    expect(a).toBe(b);
    expect(a.startsWith('"')).toBe(true);
    expect(a.endsWith('"')).toBe(true);
  });

  it('matches If-None-Match candidates including weak etags', () => {
    const etag = createJsonEtag({ schedules: [{ id: 'schedule-1' }] });

    expect(isIfNoneMatchSatisfied(etag, etag)).toBe(true);
    expect(isIfNoneMatchSatisfied(`W/${etag}`, etag)).toBe(true);
    expect(isIfNoneMatchSatisfied(`"other", W/${etag}`, etag)).toBe(true);
    expect(isIfNoneMatchSatisfied('"other"', etag)).toBe(false);
  });

  it('supports wildcard If-None-Match and ignores missing values', () => {
    const etag = createJsonEtag({ value: 1 });

    expect(isIfNoneMatchSatisfied('*', etag)).toBe(true);
    expect(isIfNoneMatchSatisfied(undefined, etag)).toBe(false);
    expect(isIfNoneMatchSatisfied('', etag)).toBe(false);
  });
});
