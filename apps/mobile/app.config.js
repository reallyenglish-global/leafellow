// Preserve ordinary development defaults; signed builds supply an explicit unused code.
module.exports = ({ config }) => {
  const value = process.env.LEAFELLOW_ANDROID_VERSION_CODE;
  if (value === undefined) return config;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2100000000) {
    throw new Error('versionCode must be a positive integer <= 2100000000');
  }
  if (config.android?.package !== 'com.reallyenglish.leafellow') throw new Error('Unexpected Android package');
  return { ...config, android: { ...config.android, versionCode: Number(value) } };
};
