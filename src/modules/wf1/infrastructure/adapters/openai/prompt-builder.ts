import { renderContextBlocksForPrompt, type ContextBlock } from '@/modules/wf1/domain/context-block';

export function buildPrompt(
  systemPrompt: string,
  userText: string,
  intent: string,
  history: Array<{ sender: string; content: string; createdAt: string }>,
  contextBlocks: ContextBlock[],
): string {
  const renderedContext = renderContextBlocksForPrompt(contextBlocks);

  return [
    systemPrompt,
    `Intent detectado: ${intent}`,
    `Mensaje usuario: ${userText}`,
    `Historial reciente: ${JSON.stringify(history.slice(-6))}`,
    'Contexto negocio:',
    renderedContext.length > 0 ? renderedContext : '(Sin contexto adicional)',
  ].join('\n');
}
