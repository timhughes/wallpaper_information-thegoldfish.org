/*
 * lib/systemInfo.js
 * Copyright (C) 2026 Tim Hughes <thughes@thegoldfish.org>
 *
 * Distributed under terms of the MIT license.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.DBusConnection.prototype, 'call', 'call_finish');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');

// Helper to read file asynchronously
async function readFileAsync(path, cancellable = null) {
    const file = Gio.File.new_for_path(path);
    try {
        const [contents] = await file.load_contents_async(cancellable);
        return [true, contents];
    } catch (e) {
        return [false, null];
    }
}

// Parse /etc/os-release file
export async function getOSReleaseInfo(cancellable = null) {
    let osInfo = {
        name: 'N/A',
        version: 'N/A',
        pretty_name: 'N/A',
        logo: null,
        id: null
    };
    
    try {
        let [ok, contents] = await readFileAsync('/etc/os-release', cancellable);
        if (ok) {
            let lines = new TextDecoder().decode(contents).split('\n');
            for (let line of lines) {
                line = line.trim();
                if (!line || line.startsWith('#')) continue;
                
                // Parse KEY=VALUE or KEY="VALUE" format
                let match = line.match(/^([A-Z_]+)=(.+)$/);
                if (match) {
                    let key = match[1];
                    let value = match[2];
                    
                    // Remove quotes if present
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    
                    if (key === 'NAME') {
                        osInfo.name = value;
                    } else if (key === 'VERSION') {
                        osInfo.version = value;
                    } else if (key === 'PRETTY_NAME') {
                        osInfo.pretty_name = value;
                    } else if (key === 'LOGO') {
                        osInfo.logo = value;
                    } else if (key === 'ID' && !osInfo.logo) {
                        osInfo.id = value;
                    }
                }
            }
            
            // Fallback logo to ID if LOGO is not present
            if (!osInfo.logo && osInfo.id) {
                osInfo.logo = osInfo.id;
            }
        }
    } catch (e) {
        console.error(`Failed to read /etc/os-release: ${e.message}`);
    }
    
    return osInfo;
}

// Get system information using native APIs
export async function getSystemInfo(osReleaseInfo = null, cancellable = null) {
    let info = {};
    
    // OS Release information (use cached value if provided, otherwise parse)
    let osRelease = osReleaseInfo || await getOSReleaseInfo(cancellable);
    info.distro_name = osRelease.name;
    info.distro_version = osRelease.version;
    info.distro_pretty_name = osRelease.pretty_name;
    info.distro_logo = osRelease.logo;
    
    // Hostname
    info.hostname = GLib.get_host_name();
    
    // Boot time (instead of uptime)
    try {
        let [ok, contents] = await readFileAsync('/proc/uptime', cancellable);
        if (ok) {
            let uptimeSeconds = parseFloat(new TextDecoder().decode(contents).split(' ')[0]);
            let bootTime = new Date(Date.now() - uptimeSeconds * 1000);
            info.boot_time = bootTime.toLocaleString();
        }
    } catch (e) {
        info.boot_time = 'N/A';
    }
    
    // Kernel version
    try {
        let [ok, contents] = await readFileAsync('/proc/version', cancellable);
        if (ok) {
            let version = new TextDecoder().decode(contents);
            let match = version.match(/Linux version ([^\s]+)/);
            info.kernelversion = match ? match[1] : 'N/A';
        }
    } catch (e) {
        info.kernelversion = 'N/A';
    }
    
    // IP addresses from NetworkManager via DBus
    info.ipaddress = await getNetworkInfo(cancellable);
    if (cancellable?.is_cancelled())
        return info;
    
    // DMI/DBus system information
    try {
        const bus = Gio.DBus.system;
        let props = {};

        // Try Describe() first (available in systemd >= 253)
        try {
            const describeResult = await bus.call(
                'org.freedesktop.hostname1',
                '/org/freedesktop/hostname1',
                'org.freedesktop.hostname1',
                'Describe',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                cancellable
            );
            if (describeResult) {
                const [jsonStr] = describeResult.deep_unpack();
                props = JSON.parse(jsonStr);
            }
        } catch (e) {
            if (cancellable?.is_cancelled())
                throw e;
            // Fallback to GetAll
            const result = await bus.call(
                'org.freedesktop.hostname1',
                '/org/freedesktop/hostname1',
                'org.freedesktop.DBus.Properties',
                'GetAll',
                new GLib.Variant('(s)', ['org.freedesktop.hostname1']),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                cancellable
            );
            const [rawProps] = result.deep_unpack();
            for (let key in rawProps) {
                props[key] = rawProps[key].unpack();
            }
        }
        
        info.hardware_vendor = props.HardwareVendor || 'N/A';
        info.hardware_model = props.HardwareModel || 'N/A';
        info.firmware_version = props.FirmwareVersion || 'N/A';
        info.chassis_asset_tag = props.ChassisAssetTag || 'N/A';
        
        if (props.HardwareSerial) {
            info.product_serial = props.HardwareSerial;
        }

        if (props.KernelRelease) {
            info.kernelversion = props.KernelRelease;
        }

        if (props.PrettyHostname || props.StaticHostname) {
            info.hostname = props.PrettyHostname || props.StaticHostname;
        }

        if (props.OperatingSystemPrettyName) {
            info.distro_pretty_name = props.OperatingSystemPrettyName;
        }
        
        // OS Support Info
        if (props.OperatingSystemSupportEnd) {
            // Convert microseconds to milliseconds
            const supportEndMs = Number(props.OperatingSystemSupportEnd) / 1000;
            const endDate = new Date(supportEndMs);
            info.os_support_end = endDate.toLocaleDateString();
            
            const now = Date.now();
            const diffMs = supportEndMs - now;
            
            if (diffMs > 0) {
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const years = Math.floor(diffDays / 365);
                const months = Math.floor((diffDays % 365) / 30);
                const days = diffDays % 30;
                
                let remaining = [];
                if (years > 0) remaining.push(`${years}y`);
                if (months > 0) remaining.push(`${months}m`);
                if (days > 0 || remaining.length === 0) remaining.push(`${days}d`);
                
                info.os_support_remaining = remaining.join(' ');
            } else {
                info.os_support_remaining = 'Ended';
            }
        } else {
            info.os_support_end = 'N/A';
            info.os_support_remaining = 'N/A';
        }
    } catch (e) {
        if (cancellable?.is_cancelled())
            return info;
        // Fallback to DMI files if DBus fails
        let [okTag, assetTag] = await readFileAsync('/sys/class/dmi/id/chassis_asset_tag', cancellable);
        info.chassis_asset_tag = okTag ? new TextDecoder().decode(assetTag).trim() : 'N/A';

        let [okVendor, vendor] = await readFileAsync('/sys/class/dmi/id/sys_vendor', cancellable);
        info.hardware_vendor = okVendor ? new TextDecoder().decode(vendor).trim() : 'N/A';

        let [okModel, model] = await readFileAsync('/sys/class/dmi/id/product_name', cancellable);
        info.hardware_model = okModel ? new TextDecoder().decode(model).trim() : 'N/A';

        info.firmware_version = 'N/A';
        info.os_support_end = 'N/A';
        info.os_support_remaining = 'N/A';
    }

    // DMI product serial (fallback if not already set from DBus)
    if (!info.product_serial || info.product_serial === 'N/A') {
        let [ok, contents] = await readFileAsync('/sys/class/dmi/id/product_serial', cancellable);
        if (ok) {
            info.product_serial = new TextDecoder().decode(contents).trim();
        } else {
            info.product_serial = 'N/A';
        }
    }
    
    return info;
}

// Get network information
export async function getNetworkInfo(cancellable = null) {
    let ips = [];
    
    try {
        const proc = new Gio.Subprocess({
            argv: ['hostname', '-I'],
            flags: Gio.SubprocessFlags.STDOUT_PIPE,
        });
        proc.init(cancellable);
        const [stdout] = await proc.communicate_utf8_async(null, cancellable);
        if (stdout) {
            ips = stdout.trim().split(' ').filter(ip => ip.length > 0);
        }
    } catch (e) {
        if (cancellable?.is_cancelled())
            return ips;
        // Fallback: try to read from network interfaces
        let [ok, contents] = await readFileAsync('/proc/net/fib_trie', cancellable);
        if (ok) {
            let lines = new TextDecoder().decode(contents).split('\n');
            for (let line of lines) {
                let match = line.match(/\|--\s+(\d+\.\d+\.\d+\.\d+)/);
                if (match && !match[1].startsWith('127.') && !match[1].startsWith('0.')) {
                    if (!ips.includes(match[1])) {
                        ips.push(match[1]);
                    }
                }
            }
        }
    }
    
    return ips;
}
