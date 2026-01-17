/**
 * Validation for package.json build configuration
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('package.json build configuration', () => {
  const packageJsonPath = path.join(__dirname, '../package.json');
  let packageJson: any;

  it('should exist and be valid JSON', () => {
    expect(fs.existsSync(packageJsonPath)).toBe(true);
    const content = fs.readFileSync(packageJsonPath, 'utf8');
    expect(() => {
      packageJson = JSON.parse(content);
    }).not.toThrow();
  });

  it('should have build configuration', () => {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    expect(packageJson.build).toBeDefined();
  });

  it('should have mac build configuration', () => {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    expect(packageJson.build.mac).toBeDefined();
  });

  it('should include .zip target for portable users', () => {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    const macTargets = packageJson.build.mac.target;
    expect(Array.isArray(macTargets)).toBe(true);
    expect(macTargets).toContain('zip');
  });

  it('should include .dmg and .pkg targets', () => {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    const macTargets = packageJson.build.mac.target;
    expect(macTargets).toContain('dmg');
    expect(macTargets).toContain('pkg');
  });

  it('should use ${productName} in artifactName for consistency', () => {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    const artifactName = packageJson.build.mac.artifactName;
    expect(artifactName).toBeDefined();
    
    // Should use ${productName} variable instead of hardcoded name
    expect(artifactName).toContain('${productName}');
    
    // Should NOT use hardcoded "SYNC.Desktop"
    expect(artifactName).not.toContain('SYNC.Desktop');
  });

  it('should use standardized artifact naming format', () => {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    const artifactName = packageJson.build.mac.artifactName;
    
    // Should follow the pattern: ${productName}-${version}-${arch}.${ext}
    expect(artifactName).toBe('${productName}-${version}-${arch}.${ext}');
  });

  it('should have afterSign hook pointing to notarize script', () => {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    expect(packageJson.build.afterSign).toBe('scripts/notarize.js');
  });
});
