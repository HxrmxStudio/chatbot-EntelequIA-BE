import {
  buildSeedFingerprint,
  buildSeedCanonicalIssues,
  buildSeedPromptHint,
  parseLearningSeedCasesJsonl,
} from '../../../scripts/_helpers/learning-seeds';

describe('learning seed parser', () => {
  it('parses valid jsonl rows', () => {
    const raw = [
      '{"id":"orders-qa-seed-1","intent":"orders","category":"orders_accuracy","severity":"P0","user_prompt":"pedido 123, dni 12345678","expected_behavior":"Responder estado del pedido.","failure_mode":"validation_failed","non_technical_language_required":true,"source":"qa_seed"}',
      '{"id":"shipping-qa-seed-1","intent":"payment_shipping","category":"shipping_policy","severity":"P1","user_prompt":"hacen envios al exterior?","expected_behavior":"Confirmar envios internacionales.","failure_mode":"shipping_international_false_negative","non_technical_language_required":true,"source":"qa_seed"}',
    ].join('\n');

    const result = parseLearningSeedCasesJsonl(raw);
    expect(result.issues).toHaveLength(0);
    expect(result.seeds).toHaveLength(2);
    expect(result.seeds[0]).toMatchObject({
      id: 'orders-qa-seed-1',
      intent: 'orders',
      category: 'orders_accuracy',
      source: 'qa_seed',
    });
    expect(result.seeds[0]?.seedFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns issues for invalid rows without crashing', () => {
    const raw = [
      '{"id":"bad","intent":"orders","category":"orders_accuracy","severity":"P0"}',
      '{"id":"bad","intent":"orders","category":"orders_accuracy","severity":"P0","user_prompt":"pedido","expected_behavior":"ok","failure_mode":"x","non_technical_language_required":true,"source":"qa_seed"}',
      'not-json',
    ].join('\n');

    const result = parseLearningSeedCasesJsonl(raw);
    expect(result.seeds).toHaveLength(0);
    expect(result.issues).toHaveLength(3);
    expect(result.issues.map((issue) => issue.reason)).toEqual(
      expect.arrayContaining(['invalid_user_prompt', 'invalid_json']),
    );
  });

  it('deduplicates repeated ids', () => {
    const row =
      '{"id":"dup-seed-1","intent":"products","category":"price_consistency","severity":"P1","user_prompt":"cual es el mas barato?","expected_behavior":"Responder el precio minimo correcto.","failure_mode":"wrong_min_price","non_technical_language_required":true,"source":"qa_seed"}';
    const raw = `${row}\n${row}`;

    const result = parseLearningSeedCasesJsonl(raw);
    expect(result.seeds).toHaveLength(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.reason).toBe('duplicate_id:dup-seed-1');
  });

  it('rejects severities outside P0/P1/P2', () => {
    const result = parseLearningSeedCasesJsonl(
      '{"id":"bad-severity-1","intent":"orders","category":"orders_accuracy","severity":"P3","user_prompt":"pedido 12345","expected_behavior":"Responder estado correctamente.","failure_mode":"wrong_severity","non_technical_language_required":true,"source":"qa_seed"}',
    );

    expect(result.seeds).toHaveLength(0);
    expect(result.issues).toEqual([{ line: 1, reason: 'invalid_severity' }]);
  });

  it('builds deterministic seed fingerprints', () => {
    const seedFingerprintA = buildSeedFingerprint({
      intent: 'orders',
      userPrompt: 'Pedido 12345, DNI 12345678',
      expectedBehavior: 'Responder estado del pedido.',
    });
    const seedFingerprintB = buildSeedFingerprint({
      intent: 'orders',
      userPrompt: 'pedido 12345,  dni 12345678',
      expectedBehavior: 'Responder estado del pedido.',
    });
    const seedFingerprintC = buildSeedFingerprint({
      intent: 'orders',
      userPrompt: 'pedido 99999, dni 12345678',
      expectedBehavior: 'Responder estado del pedido.',
    });

    expect(seedFingerprintA).toBe(seedFingerprintB);
    expect(seedFingerprintA).not.toBe(seedFingerprintC);
  });

  it('builds prompt hints and canonical issues', () => {
    const parsed = parseLearningSeedCasesJsonl(
      '{"id":"hint-seed-1","intent":"recommendations","category":"recommendations_recovery","severity":"P1","user_prompt":"algo de naruto?","expected_behavior":"Responder con sugerencias concretas.","failure_mode":"generic_processing_error","non_technical_language_required":true,"source":"qa_seed"}',
    );
    const seed = parsed.seeds[0];

    const hint = buildSeedPromptHint(seed);
    const issues = buildSeedCanonicalIssues(seed);

    expect(hint).toContain('Intent recommendations.');
    expect(hint).toContain('Evita: generic_processing_error.');
    expect(hint).toContain('No uses terminos tecnicos internos');
    expect(issues).toEqual(['seed:recommendations_recovery', 'failure:generic_processing_error']);
  });
});
