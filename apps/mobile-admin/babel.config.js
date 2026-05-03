module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@clubflow/mobile-shared': '../../packages/mobile-shared/src',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
