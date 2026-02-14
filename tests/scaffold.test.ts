import { describe, it, expect } from 'vitest';

describe('ri-sandbox', () => {
  it('exports a module', async () => {
    const mod = await import('../src/index.js');
    expect(mod).toBeDefined();
  });
});
