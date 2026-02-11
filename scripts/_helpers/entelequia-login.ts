export type EntelequiaLoginResult = {
  user: { id: string; email: string; name: string };
  accessToken: string;
};

type EntelequiaLoginResponse = {
  user?: { id?: unknown; name?: unknown; email?: unknown };
  access_token?: unknown;
};

function resolveSafeString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

export async function loginToEntelequia(input: {
  baseUrl: string;
  timeoutMs: number;
  email: string;
  password: string;
}): Promise<EntelequiaLoginResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(`${input.baseUrl.replace(/\/$/, '')}/login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: input.email, password: input.password }),
      signal: controller.signal,
    });

    const json = (await response.json()) as EntelequiaLoginResponse;

    if (!response.ok) {
      throw new Error(
        `Entelequia login failed (${response.status}): ${JSON.stringify(json)}`,
      );
    }

    const accessToken = resolveSafeString(json.access_token);
    if (accessToken.length === 0) {
      throw new Error('Entelequia login response missing access_token');
    }

    const user = {
      id: resolveSafeString(json.user?.id),
      email: resolveSafeString(json.user?.email),
      name: resolveSafeString(json.user?.name),
    };

    return { user, accessToken };
  } finally {
    clearTimeout(timeoutId);
  }
}

