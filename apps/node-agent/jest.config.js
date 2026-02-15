module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
    }],
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/node_modules/**',
    '!src/test/**',
    '!src/app.ts',
    '!src/swagger.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/src/test/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testTimeout: 10000,
  clearMocks: true,
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '/__tests__/',
    '/types/'
  ]
};
