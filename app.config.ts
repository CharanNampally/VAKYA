import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Vākya',
  slug: config.slug ?? 'vakya-sanskrit',
  experiments: {
    ...config.experiments,
    baseUrl: process.env.EXPO_PUBLIC_BASE_PATH ?? '',
  },
});
