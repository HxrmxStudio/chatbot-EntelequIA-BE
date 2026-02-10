import { Injectable } from '@nestjs/common';
import type { PromptTemplatesPort } from '../../../application/ports/prompt-templates.port';
import { loadPromptFile } from '../shared';
import {
  DEFAULT_GENERAL_CONTEXT_HINT,
  DEFAULT_PRODUCTS_CONTEXT_ADDITIONAL_INFO,
  DEFAULT_PRODUCTS_CONTEXT_HEADER,
  DEFAULT_PRODUCTS_CONTEXT_INSTRUCTIONS,
  DEFAULT_STATIC_CONTEXT,
  GENERAL_CONTEXT_HINT_PATH,
  PRODUCTS_CONTEXT_ADDITIONAL_INFO_PATH,
  PRODUCTS_CONTEXT_HEADER_PATH,
  PRODUCTS_CONTEXT_INSTRUCTIONS_PATH,
  STATIC_CONTEXT_PATH,
} from './constants';

/**
 * Adapter that loads and provides prompt templates from filesystem.
 * Loads all prompts synchronously in constructor for simplicity.
 * Uses fallback defaults if files cannot be loaded.
 *
 * Implements PromptTemplatesPort to provide centralized prompt access.
 */
@Injectable()
export class PromptTemplatesAdapter implements PromptTemplatesPort {
  private readonly productsHeader: string;
  private readonly productsAdditionalInfo: string;
  private readonly productsInstructions: string;
  private readonly generalHint: string;
  private readonly staticContext: string;

  constructor() {
    // Load all prompts at construction time (synchronous, acceptable for static prompts)
    this.productsHeader = loadPromptFile(PRODUCTS_CONTEXT_HEADER_PATH, DEFAULT_PRODUCTS_CONTEXT_HEADER);
    this.productsAdditionalInfo = loadPromptFile(
      PRODUCTS_CONTEXT_ADDITIONAL_INFO_PATH,
      DEFAULT_PRODUCTS_CONTEXT_ADDITIONAL_INFO,
    );
    this.productsInstructions = loadPromptFile(
      PRODUCTS_CONTEXT_INSTRUCTIONS_PATH,
      DEFAULT_PRODUCTS_CONTEXT_INSTRUCTIONS,
    );
    this.generalHint = loadPromptFile(GENERAL_CONTEXT_HINT_PATH, DEFAULT_GENERAL_CONTEXT_HINT);
    this.staticContext = loadPromptFile(STATIC_CONTEXT_PATH, DEFAULT_STATIC_CONTEXT);
  }

  getProductsContextHeader(): string {
    return this.productsHeader;
  }

  getProductsContextAdditionalInfo(): string {
    return this.productsAdditionalInfo;
  }

  getProductsContextInstructions(): string {
    return this.productsInstructions;
  }

  getGeneralContextHint(): string {
    return this.generalHint;
  }

  getStaticContext(): string {
    return this.staticContext;
  }
}

