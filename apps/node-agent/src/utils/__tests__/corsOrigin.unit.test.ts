import { evaluateCorsOrigin } from '../corsOrigin';

describe('evaluateCorsOrigin', () => {
  it('allows requests with no origin', () => {
    expect(evaluateCorsOrigin(undefined, [])).toBe('no-origin');
  });

  it('allows origins explicitly configured', () => {
    expect(evaluateCorsOrigin('https://app.example.com', ['https://app.example.com'])).toBe(
      'config'
    );
  });

  it('allows ngrok-free origins', () => {
    expect(evaluateCorsOrigin('https://demo-123.ngrok-free.app', [])).toBe('ngrok');
  });

  it('allows netlify origins', () => {
    expect(evaluateCorsOrigin('https://preview-site.netlify.app', [])).toBe('netlify');
  });

  it('allows helios.kaonis.com origins over http and https', () => {
    expect(evaluateCorsOrigin('https://helios.kaonis.com', [])).toBe('helios');
    expect(evaluateCorsOrigin('http://api.helios.kaonis.com', [])).toBe('helios');
  });

  it('rejects unknown origins', () => {
    expect(evaluateCorsOrigin('https://attacker.example.com', ['https://app.example.com'])).toBe(
      'rejected'
    );
  });
});

