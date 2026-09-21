import Config from 'react-native-config';

export interface AppConfig {
  APP_ENV: string;
  APP_NAME: string;
  KHEDUTBAZAR_URL: string;
  API_BASE_URL: string;
}

/**
 * Validates that required environment variables are defined.
 * Throws a clear error without leaking sensitive values if any required variable is missing.
 */
function validateConfig(config: typeof Config): AppConfig {
  const requiredKeys: (keyof AppConfig)[] = [
    'APP_ENV',
    'KHEDUTBAZAR_URL',
    'API_BASE_URL',
  ];

  for (const key of requiredKeys) {
    const value = config[key];
    if (!value || typeof value !== 'string' || value.trim() === '') {
      throw new Error(
        `[Config Error]: Missing required environment variable "${key}". Please ensure your active .env file defines it.`,
      );
    }
  }

  return {
    APP_ENV: config.APP_ENV as string,
    APP_NAME: config.APP_NAME || 'Khedutbazar',
    KHEDUTBAZAR_URL: config.KHEDUTBAZAR_URL as string,
    API_BASE_URL: config.API_BASE_URL as string,
  };
}

export const ENV: AppConfig = validateConfig(Config);
export default ENV;
