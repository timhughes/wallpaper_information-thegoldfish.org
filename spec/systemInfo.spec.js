/*
 * spec/systemInfo.spec.js
 * Unit tests for system information logic
 */

import * as SystemInfo from '../lib/systemInfo.js';

describe('System Information Logic', function() {
    
    describe('getOSReleaseInfo', function() {
        it('should return an object with expected keys', async function() {
            const info = await SystemInfo.getOSReleaseInfo();
            expect(info.name).toBeDefined();
            expect(info.version).toBeDefined();
            expect(info.pretty_name).toBeDefined();
        });
        
        it('should have fallbacks for missing data', async function() {
            // This assumes we are running on a Linux system with /etc/os-release
            // but the function handles errors gracefully
            const info = await SystemInfo.getOSReleaseInfo();
            expect(typeof info.name).toBe('string');
        });
    });

    describe('getSystemInfo', function() {
        it('should compile system information', async function() {
            const info = await SystemInfo.getSystemInfo();
            expect(info.hostname).toBeDefined();
            expect(Array.isArray(info.ipaddress)).toBe(true);
        });

        it('should handle cached OS release info', async function() {
            const mockOsRelease = {
                name: 'MockOS',
                version: '1.0',
                pretty_name: 'Mock OS 1.0',
                logo: 'mock-logo'
            };
            const info = await SystemInfo.getSystemInfo(mockOsRelease);
            expect(info.distro_name).toBe('MockOS');
            expect(info.distro_logo).toBe('mock-logo');
        });
    });

    describe('getNetworkInfo', function() {
        it('should return an array of IP addresses', async function() {
            const ips = await SystemInfo.getNetworkInfo();
            expect(Array.isArray(ips)).toBe(true);
        });
    });
});
