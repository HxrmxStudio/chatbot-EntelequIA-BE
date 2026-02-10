export interface OpenAiResponse {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
      json?: unknown;
    }>;
  }>;
}
