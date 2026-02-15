import {
  addHostSchema,
  deleteHostSchema,
  hostNameParamSchema,
  macAddressSchema,
  updateHostSchema,
} from '../hostValidator';

describe('hostValidator schemas', () => {
  describe('macAddressSchema', () => {
    it('accepts valid MAC formats', () => {
      expect(macAddressSchema.safeParse({ mac: 'AA:BB:CC:DD:EE:FF' }).success).toBe(true);
      expect(macAddressSchema.safeParse({ mac: 'AA-BB-CC-DD-EE-FF' }).success).toBe(true);
    });

    it('rejects invalid MAC', () => {
      expect(macAddressSchema.safeParse({ mac: 'INVALID' }).success).toBe(false);
    });
  });

  describe('addHostSchema', () => {
    it('validates complete host payload', () => {
      const result = addHostSchema.safeParse({
        name: 'TestHost',
        ip: '192.168.1.100',
        mac: 'AA:BB:CC:DD:EE:FF',
        notes: 'Primary workstation',
        tags: ['office', 'critical'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing required fields', () => {
      expect(addHostSchema.safeParse({ name: 'TestHost' }).success).toBe(false);
      expect(addHostSchema.safeParse({ ip: '192.168.1.100' }).success).toBe(false);
      expect(addHostSchema.safeParse({ mac: 'AA:BB:CC:DD:EE:FF' }).success).toBe(false);
    });
  });

  describe('updateHostSchema', () => {
    it('accepts partial updates', () => {
      expect(updateHostSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
      expect(updateHostSchema.safeParse({ ip: '192.168.1.222' }).success).toBe(true);
      expect(updateHostSchema.safeParse({ mac: 'AA:BB:CC:DD:EE:11' }).success).toBe(true);
      expect(updateHostSchema.safeParse({ notes: null }).success).toBe(true);
      expect(updateHostSchema.safeParse({ tags: ['tag-1'] }).success).toBe(true);
    });

    it('accepts combined updates', () => {
      const result = updateHostSchema.safeParse({
        name: 'Renamed',
        ip: '192.168.1.222',
        mac: 'AA:BB:CC:DD:EE:11',
        notes: 'Renamed host note',
        tags: ['desktop'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Renamed');
        expect(result.data.notes).toBe('Renamed host note');
      }
    });

    it('rejects empty update payload', () => {
      const result = updateHostSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('At least one field is required');
      }
    });

    it('rejects invalid field values', () => {
      expect(updateHostSchema.safeParse({ ip: '999.999.999.999' }).success).toBe(false);
      expect(updateHostSchema.safeParse({ mac: 'INVALID' }).success).toBe(false);
      expect(updateHostSchema.safeParse({ name: '' }).success).toBe(false);
      expect(updateHostSchema.safeParse({ notes: 'x'.repeat(2001) }).success).toBe(false);
      expect(updateHostSchema.safeParse({ tags: [''] }).success).toBe(false);
    });
  });

  describe('hostNameParamSchema', () => {
    it('validates and trims host name', () => {
      const result = hostNameParamSchema.safeParse({ name: '  PHANTOM-MBP  ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('PHANTOM-MBP');
      }
    });
  });

  describe('deleteHostSchema', () => {
    it('validates delete params by host name', () => {
      expect(deleteHostSchema.safeParse({ name: 'PHANTOM-MBP' }).success).toBe(true);
    });

    it('rejects missing name', () => {
      expect(deleteHostSchema.safeParse({}).success).toBe(false);
    });
  });
});
