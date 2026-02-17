import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import { buildStoreInfoAiContext } from '@/modules/wf1/domain/store-info-context';
import { resolveStoreInfoQueryType } from '../query-resolvers';
import type { EnrichInput, EnrichDeps } from '../types';

export async function enrichStoreInfo(
  input: EnrichInput,
  deps: EnrichDeps,
): Promise<ContextBlock[]> {
  const { promptTemplates } = deps;

  const infoRequested = resolveStoreInfoQueryType({
    text: input.text,
    entities: input.intentResult.entities,
  });
  const aiContext = buildStoreInfoAiContext({
    infoRequested,
    templates: {
      locationContext: promptTemplates.getStoreInfoLocationContext(),
      hoursContext: promptTemplates.getStoreInfoHoursContext(),
      parkingContext: promptTemplates.getStoreInfoParkingContext(),
      transportContext: promptTemplates.getStoreInfoTransportContext(),
      generalContext: promptTemplates.getStoreInfoGeneralContext(),
      instructions: promptTemplates.getStoreInfoContextInstructions(),
    },
  });

  return [
    {
      contextType: 'store_info',
      contextPayload: {
        infoRequested: aiContext.infoRequested,
        aiContext: aiContext.contextText,
      },
    },
  ];
}
