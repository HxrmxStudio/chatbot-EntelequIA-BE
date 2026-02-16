import { readdir, readFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';

type ValidationIssueCode =
  | 'missing_section'
  | 'missing_rule'
  | 'blocked_phrase'
  | 'potential_contradiction';

export type PromptValidationIssue = {
  file: string;
  code: ValidationIssueCode;
  message: string;
};

type SectionRule = {
  filePattern: RegExp;
  requiredSections: string[];
};

type RequiredRule = {
  filePattern: RegExp;
  requiredPhrases: string[];
};

const BLOCKED_PHRASES = [
  'si te descubren te desconectan',
  'si no respondes bien seras castigada',
  'si no respondes bien seras castigado',
  'si respondes bien te ascienden',
  'si respondes bien te daran un premio',
  'seras castigada y desconectada',
  'seras castigado y desconectado',
];

const REQUIRED_SECTIONS_RULES: SectionRule[] = [
  {
    filePattern: /prompts\/system\/entelequia_assistant_system_prompt_v1\.txt$/,
    requiredSections: [
      '# rol y objetivo',
      '# reglas de respuesta',
      '# reglas por caso',
      '# que hacer si falta info',
      '# que no hacer',
    ],
  },
  {
    filePattern: /prompts\/products\/entelequia_products_context_instructions_v1\.txt$/,
    requiredSections: [
      '# rol y objetivo',
      '# reglas de respuesta',
      '# reglas por caso',
      '# que hacer si falta info',
      '# que no hacer',
      '# formato de salida',
    ],
  },
  {
    filePattern: /prompts\/orders\/entelequia_orders_context_instructions_v1\.txt$/,
    requiredSections: [
      '# rol y objetivo',
      '# reglas de respuesta',
      '# que hacer si falta info',
      '# que no hacer',
      '# formato de salida',
    ],
  },
  {
    filePattern: /prompts\/orders\/entelequia_order_detail_context_instructions_v1\.txt$/,
    requiredSections: [
      '# rol y objetivo',
      '# reglas de respuesta',
      '# que hacer si falta info',
      '# que no hacer',
      '# formato de salida',
    ],
  },
  {
    filePattern: /prompts\/payment-shipping\/entelequia_payment_shipping_instructions_v1\.txt$/,
    requiredSections: [
      '# rol y objetivo',
      '# reglas de respuesta',
      '# que hacer si falta info',
      '# que no hacer',
      '# formato de salida',
    ],
  },
  {
    filePattern:
      /prompts\/recommendations\/entelequia_recommendations_context_instructions_v1\.txt$/,
    requiredSections: [
      '# rol y objetivo',
      '# reglas de respuesta',
      '# reglas por caso',
      '# que hacer si falta info',
      '# que no hacer',
      '# formato de salida',
    ],
  },
  {
    filePattern: /prompts\/tickets\/entelequia_tickets_context_instructions_v1\.txt$/,
    requiredSections: [
      '# rol y objetivo',
      '# reglas de respuesta',
      '# que hacer si falta info',
      '# que no hacer',
      '# formato de salida',
    ],
  },
  {
    filePattern: /prompts\/store-info\/entelequia_store_info_context_instructions_v1\.txt$/,
    requiredSections: [
      '# rol y objetivo',
      '# reglas de respuesta',
      '# que hacer si falta info',
      '# que no hacer',
      '# formato de salida',
    ],
  },
  {
    filePattern: /prompts\/general\/entelequia_general_context_instructions_v1\.txt$/,
    requiredSections: [
      '# rol y objetivo',
      '# reglas de respuesta',
      '# que hacer si falta info',
      '# que no hacer',
      '# formato de salida',
    ],
  },
  {
    filePattern: /prompts\/eval\/entelequia_response_quality_judge_v1\.txt$/,
    requiredSections: [
      '# rol y objetivo',
      '# input',
      '# criterios',
      '# reglas',
      '# formato de salida',
    ],
  },
  {
    filePattern: /prompts\/system\/entelequia_intent_system_prompt_v1\.txt$/,
    requiredSections: [
      '# rol y objetivo',
      '# intents permitidos',
      '# reglas de clasificacion',
      '# formato de salida (obligatorio)',
    ],
  },
];

const REQUIRED_PHRASES_RULES: RequiredRule[] = [
  {
    filePattern: /prompts\/system\/entelequia_assistant_system_prompt_v1\.txt$/,
    requiredPhrases: [
      'tu desempeno se evalua por precision, utilidad y claridad',
      'soy el asistente virtual de entelequia',
      'no inventes datos',
      'una sola aclaracion corta',
    ],
  },
  {
    filePattern: /prompts\/products\/entelequia_products_context_instructions_v1\.txt$/,
    requiredPhrases: [
      'hay stock',
      'quedan pocas unidades',
      'sin stock',
      'solo compartir cantidad exacta',
    ],
  },
  {
    filePattern: /prompts\/store-info\/entelequia_store_info_hours_context_v1\.txt$/,
    requiredPhrases: [
      'lunes a viernes: 10:00 a 19:00 hs',
      'sabados: 10:00 a 17:00 hs',
      'feriados: 11:00 a 19:00 hs',
    ],
  },
];

const CONTRADICTION_GROUPS: Array<{ name: string; patterns: RegExp[] }> = [
  {
    name: 'context_only_vs_guessing',
    patterns: [
      /(usa solo informacion confirmada|usa solo esa informacion|no inventes)/i,
      /(completa con suposiciones|usa tu conocimiento aunque no figure|adivina|rellena huecos con supuestos)/i,
    ],
  },
  {
    name: 'single_clarification_vs_many_questions',
    patterns: [
      /(una sola aclaracion|una sola pregunta)/i,
      /(hace varias preguntas|realiza varias preguntas|dos o mas preguntas)/i,
    ],
  },
];

export async function validatePrompts(
  rootDir: string = process.cwd(),
): Promise<PromptValidationIssue[]> {
  const promptsDir = resolve(rootDir, 'prompts');
  const files = await listTxtFiles(promptsDir);
  const issues: PromptValidationIssue[] = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    issues.push(...validatePromptContent(file, content));
  }

  return issues;
}

