const INSECURE_FALLBACK_SECRET = 'your-super-secret-jwt-key-change-this-in-production';

export const getJwtSecret = () => {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret || jwtSecret.trim().length < 32 || jwtSecret === INSECURE_FALLBACK_SECRET) {
    const message = 'JWT_SECRET is missing or too weak. Use a random secret with at least 32 characters.';

    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    }

    console.warn(`[Security] ${message}`);
    return INSECURE_FALLBACK_SECRET;
  }

  return jwtSecret;
};

export const extractBearerToken = (authHeader) => {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token || null;
};
