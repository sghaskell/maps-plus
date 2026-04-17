module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  transform: { '^.+\\.js$': 'babel-jest' },
  transformIgnorePatterns: ['/node_modules/'],
  rootDir: __dirname,
  verbose: true,
  collectCoverageFrom: ['src/ds-tile-proxy-helpers.js']
};
