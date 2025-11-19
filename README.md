# woly-backend

[![Tests](https://github.com/kaonis/woly-backend/actions/workflows/test.yml/badge.svg)](https://github.com/kaonis/woly-backend/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/kaonis/woly-backend/branch/master/graph/badge.svg)](https://codecov.io/gh/kaonis/woly-backend)

WoLy app https://github.com/kaonis/woly Node.JS back-end

## Testing

This project has comprehensive test coverage:
- **85 tests** across unit and integration test suites
- **83.68%** statement coverage
- **92.85%** function coverage

Run tests with:
```bash
npm test                # Run all tests
npm run test:coverage   # Run tests with coverage report
npm run test:watch      # Run tests in watch mode
npm run test:unit       # Run only unit tests
npm run test:integration # Run only integration tests
```

## API Endpoints

GET /hosts/:name
GET /hosts/wakeup/:name
GET /hosts
