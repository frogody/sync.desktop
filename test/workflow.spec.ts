/**
 * Validation script for build-macos.yml workflow file
 * Checks for proper formatting and secret checking logic
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

describe('build-macos.yml workflow validation', () => {
  const workflowPath = path.join(__dirname, '../.github/workflows/build-macos.yml');
  let workflowContent: string;
  let workflowYaml: any;

  it('should exist', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    workflowContent = fs.readFileSync(workflowPath, 'utf8');
  });

  it('should be valid YAML', () => {
    workflowContent = fs.readFileSync(workflowPath, 'utf8');
    expect(() => {
      workflowYaml = yaml.parse(workflowContent);
    }).not.toThrow();
  });

  it('should have properly formatted conditional steps', () => {
    workflowContent = fs.readFileSync(workflowPath, 'utf8');
    
    // Should not have 'if:' and 'run:' on same line (YAML syntax error)
    expect(workflowContent).not.toMatch(/if:.*run:/);
    
    // 'if' should be on its own line with proper indentation
    expect(workflowContent).toMatch(/^\s+if: /m);
    expect(workflowContent).toMatch(/^\s+run: /m);
  });

  it('should check for APPLE_P12_BASE64 secret in signing step', () => {
    workflowContent = fs.readFileSync(workflowPath, 'utf8');
    
    // Should check if APPLE_P12_BASE64 exists
    expect(workflowContent).toContain("secrets.APPLE_P12_BASE64 != ''");
  });

  it('should check all three API key secrets in API key reconstruction step', () => {
    workflowContent = fs.readFileSync(workflowPath, 'utf8');
    
    // Find the "Reconstruct App Store Connect API key" step
    const apiKeyStepMatch = workflowContent.match(
      /- name: Reconstruct App Store Connect API key[\s\S]*?(?=- name:|$)/
    );
    
    expect(apiKeyStepMatch).toBeTruthy();
    
    if (apiKeyStepMatch) {
      const stepContent = apiKeyStepMatch[0];
      
      // Should check all three required secrets
      expect(stepContent).toContain('APPLE_API_KEY_ID');
      expect(stepContent).toContain('APPLE_API_KEY_ISSUER_ID');
      expect(stepContent).toContain('APPLE_API_KEY_PRIVATE_BASE64');
      
      // Should use && to check all three
      expect(stepContent).toMatch(/APPLE_API_KEY_ID.*&&.*APPLE_API_KEY_ISSUER_ID.*&&.*APPLE_API_KEY_PRIVATE_BASE64/s);
    }
  });

  it('should check all three API key secrets in notarize step', () => {
    workflowContent = fs.readFileSync(workflowPath, 'utf8');
    
    // Find the "Notarize macOS artifacts" step
    const notarizeStepMatch = workflowContent.match(
      /- name: Notarize macOS artifacts[\s\S]*?(?=- name:|$)/
    );
    
    expect(notarizeStepMatch).toBeTruthy();
    
    if (notarizeStepMatch) {
      const stepContent = notarizeStepMatch[0];
      
      // Should check all three required secrets
      expect(stepContent).toContain('APPLE_API_KEY_ID');
      expect(stepContent).toContain('APPLE_API_KEY_ISSUER_ID');
      expect(stepContent).toContain('APPLE_API_KEY_PRIVATE_BASE64');
      
      // Should use && to check all three
      expect(stepContent).toMatch(/APPLE_API_KEY_ID.*&&.*APPLE_API_KEY_ISSUER_ID.*&&.*APPLE_API_KEY_PRIVATE_BASE64/s);
    }
  });

  it('should set APPLE_API_KEY_PATH environment variable in API key reconstruction step', () => {
    workflowContent = fs.readFileSync(workflowPath, 'utf8');
    
    // Should decode base64 and write to temp file, then export to env
    expect(workflowContent).toContain('APPLE_API_KEY_PATH=');
    expect(workflowContent).toContain('GITHUB_ENV');
  });

  it('should pass required env vars to notarize step', () => {
    workflowContent = fs.readFileSync(workflowPath, 'utf8');
    
    // Find the notarize step
    const notarizeStepMatch = workflowContent.match(
      /- name: Notarize macOS artifacts[\s\S]*?(?=\n\s+- name:|$)/
    );
    
    expect(notarizeStepMatch).toBeTruthy();
    
    if (notarizeStepMatch) {
      const stepContent = notarizeStepMatch[0];
      
      // Should have env section with API key variables
      expect(stepContent).toContain('env:');
      expect(stepContent).toContain('APPLE_API_KEY_ID:');
      expect(stepContent).toContain('APPLE_API_KEY_ISSUER_ID:');
    }
  });
});
