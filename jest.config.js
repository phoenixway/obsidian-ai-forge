// jest.config.js
/** @type {import('ts-jest').JestConfigWithTsJest} **/
const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

const mapper = pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' });
// console.log('>>> Jest Config: Generated moduleNameMapper:', JSON.stringify(mapper, null, 2)); // You can remove this log now if you want

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: mapper,
  // Add this line, ensuring the path is correct relative to your project root:
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
};