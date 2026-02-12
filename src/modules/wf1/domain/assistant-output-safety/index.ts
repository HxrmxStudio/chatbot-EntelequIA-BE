export interface AssistantOutputSanitizationResult {
  message: string;
  rewritten: boolean;
  reasons: string[];
}

interface OutputReplacementRule {
  reason: string;
  pattern: RegExp;
  replacement: string;
}

const OUTPUT_REPLACEMENT_RULES: readonly OutputReplacementRule[] = [
  {
    reason: 'generic_processing_error',
    pattern: /no pudimos procesar tu mensaje\.?/gi,
    replacement:
      'Se complico esta consulta. Si queres, la intento de nuevo o te ayudo por otro camino.',
  },
  {
    reason: 'generic_processing_error',
    pattern: /no pude procesar (tu mensaje|esta consulta|eso)\.?/gi,
    replacement:
      'Se complico esta consulta. Si queres, la intento de nuevo o te ayudo por otro camino.',
  },
  {
    reason: 'technical_context_phrase',
    pattern: /\ben el contexto\b/gi,
    replacement: 'ahora',
  },
  {
    reason: 'technical_context_phrase',
    pattern: /\bsin contexto adicional\b/gi,
    replacement: 'con los datos disponibles por ahora',
  },
  {
    reason: 'technical_context_word',
    pattern: /\bcontexto\b/gi,
    replacement: 'informacion disponible',
  },
  {
    reason: 'technical_prompt_word',
    pattern: /\bprompt(s)?\b/gi,
    replacement: 'instrucciones internas',
  },
  {
    reason: 'technical_api_word',
    pattern: /\bapi(s)?\b/gi,
    replacement: 'servicio',
  },
  {
    reason: 'technical_endpoint_word',
    pattern: /\bendpoint(s)?\b/gi,
    replacement: 'servicio',
  },
  {
    reason: 'technical_json_word',
    pattern: /\bjson\b/gi,
    replacement: 'datos',
  },
  {
    reason: 'technical_token_word',
    pattern: /\btoken(s)?\b/gi,
    replacement: 'credenciales',
  },
  {
    reason: 'technical_fallback_word',
    pattern: /\bfallback\b/gi,
    replacement: 'alternativa',
  },
  {
    reason: 'technical_timeout_word',
    pattern: /\btimeout\b/gi,
    replacement: 'demora',
  },
  {
    reason: 'technical_latency_word',
    pattern: /\blatencia\b/gi,
    replacement: 'demora',
  },
  {
    reason: 'technical_model_phrase',
    pattern: /\bmodelo (de ia|llm|del sistema)\b/gi,
    replacement: 'asistente',
  },
] as const;

export function sanitizeAssistantUserMessage(message: string): AssistantOutputSanitizationResult {
  if (message.trim().length === 0) {
    return {
      message,
      rewritten: false,
      reasons: [],
    };
  }

  let sanitized = message;
  const reasonSet = new Set<string>();

  for (const rule of OUTPUT_REPLACEMENT_RULES) {
    const next = sanitized.replace(rule.pattern, rule.replacement);
    if (next !== sanitized) {
      reasonSet.add(rule.reason);
      sanitized = next;
    }
  }

  sanitized = normalizeWhitespace(sanitized);

  return {
    message: sanitized,
    rewritten: sanitized !== message,
    reasons: [...reasonSet],
  };
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
