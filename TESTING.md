# Testing Guide

This document provides guidelines for writing and running tests in the woly-backend project.

## Overview

The project uses **Jest** as the test framework with **ts-jest** for TypeScript support and **Supertest** for API integration testing.

## Test Coverage Standards

The project enforces the following minimum coverage thresholds:

- **Statements**: 80%
- **Branches**: 70%
- **Functions**: 85%
- **Lines**: 80%

CI builds will fail if coverage drops below these thresholds.

## Test Structure

### Unit Tests

Unit tests are located in `__tests__/` directories alongside the source code:

```
controllers/
  hosts.ts
  __tests__/
    hosts.unit.test.ts
services/
  hostDatabase.ts
  __tests__/
    hostDatabase.unit.test.ts
```

Unit tests should:

- Test individual functions and classes in isolation
- Mock external dependencies (databases, network calls, file I/O)
- Focus on business logic and edge cases
- Be fast and independent

### Integration Tests

Integration tests are located in the root `__tests__/` directory:

```
__tests__/
  api.integration.test.ts
  app.unit.test.ts
```

Integration tests should:

- Test complete request/response flows
- Use in-memory databases when possible
- Mock external services but not internal modules
- Verify API contracts and error handling

## Running Tests

```bash
# Ensure the expected Node runtime
nvm use

# Optional: reinstall native deps after Node upgrade
npm rebuild

# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run in watch mode (re-runs on file changes)
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run in CI mode (used by GitHub Actions)
npm run test:ci
```

## Runtime Prerequisites

- Node.js v22+ is supported.
- `.nvmrc` provides a baseline local version for consistency, but newer Node versions are supported.
- Test preflight verifies that local socket bind is allowed because Supertest-based suites require it.
- If preflight fails on socket bind, run tests outside restricted/sandboxed execution environments.

## Writing Tests

### Basic Test Structure

```typescript
import { functionToTest } from '../module';

describe('Module Name', () => {
  describe('functionToTest', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionToTest(input);

      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

### Mocking Dependencies

```typescript
// Mock external module
jest.mock('axios');
jest.mock('../services/database');

// Mock specific functions
const mockGetData = jest.fn();
jest.mock('../api', () => ({
  getData: mockGetData,
}));

// In test
beforeEach(() => {
  jest.clearAllMocks();
  mockGetData.mockResolvedValue({ data: 'test' });
});
```

### Testing Express Controllers

```typescript
import { Request, Response } from 'express';
import { controllerFunction } from '../controller';

let mockReq: Partial<Request>;
let mockRes: Partial<Response>;

beforeEach(() => {
  mockReq = {
    params: { id: '123' },
    body: { name: 'test' },
    query: {},
  };

  mockRes = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
});

it('should handle request', async () => {
  await controllerFunction(mockReq as Request, mockRes as Response);

  expect(mockRes.status).toHaveBeenCalledWith(200);
  expect(mockRes.json).toHaveBeenCalledWith({ success: true });
});
```

### Testing API Endpoints

```typescript
import request from 'supertest';
import express from 'express';
import routes from '../routes';

let app: express.Application;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api', routes);
});

it('should return hosts list', async () => {
  const response = await request(app).get('/api/hosts').expect(200).expect('Content-Type', /json/);

  expect(response.body).toHaveProperty('hosts');
  expect(Array.isArray(response.body.hosts)).toBe(true);
});
```

### Testing Async Code

```typescript
it('should handle async operations', async () => {
  // Using async/await
  const result = await asyncFunction();
  expect(result).toBe('expected');
});

it('should handle promises', () => {
  // Using return
  return asyncFunction().then((result) => {
    expect(result).toBe('expected');
  });
});

it('should handle rejections', async () => {
  // Testing errors
  await expect(asyncFunction()).rejects.toThrow('Error message');
});
```

### Testing Error Cases

```typescript
it('should handle validation errors', () => {
  expect(() => {
    validateInput('invalid');
  }).toThrow('Validation failed');
});

it('should return error response', async () => {
  mockDb.getUser.mockRejectedValue(new Error('Not found'));

  await request(app)
    .get('/users/999')
    .expect(404)
    .expect((res) => {
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
});
```

## Best Practices

### DO:

✅ Write descriptive test names that explain what is being tested
✅ Use `describe` blocks to group related tests
✅ Clear all mocks between tests using `jest.clearAllMocks()`
✅ Test edge cases and error conditions
✅ Use `beforeEach` for common setup
✅ Make tests independent and order-agnostic
✅ Mock external dependencies (databases, APIs, file system)
✅ Test one thing per test case
✅ Use meaningful assertion messages
✅ Keep tests simple and readable

### DON'T:

❌ Test implementation details
❌ Share state between tests
❌ Make network calls in unit tests
❌ Use real databases in unit tests
❌ Write tests that depend on execution order
❌ Mock everything (test real integration where appropriate)
❌ Ignore failing tests
❌ Skip writing tests for "trivial" code
❌ Commit code without running tests locally
❌ Remove tests to increase coverage (fix the code instead)

## Coverage Configuration

Coverage is configured in `jest.config.js`:

```javascript
coverageThreshold: {
  global: {
    branches: 70,
    functions: 85,
    lines: 80,
    statements: 80
  }
}
```

### Files Excluded from Coverage

- `app.ts` - Server entry point (initialization code)
- `swagger.ts` - API documentation configuration
- Type definition files (`*.d.ts`)
- Test files themselves
- Build artifacts and dependencies

### Viewing Coverage Reports

After running `npm run test:coverage`:

1. **Terminal**: Summary displayed in console
2. **HTML**: Open `coverage/lcov-report/index.html` in browser
3. **Codecov**: Automatic upload in CI (view on GitHub)

## CI/CD Integration

Tests run automatically on:

- Every push to `master` or `main`
- Every pull request

The CI pipeline:

1. Installs dependencies
2. Runs linter
3. Runs tests with coverage
4. Uploads coverage to Codecov
5. Fails build if coverage drops below thresholds

## Troubleshooting

### Tests are slow

- Use mocks for database and network calls
- Use in-memory databases for integration tests
- Run specific test files: `npm test -- path/to/test.ts`
- Use `test.only` temporarily to run single test

### Coverage not updating

- Delete `coverage/` directory
- Run `npm run test:coverage` again
- Check `.gitignore` doesn't exclude your files

### Mocks not working

- Ensure `jest.clearAllMocks()` is in `beforeEach`
- Check mock is defined before the import that uses it
- Verify mock path matches module path exactly

### Tests pass locally but fail in CI

- Check environment-specific code paths
- Verify timing-dependent tests have sufficient timeouts
- Ensure no reliance on local files or state
- Check for timezone-dependent date handling

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [TypeScript with Jest](https://kulshekhar.github.io/ts-jest/)

## Getting Help

If you have questions about testing:

1. Check this documentation first
2. Look at existing tests for examples
3. Search [Jest documentation](https://jestjs.io/)
4. Ask in team chat or pull request
5. Open an issue on GitHub
