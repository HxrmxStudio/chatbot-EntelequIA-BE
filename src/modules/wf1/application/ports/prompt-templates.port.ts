export interface PromptTemplatesPort {
  getProductsContextHeader(): string;
  getProductsContextAdditionalInfo(): string;
  getProductsContextInstructions(): string;
  getGeneralContextHint(): string;
  getStaticContext(): string;
}

