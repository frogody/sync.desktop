#!/usr/bin/env node
/**
 * Validation script for notarize.js
 * Tests different authentication scenarios
 */

const path = require('path');
const notarizeModule = require('../scripts/notarize.js');

// Mock console.log to capture output
let logs = [];
const originalLog = console.log;
const mockLog = (...args) => {
  logs.push(args.join(' '));
  originalLog(...args);
};

// Mock context
const createMockContext = (platform = 'darwin') => ({
  electronPlatformName: platform,
  appOutDir: '/tmp/test',
  packager: {
    appInfo: {
      productFilename: 'TestApp'
    }
  }
});

async function testScenario(name, envVars, expectedLogs) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log('='.repeat(60));
  
  // Set environment variables
  Object.keys(envVars).forEach(key => {
    process.env[key] = envVars[key];
  });
  
  logs = [];
  console.log = mockLog;
  
  try {
    await notarizeModule.default(createMockContext());
  } catch (error) {
    // Expected for some scenarios
  }
  
  console.log = originalLog;
  
  // Clean up environment
  Object.keys(envVars).forEach(key => {
    delete process.env[key];
  });
  
  // Validate expectations
  let passed = true;
  expectedLogs.forEach(expected => {
    const found = logs.some(log => log.includes(expected));
    if (!found) {
      console.log(`  ✗ Expected log not found: "${expected}"`);
      passed = false;
    }
  });
  
  if (passed) {
    console.log('  ✓ Test passed');
  } else {
    console.log('  ✗ Test failed');
    console.log('\nActual logs:');
    logs.forEach(log => console.log(`    ${log}`));
  }
  
  return passed;
}

async function runTests() {
  console.log('Notarize.js Validation Tests');
  console.log('=' .repeat(60));
  
  let allPassed = true;
  
  // Test 1: Non-macOS platform
  // Create a custom context for non-darwin platform
  const nonMacContext = {
    electronPlatformName: 'win32',
    appOutDir: '/tmp/test',
    packager: {
      appInfo: {
        productFilename: 'TestApp'
      }
    }
  };
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: Non-macOS platform (Windows)`);
  console.log('='.repeat(60));
  
  logs = [];
  console.log = mockLog;
  
  try {
    await notarizeModule.default(nonMacContext);
  } catch (error) {
    // Expected for some scenarios
  }
  
  console.log = originalLog;
  
  const expectedLogs1 = ['Skipping notarization - not a macOS build'];
  let passed1 = true;
  expectedLogs1.forEach(expected => {
    const found = logs.some(log => log.includes(expected));
    if (!found) {
      console.log(`  ✗ Expected log not found: "${expected}"`);
      passed1 = false;
    }
  });
  
  if (passed1) {
    console.log('  ✓ Test passed');
  } else {
    console.log('  ✗ Test failed');
    console.log('\nActual logs:');
    logs.forEach(log => console.log(`    ${log}`));
  }
  
  allPassed &= passed1;
  
  // Test 2: SKIP_NOTARIZE flag
  allPassed &= await testScenario(
    'SKIP_NOTARIZE is true',
    { SKIP_NOTARIZE: 'true' },
    ['Skipping notarization - SKIP_NOTARIZE is set']
  );
  
  // Test 3: No credentials
  allPassed &= await testScenario(
    'No authentication credentials',
    {},
    [
      'Skipping notarization - no valid authentication method found',
      'Method 1 (Apple ID - legacy):',
      'Method 2 (API Key - recommended for CI/CD):',
      'APPLE_ID:',
      'APPLE_API_KEY_PATH:'
    ]
  );
  
  // Test 4: Apple ID authentication (partial - missing password)
  allPassed &= await testScenario(
    'Partial Apple ID credentials (missing password)',
    {
      APPLE_ID: 'test@example.com',
      APPLE_TEAM_ID: 'ABC1234XYZ'
    },
    [
      'Skipping notarization - no valid authentication method found',
      'APPLE_APP_SPECIFIC_PASSWORD:'
    ]
  );
  
  // Test 5: API Key authentication (partial - missing issuer)
  allPassed &= await testScenario(
    'Partial API Key credentials (missing issuer)',
    {
      APPLE_API_KEY_PATH: '/tmp/AuthKey_TEST.p8',
      APPLE_API_KEY_ID: 'TEST123',
      APPLE_TEAM_ID: 'ABC1234XYZ'
    },
    [
      'Skipping notarization - no valid authentication method found',
      'APPLE_API_KEY_ISSUER_ID:'
    ]
  );
  
  // Test 6: Both authentication methods (should prefer API Key)
  allPassed &= await testScenario(
    'Both authentication methods available',
    {
      APPLE_ID: 'test@example.com',
      APPLE_APP_SPECIFIC_PASSWORD: 'test-password',
      APPLE_API_KEY_PATH: '/tmp/AuthKey_TEST.p8',
      APPLE_API_KEY_ID: 'TEST123',
      APPLE_API_KEY_ISSUER_ID: '12345678-1234-1234-1234-123456789012',
      APPLE_TEAM_ID: 'ABC1234XYZ'
    },
    [
      'Both Apple ID and API Key authentication methods detected',
      'Using API Key method'
    ]
  );
  
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('✗ Some tests failed');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Error running tests:', error);
  process.exit(1);
});
