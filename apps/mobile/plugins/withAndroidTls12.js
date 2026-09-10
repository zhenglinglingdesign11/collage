const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Keep Maven/Google Maven dependency resolution on TLS 1.2 for development
 * machines where the default TLS negotiation is unreliable.
 *
 * This is intentionally an Android-only generated-project change. It keeps
 * the setting out of the ignored android/ directory while making it
 * reproducible for every `expo prebuild` and native build.
 */
module.exports = function withAndroidTls12(config) {
  return withGradleProperties(config, (modConfig) => {
    const properties = modConfig.modResults;
    const existing = properties.find(
      (property) => property.type === 'property' && property.key === 'systemProp.https.protocols',
    );

    if (existing) {
      existing.value = 'TLSv1.2';
    } else {
      properties.push({ type: 'property', key: 'systemProp.https.protocols', value: 'TLSv1.2' });
    }

    return modConfig;
  });
};
