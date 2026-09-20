const { build } = require('./package.json');

module.exports = {
  ...build,
  // Each architecture must be built natively with its matching Python runtime.
  mac: {
    target: ['dmg', 'zip'],
    artifactName: '${productName}-${version}-mac-${arch}.${ext}',
    category: 'public.app-category.education',
    identity: process.env.CSC_LINK ? undefined : '-',
    hardenedRuntime: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: Boolean(process.env.CSC_LINK && process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)
  },
  dmg: {
    contents: [
      { x: 140, y: 180, type: 'file' },
      { x: 420, y: 180, type: 'link', path: '/Applications' }
    ]
  }
};
