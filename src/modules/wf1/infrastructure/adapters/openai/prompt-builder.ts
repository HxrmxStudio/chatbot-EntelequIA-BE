import type { ContextBlock } from '../../../domain/context-block';

export function buildPrompt(
  systemPrompt: string,
  userText: string,
  intent: string,
  history: Array<{ sender: string; content: string; createdAt: string }>,
  contextBlocks: ContextBlock[],
): string {
  return [
    systemPrompt,
    `Intent detectado: ${intent}`,
    `Mensaje usuario: ${userText}`,
    `Historial reciente: ${JSON.stringify(history.slice(-6))}`,
    `Contexto negocio: ${JSON.stringify(contextBlocks)}`,
  ].join('\n');
}
