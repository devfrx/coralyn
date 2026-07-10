import { generatePin } from './pin';

describe('generatePin', () => {
  it('genera 6 cifre numeriche', () => {
    for (let i = 0; i < 50; i++) {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{6}$/);
    }
  });
});
