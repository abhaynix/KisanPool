const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// monorepo: the app resolves @kisanpool/shared straight from packages/
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// npm workspaces can leave a newer peer copy hoisted at the repository root.
// Pin these imports to the app's SDK-compatible copies so every bundle uses one
// React dispatcher and Expo SDK 58's expo-font implementation.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: path.resolve(projectRoot, 'node_modules/react'),
  'expo-font': path.resolve(projectRoot, 'node_modules/expo-font'),
};

module.exports = config;
