import { getNodeAgentVersion, NODE_AGENT_VERSION } from '../nodeAgentVersion';

describe('nodeAgentVersion', () => {
  it('returns a non-empty node-agent version string', () => {
    const version = getNodeAgentVersion();

    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
    expect(NODE_AGENT_VERSION).toBe(version);
  });
});
