import {
  buildGeneratedBusinessPromptFiles,
  loadCanonicalBusinessPrompts,
} from '../../../../scripts/_helpers/entelequia-canonical-context';

describe('entelequia canonical business context', () => {
  it('loads all required canonical blocks', async () => {
    const prompts = await loadCanonicalBusinessPrompts(process.cwd());

    expect(prompts.staticContext).toContain('LOCALES ENTELEQUIA');
    expect(prompts.criticalPolicyContext).toContain('30 días corridos');
    expect(prompts.ticketsReturnsPolicyContext).toContain('7-10 días hábiles');
    expect(prompts.paymentShippingGeneralContext).toContain(
      'TODO EL MUNDO CON DHL EN MENOS DE 4 DIAS HABILES',
    );
  });

  it('maps canonical blocks to deterministic prompt target files', async () => {
    const prompts = await loadCanonicalBusinessPrompts(process.cwd());
    const files = buildGeneratedBusinessPromptFiles(prompts);

    expect(files.map((file) => file.path)).toEqual([
      'prompts/static/entelequia_static_context_v1.txt',
      'prompts/static/entelequia_critical_policy_context_v1.txt',
      'prompts/tickets/entelequia_tickets_returns_policy_context_v1.txt',
      'prompts/payment-shipping/entelequia_payment_shipping_general_context_v1.txt',
    ]);
  });
});
