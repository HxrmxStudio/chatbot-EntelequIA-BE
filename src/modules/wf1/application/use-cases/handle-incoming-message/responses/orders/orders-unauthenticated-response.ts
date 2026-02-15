import type { Wf1Response } from '../../../../../domain/wf1-response';

const LOGIN_REQUIRED_TITLE = 'NECESITAS INICIAR SESION';
const SESSION_EXPIRED_TITLE = 'TU SESION EXPIRO O ES INVALIDA';

const SHARED_GUIDANCE_LINES = [
  'Para consultar el estado de tus pedidos, necesitas estar autenticado.',
  '',
  'Opciones:',
  '1. Inicia sesion en entelequia.com.ar',
  '2. Luego vuelve al chat (tu sesion se sincronizara)',
  '3. Tambien puedes consultar por email a info@entelequia.com.ar',
  '',
  'Si tienes numero de pedido (#12345), tambien puedes consultar por WhatsApp o email sin iniciar sesion.',
  '',
  'No compartas credenciales en el chat.',
] as const;

export function buildOrdersRequiresAuthResponse(): Wf1Response {
  return {
    ok: false,
    requiresAuth: true,
    message: buildOrdersAuthMessage(LOGIN_REQUIRED_TITLE),
  };
}

export function buildOrdersSessionExpiredResponse(): Wf1Response {
  return {
    ok: false,
    requiresAuth: true,
    message: buildOrdersAuthMessage(SESSION_EXPIRED_TITLE),
  };
}

export function buildOrdersReauthenticationGuidanceResponse(): Wf1Response {
  return {
    ok: false,
    requiresAuth: true,
    message: [
      '[NO DETECTO TU SESION EN ESTE CHAT]',
      '',
      'Para consultar pedidos ahora, hace esta re-autenticacion rapida:',
      '1. Inicia sesion nuevamente en entelequia.com.ar',
      '2. Volve a este chat y escribi: mis pedidos',
      '',
      'No compartas credenciales ni codigos en el chat.',
    ].join('\n'),
  };
}

function buildOrdersAuthMessage(title: string): string {
  return [`[${title}]`, '', ...SHARED_GUIDANCE_LINES].join('\n');
}
