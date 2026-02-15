import type { ContextBlock } from './types';

const PRICE_CHALLENGE_HINT =
  'IMPORTANTE: El usuario esta cuestionando tu respuesta anterior. Valida que el precio que indicaste sigue siendo correcto segun el snapshot actual.';

export function appendInstructionHintContextBlock(
  contextBlocks: ContextBlock[],
  hint: string,
): ContextBlock[] {
  const instructionBlock: ContextBlock = {
    contextType: 'instruction_hint',
    contextPayload: { hint },
  };
  const filtered = contextBlocks.filter(
    (block) => block.contextType !== 'instruction_hint',
  );
  return [...filtered, instructionBlock];
}

export function appendPriceChallengeHintContextBlock(
  contextBlocks: ContextBlock[],
): ContextBlock[] {
  return appendInstructionHintContextBlock(contextBlocks, PRICE_CHALLENGE_HINT);
}
