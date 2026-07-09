import { toAbsenceReleaseDTO } from './absence-release.projection';

const base = {
  id: 'r-1',
  bookingId: 'b-1',
  establishmentId: 'e-1',
  date: new Date('2026-07-20T00:00:00.000Z'),
  source: 'operator' as const,
  canceledAt: null,
  reason: 'influenza',
  createdAt: new Date('2026-07-10T09:30:00.000Z'),
};

describe('toAbsenceReleaseDTO', () => {
  it('mappa i campi: id/date/source/resold/reason/createdAt', () => {
    const dto = toAbsenceReleaseDTO({ ...base } as never, false);
    expect(dto).toMatchObject({
      id: 'r-1',
      date: '2026-07-20',
      source: 'operator',
      canceledAt: null,
      resold: false,
      reason: 'influenza',
    });
    expect(dto.createdAt).toBe('2026-07-10T09:30:00.000Z');
  });

  it('canceledAt valorizzato → ISO string (non null)', () => {
    const dto = toAbsenceReleaseDTO(
      { ...base, canceledAt: new Date('2026-07-21T12:00:00.000Z') } as never,
      false,
    );
    expect(dto.canceledAt).toBe('2026-07-21T12:00:00.000Z');
  });

  it('resold true quando il chiamante lo determina rivenduto', () => {
    const dto = toAbsenceReleaseDTO({ ...base } as never, true);
    expect(dto.resold).toBe(true);
  });

  it('reason null in DB → undefined nel DTO', () => {
    const dto = toAbsenceReleaseDTO({ ...base, reason: null } as never, false);
    expect(dto.reason).toBeUndefined();
  });
});
