import { validateEnv } from '@/common/config/env.validation';

describe('env.validation', () => {
  const baseConfig = {
    CHATBOT_DB_URL: 'postgres://user:pass@localhost:5432/chatbot',
    ENTELEQUIA_BASE_URL: 'https://entelequia.com.ar',
    BOT_ORDER_LOOKUP_HMAC_SECRET: 'secret',
  };

  it('allows empty ALLOWED_ORIGINS in development', () => {
    const result = validateEnv({
      ...baseConfig,
      NODE_ENV: 'development',
      ALLOWED_ORIGINS: '',
    });

    expect(result.ALLOWED_ORIGINS).toEqual([]);
  });

  it('requires ALLOWED_ORIGINS in production', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        TURNSTILE_SECRET_KEY: 'turnstile-secret',
        ALLOWED_ORIGINS: '',
      }),
    ).toThrow('ALLOWED_ORIGINS is required in production');
  });

  it('accepts ALLOWED_ORIGINS in production', () => {
    const result = validateEnv({
      ...baseConfig,
      NODE_ENV: 'production',
      TURNSTILE_SECRET_KEY: 'turnstile-secret',
      ALLOWED_ORIGINS: 'https://entelequia.com.ar,http://localhost:5173',
    });

    expect(result.ALLOWED_ORIGINS).toEqual([
      'https://entelequia.com.ar',
      'http://localhost:5173',
    ]);
  });
});
