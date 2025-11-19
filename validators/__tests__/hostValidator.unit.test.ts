import {
  macAddressSchema,
  updateHostSchema,
  wakeHostSchema,
  deleteHostSchema,
} from '../hostValidator';

describe('hostValidator schemas', () => {
  describe('macAddressSchema', () => {
    it('should validate correct MAC address with colons', () => {
      const result = macAddressSchema.validate({ mac: 'AA:BB:CC:DD:EE:FF' });
      expect(result.error).toBeUndefined();
      expect(result.value.mac).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('should validate correct MAC address with hyphens', () => {
      const result = macAddressSchema.validate({ mac: 'AA-BB-CC-DD-EE-FF' });
      expect(result.error).toBeUndefined();
    });

    it('should validate lowercase MAC address', () => {
      const result = macAddressSchema.validate({ mac: 'aa:bb:cc:dd:ee:ff' });
      expect(result.error).toBeUndefined();
    });

    it('should validate mixed case MAC address', () => {
      const result = macAddressSchema.validate({ mac: 'Aa:Bb:Cc:Dd:Ee:Ff' });
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid MAC address format', () => {
      const result = macAddressSchema.validate({ mac: 'INVALID' });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('MAC address must be in format');
    });

    it('should reject MAC address with wrong separator', () => {
      const result = macAddressSchema.validate({ mac: 'AA.BB.CC.DD.EE.FF' });
      expect(result.error).toBeDefined();
    });

    it('should reject MAC address with too few octets', () => {
      const result = macAddressSchema.validate({ mac: 'AA:BB:CC:DD:EE' });
      expect(result.error).toBeDefined();
    });

    it('should reject MAC address with too many octets', () => {
      const result = macAddressSchema.validate({ mac: 'AA:BB:CC:DD:EE:FF:00' });
      expect(result.error).toBeDefined();
    });

    it('should reject missing MAC address', () => {
      const result = macAddressSchema.validate({});
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('required');
    });
  });

  describe('updateHostSchema', () => {
    it('should validate complete host data', () => {
      const result = updateHostSchema.validate({
        name: 'TestHost',
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.error).toBeUndefined();
    });

    it('should validate IPv6 address', () => {
      const result = updateHostSchema.validate({
        name: 'TestHost',
        ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.error).toBeUndefined();
    });

    it('should trim hostname whitespace', () => {
      const result = updateHostSchema.validate({
        name: '  TestHost  ',
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.error).toBeUndefined();
      expect(result.value.name).toBe('TestHost');
    });

    it('should reject empty hostname', () => {
      const result = updateHostSchema.validate({
        name: '',
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('not allowed to be empty');
    });

    it('should reject hostname longer than 255 characters', () => {
      const result = updateHostSchema.validate({
        name: 'a'.repeat(256),
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('not exceed 255 characters');
    });

    it('should reject invalid IP address', () => {
      const result = updateHostSchema.validate({
        name: 'TestHost',
        ip: '999.999.999.999',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('valid ip address');
    });

    it('should reject missing name', () => {
      const result = updateHostSchema.validate({
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Hostname is required');
    });

    it('should reject missing IP', () => {
      const result = updateHostSchema.validate({
        name: 'TestHost',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('IP address is required');
    });

    it('should reject missing MAC', () => {
      const result = updateHostSchema.validate({
        name: 'TestHost',
        ip: '192.168.1.100',
      });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('MAC address is required');
    });
  });

  describe('wakeHostSchema', () => {
    it('should validate MAC address only', () => {
      const result = wakeHostSchema.validate({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      expect(result.error).toBeUndefined();
    });

    it('should validate MAC address with optional IPv4', () => {
      const result = wakeHostSchema.validate({
        macAddress: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.100',
      });
      expect(result.error).toBeUndefined();
    });

    it('should reject IPv6 address', () => {
      const result = wakeHostSchema.validate({
        macAddress: 'AA:BB:CC:DD:EE:FF',
        ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('valid ip address');
    });

    it('should accept missing IP', () => {
      const result = wakeHostSchema.validate({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      expect(result.error).toBeUndefined();
      expect(result.value.ip).toBeUndefined();
    });

    it('should reject missing MAC address', () => {
      const result = wakeHostSchema.validate({ ip: '192.168.1.100' });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('required');
    });
  });

  describe('deleteHostSchema', () => {
    it('should validate MAC address', () => {
      const result = deleteHostSchema.validate({ macAddress: 'AA:BB:CC:DD:EE:FF' });
      expect(result.error).toBeUndefined();
    });

    it('should accept MAC address with hyphens', () => {
      const result = deleteHostSchema.validate({ macAddress: 'AA-BB-CC-DD-EE-FF' });
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid MAC address', () => {
      const result = deleteHostSchema.validate({ macAddress: 'INVALID' });
      expect(result.error).toBeDefined();
    });

    it('should reject missing MAC address', () => {
      const result = deleteHostSchema.validate({});
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('required');
    });
  });

  describe('edge cases', () => {
    it('should handle extra fields with updateHostSchema', () => {
      const result = updateHostSchema.validate(
        {
          name: 'TestHost',
          ip: '192.168.1.100',
          mac: 'AA:BB:CC:DD:EE:FF',
          extraField: 'should be stripped',
        },
        { stripUnknown: true }
      );
      expect(result.error).toBeUndefined();
      expect(result.value).not.toHaveProperty('extraField');
    });

    it('should validate MAC address with all zeros', () => {
      const result = macAddressSchema.validate({ mac: '00:00:00:00:00:00' });
      expect(result.error).toBeUndefined();
    });

    it('should validate MAC address with all Fs', () => {
      const result = macAddressSchema.validate({ mac: 'FF:FF:FF:FF:FF:FF' });
      expect(result.error).toBeUndefined();
    });

    it('should validate localhost IP', () => {
      const result = updateHostSchema.validate({
        name: 'Localhost',
        ip: '127.0.0.1',
        mac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.error).toBeUndefined();
    });

    it('should validate broadcast IP', () => {
      const result = updateHostSchema.validate({
        name: 'Broadcast',
        ip: '255.255.255.255',
        mac: 'FF:FF:FF:FF:FF:FF',
      });
      expect(result.error).toBeUndefined();
    });
  });
});
