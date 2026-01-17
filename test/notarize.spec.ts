/**
 * Test for notarize.js logic
 * This test verifies that the notarize script properly handles different authentication methods
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('notarize.js script validation', () => {
  const notarizeScriptPath = path.join(__dirname, '../scripts/notarize.js');
  let notarizeScript: string;

  it('should exist', () => {
    expect(fs.existsSync(notarizeScriptPath)).toBe(true);
    notarizeScript = fs.readFileSync(notarizeScriptPath, 'utf8');
  });

  it('should have valid JavaScript syntax', () => {
    notarizeScript = fs.readFileSync(notarizeScriptPath, 'utf8');
    
    // This will throw if syntax is invalid
    expect(() => {
      new Function(notarizeScript);
    }).not.toThrow();
  });

  it('should export a default function', () => {
    notarizeScript = fs.readFileSync(notarizeScriptPath, 'utf8');
    expect(notarizeScript).toContain('exports.default');
    expect(notarizeScript).toContain('async function');
  });

  it('should check for App Store Connect API Key credentials', () => {
    notarizeScript = fs.readFileSync(notarizeScriptPath, 'utf8');
    
    // Should check for all required API key environment variables
    expect(notarizeScript).toContain('APPLE_API_KEY_ID');
    expect(notarizeScript).toContain('APPLE_API_KEY_ISSUER_ID');
    expect(notarizeScript).toContain('APPLE_API_KEY_PRIVATE_BASE64');
    expect(notarizeScript).toContain('APPLE_API_KEY_PATH');
  });

  it('should check for Apple ID credentials', () => {
    notarizeScript = fs.readFileSync(notarizeScriptPath, 'utf8');
    
    // Should check for Apple ID authentication method
    expect(notarizeScript).toContain('APPLE_ID');
    expect(notarizeScript).toContain('APPLE_APP_SPECIFIC_PASSWORD');
    expect(notarizeScript).toContain('APPLE_TEAM_ID');
  });

  it('should have clear guidance messages for both authentication methods', () => {
    notarizeScript = fs.readFileSync(notarizeScriptPath, 'utf8');
    
    // Should clearly distinguish between two methods
    expect(notarizeScript).toContain('Method 1');
    expect(notarizeScript).toContain('Method 2');
    expect(notarizeScript).toContain('App Store Connect API Key');
    expect(notarizeScript).toContain('Apple ID with App-Specific Password');
    
    // Should have helpful links
    expect(notarizeScript).toContain('https://developer.apple.com');
    expect(notarizeScript).toContain('https://support.apple.com');
  });

  it('should read .p8 file contents explicitly', () => {
    notarizeScript = fs.readFileSync(notarizeScriptPath, 'utf8');
    
    // Should read file contents, not just pass file path
    expect(notarizeScript).toContain('fs.readFileSync');
    expect(notarizeScript).toContain('Buffer.from');
    expect(notarizeScript).toContain('base64');
    
    // Should handle both base64 and file path methods
    expect(notarizeScript).toContain('APPLE_API_KEY_PRIVATE_BASE64');
    expect(notarizeScript).toContain('APPLE_API_KEY_PATH');
  });

  it('should have unified try/catch block for error handling', () => {
    notarizeScript = fs.readFileSync(notarizeScriptPath, 'utf8');
    
    // Should wrap notarization in try/catch
    expect(notarizeScript).toContain('try {');
    expect(notarizeScript).toContain('} catch (error) {');
    
    // Should have troubleshooting guidance
    expect(notarizeScript).toContain('Troubleshooting tips:');
    expect(notarizeScript).toContain('throw error');
  });

  it('should distinguish between authentication methods with separate checks', () => {
    notarizeScript = fs.readFileSync(notarizeScriptPath, 'utf8');
    
    // Should have separate variables for checking each method
    expect(notarizeScript).toContain('hasApiKey');
    expect(notarizeScript).toContain('hasAppleId');
    
    // Should check each method independently
    expect(notarizeScript).toMatch(/const hasApiKey.*APPLE_API_KEY_ID.*APPLE_API_KEY_ISSUER_ID/s);
    expect(notarizeScript).toMatch(/const hasAppleId.*APPLE_ID.*APPLE_APP_SPECIFIC_PASSWORD.*APPLE_TEAM_ID/s);
  });

  it('should use emoji icons for better readability', () => {
    notarizeScript = fs.readFileSync(notarizeScriptPath, 'utf8');
    
    // Should use visual indicators
    expect(notarizeScript).toContain('⚠️');
    expect(notarizeScript).toContain('🔐');
    expect(notarizeScript).toContain('✅');
    expect(notarizeScript).toContain('❌');
  });

  it('should handle both authentication methods in notarize options', () => {
    notarizeScript = fs.readFileSync(notarizeScriptPath, 'utf8');
    
    // Should have conditional logic for API key method
    expect(notarizeScript).toContain('if (hasApiKey)');
    expect(notarizeScript).toContain('appleApiKey');
    expect(notarizeScript).toContain('appleApiKeyId');
    expect(notarizeScript).toContain('appleApiIssuer');
    
    // Should have conditional logic for Apple ID method
    expect(notarizeScript).toContain('else if (hasAppleId)');
    expect(notarizeScript).toContain('appleId');
    expect(notarizeScript).toContain('appleIdPassword');
    expect(notarizeScript).toContain('teamId');
  });

  it('should pass key contents not file path to notarize', () => {
    notarizeScript = fs.readFileSync(notarizeScriptPath, 'utf8');
    
    // Should assign the key content to a variable then pass to options
    expect(notarizeScript).toContain('let appleApiKey');
    expect(notarizeScript).toContain('notarizeOptions.appleApiKey = appleApiKey');
    
    // Should NOT pass the file path directly
    expect(notarizeScript).not.toContain('appleApiKey: process.env.APPLE_API_KEY_PATH');
  });
});