export function validatePromptContent(filePath: string, content: string): PromptValidationIssue[] {
  const issues: PromptValidationIssue[] = [];
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedContent = normalize(content);

  for (const phrase of BLOCKED_PHRASES) {
    if (normalizedContent.includes(normalize(phrase))) {
      issues.push({
        file: normalizedPath,
        code: 'blocked_phrase',
        message: `Blocked phrase detected: "${phrase}"`,
      });
    }
  }

  for (const rule of REQUIRED_SECTIONS_RULES) {
    if (!rule.filePattern.test(normalizedPath)) continue;

    for (const section of rule.requiredSections) {
      if (!normalizedContent.includes(normalize(section))) {
        issues.push({
          file: normalizedPath,
          code: 'missing_section',
          message: `Missing required section: "${section}"`,
        });
      }
    }
  }

  for (const rule of REQUIRED_PHRASES_RULES) {
    if (!rule.filePattern.test(normalizedPath)) continue;

    for (const phrase of rule.requiredPhrases) {
      if (!normalizedContent.includes(normalize(phrase))) {
        issues.push({
          file: normalizedPath,
          code: 'missing_rule',
          message: `Missing required rule phrase: "${phrase}"`,
        });
      }
    }
  }

  for (const group of CONTRADICTION_GROUPS) {
    const allMatch = group.patterns.every((pattern) => pattern.test(normalizedContent));
    if (allMatch) {
      issues.push({
        file: normalizedPath,
        code: 'potential_contradiction',
        message: `Potential contradiction detected: ${group.name}`,
      });
    }
  }

  return issues;
}

async function listTxtFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTxtFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.txt')) {
      files.push(fullPath);
    }
  }

  files.sort();
  return files;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main(): Promise<void> {
  const issues = await validatePrompts();

  if (issues.length === 0) {
    // eslint-disable-next-line no-console
    console.log('Prompt validation passed.');
    return;
  }

  // eslint-disable-next-line no-console
  console.error(`Prompt validation failed with ${issues.length} issue(s):`);
  for (const issue of issues) {
    // eslint-disable-next-line no-console
    console.error(`- ${relative(process.cwd(), issue.file)} [${issue.code}] ${issue.message}`);
  }

  process.exitCode = 1;
}

if (require.main === module) {
  void main();
}
