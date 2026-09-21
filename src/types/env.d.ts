declare module 'react-native-config' {
  export interface NativeConfig {
    APP_ENV?: 'development' | 'production' | string;
    APP_NAME?: string;
    KHEDUTBAZAR_URL?: string;
    API_BASE_URL?: string;
    [key: string]: string | undefined;
  }

  export const Config: NativeConfig;
  export default Config;
}
