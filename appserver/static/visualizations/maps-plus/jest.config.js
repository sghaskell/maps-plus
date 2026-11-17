// Jest config. Mirrors the layout used on upstream branch
// feature/dashboard-studio-tile-proxy-v2 (tests/**/*.test.js) so the two merge cleanly.
//
// Babel options are passed to babel-jest inline instead of via a babel.config.js file:
// a project-wide babel config would also be picked up by webpack's babel-loader and
// change the production bundle.
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node', // use a `@jest-environment jsdom` docblock for DOM tests
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  transform: {
    '^.+\\.js$': ['babel-jest', { presets: [['@babel/preset-env', { targets: { node: 'current' } }]] }]
  },
  transformIgnorePatterns: ['/node_modules/'],
  // Allow tests to require vendored plugins the same way webpack resolves them.
  moduleDirectories: ['node_modules', '<rootDir>/src', '<rootDir>/contrib/js'],
  verbose: true
};
