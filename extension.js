/*
 * extension.js
 * Copyright (C) 2019 Tim Hughes <thughes@thegoldfish.org>
 *
 * Distributed under terms of the MIT license.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let infobox;
let timeoutId;
let nmProxy;
let nmSignalId;

// Get system information using native APIs
function getSystemInfo() {
    let info = {};
    
    // Hostname
    info.hostname = GLib.get_host_name();
    
    // Boot time (instead of uptime)
    try {
        let [ok, contents] = GLib.file_get_contents('/proc/uptime');
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
        let [ok, contents] = GLib.file_get_contents('/proc/version');
        if (ok) {
            let version = new TextDecoder().decode(contents);
            let match = version.match(/Linux version ([^\s]+)/);
            info.kernelversion = match ? match[1] : 'N/A';
        }
    } catch (e) {
        info.kernelversion = 'N/A';
    }
    
    // IP addresses from NetworkManager via DBus
    info.ipaddress = getNetworkInfo();
    
    // DMI chassis asset tag
    try {
        let [ok, contents] = GLib.file_get_contents('/sys/class/dmi/id/chassis_asset_tag');
        if (ok) {
            info.chassis_asset_tag = new TextDecoder().decode(contents).trim();
        }
    } catch (e) {
        info.chassis_asset_tag = 'N/A';
    }
    
    return info;
}

// Get network information
function getNetworkInfo() {
    let ips = [];
    
    try {
        // Read network interfaces from /proc/net/fib_trie or use ip command
        let [ok, stdout, stderr, exitStatus] = GLib.spawn_command_line_sync('hostname -I');
        if (ok && exitStatus === 0) {
            let output = new TextDecoder().decode(stdout).trim();
            if (output) {
                ips = output.split(' ').filter(ip => ip.length > 0);
            }
        }
    } catch (e) {
        // Fallback: try to read from network interfaces
        try {
            let [ok, contents] = GLib.file_get_contents('/proc/net/fib_trie');
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
        } catch (e2) {
            // Silent fallback
        }
    }
    
    return ips.length > 0 ? ips.join(', ') : 'N/A';
}

// Format system information for display
function formatSystemInfo(info) {
    let lines = [];
    lines.push(`Hostname: ${info.hostname}`);
    lines.push(`Boot Time: ${info.boot_time}`);
    lines.push(`IP Address: ${info.ipaddress}`);
    lines.push(`Kernel: ${info.kernelversion}`);
    if (info.chassis_asset_tag && info.chassis_asset_tag !== 'N/A') {
        lines.push(`Asset Tag: ${info.chassis_asset_tag}`);
    }
    return lines.join('\n');
}

// Update the infobox with current system information
function updateInfobox() {
    if (infobox) {
        let info = getSystemInfo();
        infobox.text = formatSystemInfo(info);
    }
    return GLib.SOURCE_CONTINUE;
}

// Initialize NetworkManager DBus proxy for network change notifications
function initNetworkMonitoring() {
    try {
        nmProxy = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SYSTEM,
            Gio.DBusProxyFlags.NONE,
            null,
            'org.freedesktop.NetworkManager',
            '/org/freedesktop/NetworkManager',
            'org.freedesktop.NetworkManager',
            null
        );
        
        // Listen for state changes
        nmSignalId = nmProxy.connect('g-properties-changed', () => {
            // Network state changed, update the display
            updateInfobox();
        });
    } catch (e) {
        logError(e, 'Failed to initialize NetworkManager monitoring');
    }
}

// Clean up NetworkManager monitoring
function cleanupNetworkMonitoring() {
    if (nmSignalId && nmProxy) {
        nmProxy.disconnect(nmSignalId);
        nmSignalId = null;
    }
    nmProxy = null;
}

function createInfobox() {
    let monitor = Main.layoutManager.primaryMonitor;

    if (!infobox) {
        infobox = new St.Label({ style_class: 'infobox-label', text: '' });
    }

    // Initial update
    updateInfobox();

    infobox.set_position(monitor.x + Math.floor(48),
                      monitor.y + Math.floor(64));

    // Add to background group to appear behind windows but on top of wallpaper
    // Note: _backgroundGroup is an internal API but is the standard way to add desktop overlays
    Main.layoutManager._backgroundGroup.add_child(infobox);
    
    // Initialize network monitoring for event-based updates
    initNetworkMonitoring();
    
    // Still poll periodically for boot time and other info (every 30 seconds instead of 1)
    timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, updateInfobox);
}

export function init() {
    // Extension initialization
}

export function enable() {
    createInfobox();
}

export function disable() {
    if (timeoutId) {
        GLib.Source.remove(timeoutId);
        timeoutId = null;
    }
    
    cleanupNetworkMonitoring();
    
    if (infobox) {
        Main.layoutManager._backgroundGroup.remove_child(infobox);
        infobox.destroy();
        infobox = null;
    }
}
