export type OrderLookupRateLimitScope = 'ip' | 'user' | 'order';

export interface OrderLookupRateLimitDecision {
  allowed: boolean;
  degraded: boolean;
  blockedBy?: OrderLookupRateLimitScope;
}

export interface OrderLookupRateLimiterPort {
  consume(input: {
    requestId: string;
    userId?: string;
    conversationId: string;
    orderId: number;
    clientIp?: string;
  }): Promise<OrderLookupRateLimitDecision>;
}
