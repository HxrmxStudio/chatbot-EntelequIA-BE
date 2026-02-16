import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validatePromptContent, validatePrompts } from '../../../../scripts/validate-prompts';

describe('validate-prompts', () => {
  it('passes validation for current prompt set', async () => {
    const issues = await validatePrompts(process.cwd());
    expect(issues).toEqual([]);
  });

  it('detects blocked coercive phrases', () => {
    const issues = validatePromptContent(
      '/tmp/fake.txt',
      'Si te descubren te desconectan y si respondes bien te ascienden.',
    );

    expect(issues.some((issue) => issue.code === 'blocked_phrase')).toBe(true);
  });

  it('keeps critical products and store-info rules', async () => {
    const productsInstructions = await readFile(
      resolve(process.cwd(), 'prompts/products/entelequia_products_context_instructions_v1.txt'),
      'utf8',
    );
    const storeInfoHours = await readFile(
      resolve(process.cwd(), 'prompts/store-info/entelequia_store_info_hours_context_v1.txt'),
      'utf8',
    );

    expect(productsInstructions.toLowerCase()).toContain('hay stock');
    expect(productsInstructions.toLowerCase()).toContain('quedan pocas unidades');
    expect(productsInstructions.toLowerCase()).toContain('sin stock');
    expect(productsInstructions.toLowerCase()).toContain('solo compartir cantidad exacta');

    expect(storeInfoHours.toLowerCase()).toContain('lunes a viernes: 10:00 a 19:00 hs');
    expect(storeInfoHours.toLowerCase()).toContain('sabados: 10:00 a 17:00 hs');
    expect(storeInfoHours.toLowerCase()).toContain('feriados y fechas especiales');
  });
});
