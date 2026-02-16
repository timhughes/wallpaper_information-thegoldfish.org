/*
 * extension.js
 * Copyright (C) 2019 Tim Hughes <thughes@thegoldfish.org>
 *
 * Distributed under terms of the MIT license.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Constants
const FALLBACK_WIDTH = 200;  // Fallback width if dimension calculation fails
const FALLBACK_HEIGHT = 100;  // Fallback height if dimension calculation fails
const POSITION_MARGIN = 48;  // Margin from screen edges

// Parse /etc/os-release file
function getOSReleaseInfo() {
    let osInfo = {
        name: 'N/A',
        version: 'N/A',
        pretty_name: 'N/A',
        logo: null,
        id: null
    };
    
    try {
        let [ok, contents] = GLib.file_get_contents('/etc/os-release');
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
        logError(e, 'Failed to read /etc/os-release');
    }
    
    return osInfo;
}

// Get system information using native APIs
function getSystemInfo(osReleaseInfo = null) {
    let info = {};
    
    // OS Release information (use cached value if provided, otherwise parse)
    let osRelease = osReleaseInfo || getOSReleaseInfo();
    info.distro_name = osRelease.name;
    info.distro_version = osRelease.version;
    info.distro_pretty_name = osRelease.pretty_name;
    info.distro_logo = osRelease.logo;
    
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
    
    // DMI/DBus system information
    try {
        const bus = Gio.DBus.system;
        let props = {};

        // Try Describe() first (available in systemd >= 253)
        try {
            const describeResult = bus.call_sync(
                'org.freedesktop.hostname1',
                '/org/freedesktop/hostname1',
                'org.freedesktop.hostname1',
                'Describe',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
            if (describeResult) {
                const [jsonStr] = describeResult.deep_unpack();
                props = JSON.parse(jsonStr);
            }
        } catch (e) {
            // Fallback to GetAll
            const result = bus.call_sync(
                'org.freedesktop.hostname1',
                '/org/freedesktop/hostname1',
                'org.freedesktop.DBus.Properties',
                'GetAll',
                new GLib.Variant('(s)', ['org.freedesktop.hostname1']),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null
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
        // Fallback to DMI files if DBus fails
        try {
            let [ok, contents] = GLib.file_get_contents('/sys/class/dmi/id/chassis_asset_tag');
            info.chassis_asset_tag = ok ? new TextDecoder().decode(contents).trim() : 'N/A';
        } catch (e2) {
            info.chassis_asset_tag = 'N/A';
        }

        try {
            let [ok, contents] = GLib.file_get_contents('/sys/class/dmi/id/sys_vendor');
            info.hardware_vendor = ok ? new TextDecoder().decode(contents).trim() : 'N/A';
        } catch (e2) {
            info.hardware_vendor = 'N/A';
        }

        try {
            let [ok, contents] = GLib.file_get_contents('/sys/class/dmi/id/product_name');
            info.hardware_model = ok ? new TextDecoder().decode(contents).trim() : 'N/A';
        } catch (e2) {
            info.hardware_model = 'N/A';
        }

        info.firmware_version = 'N/A';
        info.os_support_end = 'N/A';
        info.os_support_remaining = 'N/A';
    }

    // DMI product serial (fallback if not already set from DBus)
    if (!info.product_serial || info.product_serial === 'N/A') {
        try {
            let [ok, contents] = GLib.file_get_contents('/sys/class/dmi/id/product_serial');
            if (ok) {
                info.product_serial = new TextDecoder().decode(contents).trim();
            }
        } catch (e) {
            info.product_serial = 'N/A';
        }
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
    
    return ips;
}

// Information item definition
class InfoItem {
    constructor(key, label, getValue) {
        this.key = key;
        this.label = label;
        this.getValue = getValue;
        this.container = null;
    }
    
    createContainer(settings) {
        this.container = new St.BoxLayout({
            style_class: 'info-row',
            vertical: false
        });

        this._labelWidget = new St.Label({
            text: `${this.label}:`,
            style_class: 'info-label',
            y_align: Clutter.ActorAlign.START
        });
        
        this._valuesContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'info-values-container',
            y_align: Clutter.ActorAlign.START
        });

        this.container.add_child(this._labelWidget);
        this.container.add_child(this._valuesContainer);

        return this.container;
    }
    
    update(info) {
        if (this.container) {
            const value = this.getValue(info);
            
            // Remove old values
            this._valuesContainer.get_children().forEach(c => c.destroy());
            
            if (Array.isArray(value)) {
                if (value.length > 0) {
                    value.forEach(v => {
                        let label = new St.Label({
                            text: v,
                            style_class: 'info-value'
                        });
                        this._valuesContainer.add_child(label);
                    });
                } else {
                    let label = new St.Label({
                        text: 'N/A',
                        style_class: 'info-value'
                    });
                    this._valuesContainer.add_child(label);
                }
            } else {
                let label = new St.Label({
                    text: (value !== null && value !== undefined) ? String(value) : 'N/A',
                    style_class: 'info-value'
                });
                this._valuesContainer.add_child(label);
            }
        }
    }

    getLabelPreferredWidth() {
        if (this._labelWidget) {
            let [minWidth, naturalWidth] = this._labelWidget.get_preferred_width(-1);
            return naturalWidth;
        }
        return 0;
    }

    setLabelWidth(width) {
        if (this._labelWidget) {
            this._labelWidget.width = width;
        }
    }
    
    setVisible(visible) {
        if (this.container) {
            this.container.visible = visible;
        }
    }
}

export default class WallpaperInfoExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._mainContainer = null;
        this._logoContainer = null;
        this._osReleaseInfo = null;  // Cache OS release info
        this._timeoutId = null;
        this._nmProxy = null;
        this._nmSignalId = null;
        this._settings = null;
        this._settingsSignals = [];
        this._infoItems = [];
        
        // Visibility map - single source of truth for item key to settings key mapping
        this._visibilityMap = {
            'distro-name': 'show-distro-name',
            'distro-version': 'show-distro-version',
            'hostname': 'show-hostname',
            'boot-time': 'show-boot-time',
            'kernel': 'show-kernel',
            'asset-tag': 'show-asset-tag',
            'serial-number': 'show-serial-number',
            'hardware-vendor': 'show-hardware-vendor',
            'hardware-model': 'show-hardware-model',
            'firmware-version': 'show-firmware-version',
            'os-support-end': 'show-os-support-end',
            'os-support-remaining': 'show-os-support-remaining',
            'ip-address': 'show-ip-address'
        };
    }
    
    // Create information items
    _createInfoItems() {
        return [
            new InfoItem('distro-name', 'Distribution', (info) => info.distro_pretty_name || info.distro_name),
            new InfoItem('distro-version', 'Version', (info) => info.distro_version),
            new InfoItem('hostname', 'Hostname', (info) => info.hostname),
            new InfoItem('boot-time', 'Boot Time', (info) => info.boot_time),
            new InfoItem('kernel', 'Kernel', (info) => info.kernelversion),
            new InfoItem('hardware-vendor', 'Hardware Vendor', (info) => info.hardware_vendor),
            new InfoItem('hardware-model', 'Hardware Model', (info) => info.hardware_model),
            new InfoItem('firmware-version', 'Firmware Version', (info) => info.firmware_version),
            new InfoItem('os-support-end', 'OS Support End', (info) => info.os_support_end),
            new InfoItem('os-support-remaining', 'OS Support Remaining', (info) => info.os_support_remaining),
            new InfoItem('asset-tag', 'Asset Tag', (info) => info.chassis_asset_tag),
            new InfoItem('serial-number', 'Serial Number', (info) => info.product_serial),
            new InfoItem('ip-address', 'IP Address', (info) => info.ipaddress)
        ];
    }

    // Initialize NetworkManager DBus proxy for network change notifications
    _initNetworkMonitoring() {
        try {
            this._nmProxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SYSTEM,
                Gio.DBusProxyFlags.NONE,
                null,
                'org.freedesktop.NetworkManager',
                '/org/freedesktop/NetworkManager',
                'org.freedesktop.NetworkManager',
                null
            );
            
            // Listen for state changes
            this._nmSignalId = this._nmProxy.connect('g-properties-changed', () => {
                // Network state changed, update the display
                this._updateInfobox();
            });
        } catch (e) {
            logError(e, 'Failed to initialize NetworkManager monitoring');
        }
    }

    // Clean up NetworkManager monitoring
    _cleanupNetworkMonitoring() {
        if (this._nmSignalId && this._nmProxy) {
            this._nmProxy.disconnect(this._nmSignalId);
            this._nmSignalId = null;
        }
        this._nmProxy = null;
    }

    // Update the infobox with current system information
    _updateInfobox() {
        if (this._mainContainer) {
            // Pass cached OS release info to avoid redundant file I/O
            let info = getSystemInfo(this._osReleaseInfo);
            
            // Update each information item
            this._infoItems.forEach(item => {
                item.update(info);
            });
            
            // Update logo
            this._updateLogo();
        }
        return GLib.SOURCE_CONTINUE;
    }
    
    // Calculate position based on settings
    _calculatePosition(monitor) {
        const verticalPos = this._settings.get_string('position-vertical');
        const horizontalPos = this._settings.get_string('position-horizontal');
        
        let x, y;
        
        // Get actual dimensions, considering preferred size if layout not complete
        let width = this._mainContainer.width;
        let height = this._mainContainer.height;
        
        // If width/height are 0, get preferred size
        if (width === 0 || height === 0) {
            let [minWidth, naturalWidth] = this._mainContainer.get_preferred_width(-1);
            let [minHeight, naturalHeight] = this._mainContainer.get_preferred_height(-1);
            width = naturalWidth || minWidth || FALLBACK_WIDTH;
            height = naturalHeight || minHeight || FALLBACK_HEIGHT;
        }
        
        // Calculate X position
        if (horizontalPos === 'left') {
            x = monitor.x + POSITION_MARGIN;
        } else if (horizontalPos === 'center') {
            x = monitor.x + Math.floor((monitor.width - width) / 2);
        } else { // right
            x = monitor.x + monitor.width - width - POSITION_MARGIN;
        }
        
        // Calculate Y position
        if (verticalPos === 'top') {
            y = monitor.y + POSITION_MARGIN;
        } else if (verticalPos === 'middle') {
            y = monitor.y + Math.floor((monitor.height - height) / 2);
        } else { // bottom
            y = monitor.y + monitor.height - height - POSITION_MARGIN;
        }
        
        return [x, y];
    }
    
    // Update position
    _updatePosition() {
        if (this._mainContainer) {
            let monitor = Main.layoutManager.primaryMonitor;
            let [x, y] = this._calculatePosition(monitor);
            this._mainContainer.set_position(x, y);
        }
    }
    
    // Apply styling from settings
    _applyStyles() {
        if (!this._mainContainer) return;
        
        const fontFamily = this._settings.get_string('font-family');
        const fontSize = this._settings.get_int('font-size');
        const fontColor = this._settings.get_string('font-color');
        const bgColor = this._settings.get_string('background-color');
        const borderRadius = this._settings.get_int('border-radius');
        const padding = this._settings.get_int('padding');
        
        const style = `
            font-family: ${fontFamily};
            font-size: ${fontSize}px;
            font-weight: bold;
            color: ${fontColor};
            background-color: ${bgColor};
            border-radius: ${borderRadius}px;
            padding: ${padding}px;
        `;
        
        this._mainContainer.set_style(style);
    }
    
    // Update logo display
    _updateLogo() {
        const showLogo = this._settings.get_boolean('show-logo');
        const logoPath = this._settings.get_string('logo-path');
        const logoSize = this._settings.get_int('logo-size');
        const logoBorderRadius = this._settings.get_int('logo-border-radius');
        const logoAlignment = this._settings.get_string('logo-alignment');
        
        // Remove existing logo if present
        if (this._logoContainer) {
            this._logoContainer.destroy();
            this._logoContainer = null;
        }
        
        if (!showLogo) return;

        let align = Clutter.ActorAlign.START;
        if (logoAlignment === 'center') {
            align = Clutter.ActorAlign.CENTER;
        } else if (logoAlignment === 'right') {
            align = Clutter.ActorAlign.END;
        }

        let icon = null;

        // Try custom logo first
        if (logoPath && logoPath.length > 0) {
            try {
                const file = Gio.File.new_for_path(logoPath);
                if (file.query_exists(null)) {
                    icon = new St.Icon({
                        gicon: Gio.icon_new_for_string(logoPath),
                        icon_size: logoSize
                    });
                }
            } catch (e) {
                logError(e, 'Failed to load custom logo');
            }
        }

        // Fallback to distro logo if no custom logo was loaded
        if (!icon) {
            if (!this._osReleaseInfo) {
                this._osReleaseInfo = getOSReleaseInfo();
            }
            
            if (this._osReleaseInfo.logo) {
                try {
                    icon = new St.Icon({
                        icon_name: this._osReleaseInfo.logo,
                        icon_size: logoSize,
                        fallback_icon_name: 'start-here-symbolic'
                    });
                } catch (e) {
                    logError(e, 'Failed to load distro logo');
                }
            }
        }

        if (icon) {
            let finalWidget = icon;
            if (logoBorderRadius > 0) {
                // Wrap in a Bin to ensure clipping works as expected
                finalWidget = new St.Bin({
                    child: icon,
                    style: `border-radius: ${logoBorderRadius}px; overflow: hidden;`,
                    x_align: align,
                    x_expand: true
                });
                // Reset icon alignment/expand since it's now inside a Bin
                icon.x_align = Clutter.ActorAlign.CENTER;
                icon.x_expand = false;
            } else {
                // Apply alignment to icon directly if not wrapped
                icon.x_align = align;
                icon.x_expand = true;
            }

            // Apply consistent margin to whichever widget is in the main container
            finalWidget.add_style_class_name('logo-container');
            
            // Insert logo at the beginning of the container
            this._mainContainer.insert_child_at_index(finalWidget, 0);
            this._logoContainer = finalWidget;
        }
    }
    
    // Update visibility of information items based on settings
    _updateItemVisibility() {
        this._infoItems.forEach(item => {
            const settingsKey = this._visibilityMap[item.key];
            if (settingsKey) {
                const visible = this._settings.get_boolean(settingsKey);
                item.setVisible(visible);
            }
        });
        this._updateLabelWidths();
    }

    _updateLabelWidths() {
        let maxWidth = 0;
        
        // Reset widths first to get natural widths
        this._infoItems.forEach(item => {
            if (item.container && item.container.visible) {
                item.setLabelWidth(-1);
            }
        });

        // Find max natural width among visible items
        this._infoItems.forEach(item => {
            if (item.container && item.container.visible) {
                let width = item.getLabelPreferredWidth();
                if (width > maxWidth) {
                    maxWidth = width;
                }
            }
        });
        
        // Apply max width to all visible items to keep them aligned
        if (maxWidth > 0) {
            this._infoItems.forEach(item => {
                if (item.container && item.container.visible) {
                    item.setLabelWidth(maxWidth);
                }
            });
        }
    }

    _createInfobox() {
        let monitor = Main.layoutManager.primaryMonitor;

        // Create main container as a vertical box layout
        this._mainContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'infobox-container'
        });

        // Create information items
        this._infoItems = this._createInfoItems();
        
        // Add each item container to main container
        this._infoItems.forEach(item => {
            const container = item.createContainer(this._settings);
            this._mainContainer.add_child(container);
        });

        // Initial update
        this._updateInfobox();
        
        // Apply styles
        this._applyStyles();
        
        // Update visibility
        this._updateItemVisibility();

        // Add to background group to appear behind windows but on top of wallpaper
        // This must be done before calculating position to ensure layout is complete
        Main.layoutManager._backgroundGroup.add_child(this._mainContainer);
        
        // Recalculate label widths now that we are on stage
        this._updateLabelWidths();
        
        // Set initial position after adding to stage so layout is complete
        let [x, y] = this._calculatePosition(monitor);
        this._mainContainer.set_position(x, y);
        
        // Initialize network monitoring for event-based updates
        this._initNetworkMonitoring();
        
        // Setup settings change listeners
        this._setupSettingsListeners();
        
        // Still poll periodically for boot time and other info (every 30 seconds)
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            return this._updateInfobox();
        });
    }
    
    // Setup settings change listeners
    _setupSettingsListeners() {
        // Position changes
        let posSignal1 = this._settings.connect('changed::position-vertical', () => {
            this._updatePosition();
        });
        this._settingsSignals.push(posSignal1);
        
        let posSignal2 = this._settings.connect('changed::position-horizontal', () => {
            this._updatePosition();
        });
        this._settingsSignals.push(posSignal2);
        
        // Appearance changes
        let styleKeys = ['font-family', 'font-size', 'font-color', 'background-color', 
                         'border-radius', 'padding'];
        styleKeys.forEach(key => {
            let signal = this._settings.connect(`changed::${key}`, () => {
                this._applyStyles();
                this._updateLabelWidths();
            });
            this._settingsSignals.push(signal);
        });
        
        // Logo changes
        let logoKeys = ['show-logo', 'logo-path', 'logo-size', 'logo-border-radius', 'logo-alignment'];
        logoKeys.forEach(key => {
            let signal = this._settings.connect(`changed::${key}`, () => {
                this._updateLogo();
            });
            this._settingsSignals.push(signal);
        });
        
        // Visibility changes - derive keys from visibility map to avoid duplication
        Object.values(this._visibilityMap).forEach(key => {
            let signal = this._settings.connect(`changed::${key}`, () => {
                this._updateItemVisibility();
            });
            this._settingsSignals.push(signal);
        });
    }

    init() {
        // Extension initialization - required by GNOME Shell Extension API
        // Actual initialization happens in the constructor
    }

    enable() {
        this._settings = this.getSettings('org.gnome.shell.extensions.wallpaper-information');
        // Cache OS release info once at startup
        this._osReleaseInfo = getOSReleaseInfo();
        this._createInfobox();
    }

    disable() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        
        this._cleanupNetworkMonitoring();
        
        // Disconnect settings signals
        if (this._settings && this._settingsSignals.length > 0) {
            this._settingsSignals.forEach(signal => {
                this._settings.disconnect(signal);
            });
            this._settingsSignals = [];
        }
        
        if (this._mainContainer) {
            Main.layoutManager._backgroundGroup.remove_child(this._mainContainer);
            this._mainContainer.destroy();
            this._mainContainer = null;
        }
        
        this._logoContainer = null;
        this._osReleaseInfo = null;
        this._infoItems = [];
        this._settings = null;
    }
}
