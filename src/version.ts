// Single source of truth for the package version. Release-please bumps the
// literal below (listed in release-please-config.json `extra-files`), and
// tests/version-sync.test.ts guards it against package.json drift. Every
// other module imports VERSION from here rather than re-declaring it.
export const VERSION = '1.2.0'; // x-release-please-version
