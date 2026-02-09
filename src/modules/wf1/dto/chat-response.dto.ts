export class ChatSuccessResponseDto {
  ok!: true;
  message!: string;
  conversationId!: string;
  intent?: string;
}

export class ChatRequiresAuthResponseDto {
  ok!: false;
  requiresAuth!: true;
  message!: string;
}

export class ChatFailureResponseDto {
  ok!: false;
  message!: string;
}
