import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import { buildGeneralAiContext } from '@/modules/wf1/domain/general-context';
import type { EnrichDeps } from '../types';

export async function enrichGeneral(deps: EnrichDeps): Promise<ContextBlock[]> {
  const { promptTemplates } = deps;

  const hint = promptTemplates.getGeneralContextHint();
  const aiContext = buildGeneralAiContext({
    templates: {
      hint,
      instructions: promptTemplates.getGeneralContextInstructions(),
    },
  });

  return [
    {
      contextType: 'general',
      contextPayload: {
        hint,
        aiContext: aiContext.contextText,
      },
    },
  ];
}
