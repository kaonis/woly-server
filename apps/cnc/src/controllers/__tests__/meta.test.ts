import {
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  cncCapabilitiesResponseSchema,
} from '@kaonis/woly-protocol';
import { buildCncCapabilitiesResponse } from '../meta';

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
  },
}));

import logger from '../../utils/logger';

const FALLBACK_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS.find(
  (version) => typeof version === 'string' && version.trim().length > 0,
) ?? '1.0.0';

const mockedLogger = logger as jest.Mocked<typeof logger>;

describe('buildCncCapabilitiesResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns schema-valid capabilities with explicit version values', () => {
    const payload = buildCncCapabilitiesResponse();

    expect(payload.versions.cncApi).toEqual(expect.any(String));
    expect(payload.versions.cncApi.trim().length).toBeGreaterThan(0);
    expect(payload.versions.protocol).toBe(PROTOCOL_VERSION);
    expect(cncCapabilitiesResponseSchema.safeParse(payload).success).toBe(true);
  });

  it('falls back CNC API version when a blank value is provided', () => {
    const payload = buildCncCapabilitiesResponse({ cncApi: '   ' });

    expect(payload.versions.cncApi).toBe('0.0.0');
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Capabilities version missing or invalid; using fallback',
      expect.objectContaining({
        field: 'cncApi',
        fallback: '0.0.0',
      }),
    );
  });

  it('falls back protocol version when a non-string value is provided', () => {
    const payload = buildCncCapabilitiesResponse({ protocol: 42 });

    expect(payload.versions.protocol).toBe(FALLBACK_PROTOCOL_VERSION);
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Capabilities version missing or invalid; using fallback',
      expect.objectContaining({
        field: 'protocol',
        fallback: FALLBACK_PROTOCOL_VERSION,
      }),
    );
  });
});
