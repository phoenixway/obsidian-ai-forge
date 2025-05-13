// jest.config.js
/** @type {import('ts-jest').JestConfigWithTsJest} **/
const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

// Генеруємо маппер для шляхів з tsconfig.json (якщо вони є)
const tsconfigPathsMapper = pathsToModuleNameMapper(compilerOptions.paths || {}, { prefix: '<rootDir>/' });
// console.log('>>> Jest Config: Generated tsconfigPathsMapper:', JSON.stringify(tsconfigPathsMapper, null, 2));

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    // Спочатку додаємо явний маппінг для 'obsidian'
    '^obsidian$': '<rootDir>/__mocks__/obsidian.ts', 
    
    // Потім додаємо маппінги, згенеровані з tsconfig.paths
    // Це важливо, щоб маппінг для 'obsidian' мав пріоритет, якщо раптом
    // у compilerOptions.paths є щось, що може з ним конфліктувати (малоймовірно для 'obsidian')
    ...tsconfigPathsMapper, 
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'], 
  // Можливо, знадобиться, якщо у вас є CSS/SCSS імпорти в компонентах, 
  // які ви тестуєте (хоча для рендерерів це менш ймовірно):
  // moduleNameMapper: {
  //   ...
  //   '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  // },
};