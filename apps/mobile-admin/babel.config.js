// EAS Build n'upload que `apps/mobile-admin/` ; le chemin
// `../../packages/mobile-shared/src` n'existe pas dans le tarball
// côté serveur EAS → alias casse → "Cannot find module". Solution
// pragmatique : copie de `packages/mobile-shared/src` dans
// `apps/mobile-admin/src/_shared/` (commitée). Alias pointe en local
// → résolution OK en dev local + build EAS.
//
// Pour resync après un changement dans packages/mobile-shared :
//   cp -r packages/mobile-shared/src apps/mobile-admin/src/_shared
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
            '@clubflow/mobile-shared': './src/_shared',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
