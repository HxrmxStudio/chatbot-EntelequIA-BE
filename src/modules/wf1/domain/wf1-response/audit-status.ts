import type { Wf1Response } from './types';

export interface ResponseAuditStatus {
  status: 'success' | 'requires_auth' | 'failure';
  responseType: 'success' | 'requiresAuth' | 'failure';
  requiresAuth: boolean;
}

/**
 * Derives audit metadata from a Wf1Response.
 * Single source of truth for interpreting response state for audit/persistence.
 */
export function getResponseAuditStatus(response: Wf1Response): ResponseAuditStatus {
  const isSuccess = response.ok === true;
  const requiresAuth = response.ok === false && 'requiresAuth' in response;

  return {
    status: isSuccess ? 'success' : requiresAuth ? 'requires_auth' : 'failure',
    responseType: isSuccess ? 'success' : requiresAuth ? 'requiresAuth' : 'failure',
    requiresAuth,
  };
}
