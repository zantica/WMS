// apps/mobile/metro.config.js
// Configuración de Metro Bundler para Expo Router dentro del monorepo Turborepo + pnpm.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Observar todos los archivos dentro del monorepo (incluyendo packages/shared-types)
config.watchFolders = [monorepoRoot];

// 2. Resolver paquetes desde node_modules local y raíz del monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Paquetes que DEBEN resolverse como instancia única (singleton) desde apps/mobile
// para evitar que pnpm inyecte dos copias distintas de React en el bundle web/móvil.
const SINGLETON_MODULES = new Set([
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/client",
  "react-native",
  "react-native-web",
]);

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;

  // Forzar que react, react-dom y react-native(-web) se resuelvan siempre desde projectRoot
  if (
    SINGLETON_MODULES.has(moduleName) ||
    moduleName.startsWith("react/") ||
    moduleName.startsWith("react-dom/")
  ) {
    return resolve(
      {
        ...context,
        originModulePath: path.join(projectRoot, "package.json"),
      },
      moduleName,
      platform,
    );
  }

  // Permitir resolución de imports relativos con sufijo .js hacia archivos .ts / .tsx
  if (
    (moduleName.startsWith("./") || moduleName.startsWith("../")) &&
    moduleName.endsWith(".js")
  ) {
    const strippedName = moduleName.slice(0, -3);
    try {
      return resolve(context, strippedName, platform);
    } catch {
      // Fallback al comportamiento por defecto
    }
  }

  return resolve(context, moduleName, platform);
};

module.exports = config;
