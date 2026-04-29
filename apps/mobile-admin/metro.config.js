const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../../packages/mobile-shared');

const config = getDefaultConfig(projectRoot);

// Watch the shared package source so that changes hot-reload.
config.watchFolders = [sharedRoot];

// Resolve the alias '@clubflow/mobile-shared' from the local node_modules
// of mobile-admin (no need to install it as a dep — the alias points at
// the package src directly via TS paths + babel module-resolver).
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@clubflow/mobile-shared': sharedRoot,
};

// Make sure Metro treats the shared package's node_modules same as the app's.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(sharedRoot, 'node_modules'),
];

module.exports = config;
