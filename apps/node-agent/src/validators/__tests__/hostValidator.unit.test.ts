import {
  deleteHostSchema,
  hostNameParamSchema,
  macAddressSchema,
  updateHostSchema,
} from '../hostValidator';

describe('hostValidator schemas', () => {
  describe('macAddressSchema', () => {
    it('should validate correct MAC address with colons', () => {
      const result = macAddressSchema.safeParse({ mac: 'AA:BB:CC:DD:EE:FF' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mac).toBe('AA:BB:CC:DD:EE:FF');
      }
    });

    it('should validate correct MAC address with hyphens', () => {
      const result = macAddressSchema.safeParse({ mac: 'AA-BB-CC-DD-EE-FF' });
      expect(result.success).toBe(true);
    });

    it('should validate lowercase MAC address', () => {
      const result = macAddressSchema.safeParse({ mac: 'aa:bb:cc:dd:ee:ff' });
      expect(result.success).toBe(true);
    });

    it('should validate mixed case MAC address', () => {
      const result = macAddressSchema.safeParse({ mac: 'Aa:Bb:Cc:Dd:Ee:Ff' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid MAC address format', () => {
      const result = macAddressSchema.safeParse({ mac: 'INVALID' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('MAC address must be in format');
      }
    });

    it('should reject MAC address with wrong separator', () => {
      const result = macAddressSchema.safeParse({ mac: 'AA.BB.CC.DD.EE.FF' });
      expect(result.success).toBe(false);
    });

    it('should reject MAC address with too few octets', () => {
      const result = macAddressSchema.safeParse({ mac: 'AA:BB:CC:DD:EE' });
      expect(result.success).toBe(false);
    });

    it('should reject MAC address with too many octets', () => {
      const result = macAddressSchema.safeParse({ mac: 'AA:BB:CC:DD:EE:FF:00' });
      expect(result.success).toBe(false);
    });

    it('should reject missing MAC address', () => {
      const result = macAddressSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Required');
      }
    });
  });

  describe('updateHostSchema', () => {
    it('should validate complete host data', () => {
      const result = updateHostSchema.safeParse({
        name: 'TestHost',
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.success).toBe(true);
    });

    it('should validate IPv6 address', () => {
      const result = updateHostSchema.safeParse({
        name: 'TestHost',
        ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.success).toBe(true);
    });

    it('should trim hostname whitespace', () => {
      const result = updateHostSchema.safeParse({
        name: '  TestHost  ',
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('TestHost');
      }
    });

    it('should reject empty hostname', () => {
      const result = updateHostSchema.safeParse({
        name: '',
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('at least 1 character');
      }
    });

    it('should reject hostname longer than 255 characters', () => {
      const result = updateHostSchema.safeParse({
        name: 'a'.repeat(256),
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('not exceed 255 characters');
      }
    });

    it('should reject invalid IP address', () => {
      const result = updateHostSchema.safeParse({
        name: 'TestHost',
        ip: '999.999.999.999',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('valid IPv4 or IPv6 address');
      }
    });

    it('should reject missing name', () => {
      const result = updateHostSchema.safeParse({
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Required');
      }
    });

    it('should reject missing IP', () => {
      const result = updateHostSchema.safeParse({
        name: 'TestHost',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Required');
      }
    });

    it('should reject missing MAC', () => {
      const result = updateHostSchema.safeParse({
        name: 'TestHost',
        ip: '192.168.1.100',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Required');
      }
    });
  });

  describe('hostNameParamSchema', () => {
    it('should validate host name parameter', () => {
      const result = hostNameParamSchema.safeParse({ name: 'PHANTOM-MBP' });
      expect(result.success).toBe(true);
    });

    it('should trim host name parameter', () => {
      const result = hostNameParamSchema.safeParse({ name: '  PHANTOM-MBP  ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('PHANTOM-MBP');
      }
    });

    it('should reject missing host name', () => {
      const result = hostNameParamSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Required');
      }
    });
  });

  describe('deleteHostSchema', () => {
    it('should validate MAC address', () => {
      const result = deleteHostSchema.safeParse({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      expect(result.success).toBe(true);
    });

    it('should accept MAC address with hyphens', () => {
      const result = deleteHostSchema.safeParse({ macAddress: 'AA-BB-CC-DD-EE-FF' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid MAC address', () => {
      const result = deleteHostSchema.safeParse({ macAddress: 'INVALID' });
      expect(result.success).toBe(false);
    });

    it('should reject missing MAC address', () => {
      const result = deleteHostSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Required');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle extra fields with updateHostSchema', () => {
      const result = updateHostSchema.safeParse({
        name: 'TestHost',
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
        extraField: 'should be stripped',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('extraField');
      }
    });

    it('should validate MAC address with all zeros', () => {
      const result = macAddressSchema.safeParse({ mac: '00:00:00:00:00:00' });
      expect(result.success).toBe(true);
    });

    it('should validate MAC address with all Fs', () => {
      const result = macAddressSchema.safeParse({ mac: 'FF:FF:FF:FF:FF:FF' });
      expect(result.success).toBe(true);
    });

    it('should validate localhost IP', () => {
      const result = updateHostSchema.safeParse({
        name: 'Localhost',
        ip: '127.0.0.1',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.success).toBe(true);
    });

    it('should validate broadcast IP', () => {
      const result = updateHostSchema.safeParse({
        name: 'Broadcast',
        ip: '255.255.255.255',
        mac: 'FF:FF:FF:FF:FF:FF',
      });
      expect(result.success).toBe(true);
    });
  });
});
