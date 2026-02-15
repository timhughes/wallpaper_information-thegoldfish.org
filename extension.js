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
        logo: null
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
                    }
                }
            }
        }
    } catch (e) {
        logError(e, 'Failed to read /etc/os-release');
    }
    
    return osInfo;
}

// Get system information using native APIs
function getSystemInfo() {
    let info = {};
    
    // OS Release information
    let osRelease = getOSReleaseInfo();
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

// Information item definition
class InfoItem {
    constructor(key, label, getValue) {
        this.key = key;
        this.label = label;
        this.getValue = getValue;
        this.container = null;
    }
    
    createContainer(settings) {
        this.container = new St.Label({
            style_class: 'info-item',
            text: ''
        });
        return this.container;
    }
    
    update(info) {
        if (this.container) {
            const value = this.getValue(info);
            this.container.text = `${this.label}: ${value}`;
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
        this._distroLogoContainer = null;
        this._timeoutId = null;
        this._nmProxy = null;
        this._nmSignalId = null;
        this._settings = null;
        this._settingsSignals = [];
        this._infoItems = [];
    }
    
    // Create information items
    _createInfoItems() {
        return [
            new InfoItem('distro-name', 'Distro', (info) => info.distro_name),
            new InfoItem('distro-version', 'Version', (info) => info.distro_version),
            new InfoItem('hostname', 'Hostname', (info) => info.hostname),
            new InfoItem('boot-time', 'Boot Time', (info) => info.boot_time),
            new InfoItem('ip-address', 'IP Address', (info) => info.ipaddress),
            new InfoItem('kernel', 'Kernel', (info) => info.kernelversion),
            new InfoItem('asset-tag', 'Asset Tag', (info) => info.chassis_asset_tag)
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
            let info = getSystemInfo();
            
            // Update each information item
            this._infoItems.forEach(item => {
                item.update(info);
            });
            
            // Update logos if needed
            this._updateLogo();
            this._updateDistroLogo();
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
        
        // Remove existing logo if we need to hide it or recreate it
        // Note: We recreate the logo instead of updating properties for simplicity,
        // as logo changes are infrequent and the overhead is minimal
        if (this._logoContainer) {
            this._logoContainer.destroy();
            this._logoContainer = null;
        }
        
        // Create new logo if enabled and path is valid
        if (showLogo && logoPath && logoPath.length > 0) {
            try {
                const file = Gio.File.new_for_path(logoPath);
                if (file.query_exists(null)) {
                    const icon = new St.Icon({
                        gicon: Gio.icon_new_for_string(logoPath),
                        icon_size: logoSize,
                        style_class: 'logo-icon'
                    });
                    
                    // Insert logo at the beginning of the container
                    this._mainContainer.insert_child_at_index(icon, 0);
                    this._logoContainer = icon;
                }
            } catch (e) {
                logError(e, 'Failed to load logo');
            }
        }
    }
    
    // Update distro logo display
    _updateDistroLogo() {
        const showDistroLogo = this._settings.get_boolean('show-distro-logo');
        
        // Remove existing distro logo if present
        if (this._distroLogoContainer) {
            this._distroLogoContainer.destroy();
            this._distroLogoContainer = null;
        }
        
        if (showDistroLogo) {
            // Get distro logo name from system info
            let info = getSystemInfo();
            if (info.distro_logo) {
                try {
                    // Try to find the logo icon in the icon theme
                    // GNOME's icon theme will search standard locations like /usr/share/pixmaps
                    const iconTheme = St.IconTheme.get_default();
                    
                    // Check if icon exists in theme
                    if (iconTheme.has_icon(info.distro_logo)) {
                        const logoSize = this._settings.get_int('logo-size');
                        const icon = new St.Icon({
                            icon_name: info.distro_logo,
                            icon_size: logoSize,
                            style_class: 'logo-icon'
                        });
                        
                        // Insert distro logo after company logo (or at beginning if no company logo)
                        let insertIndex = this._logoContainer ? 1 : 0;
                        this._mainContainer.insert_child_at_index(icon, insertIndex);
                        this._distroLogoContainer = icon;
                    } else {
                        // Try common locations for distro logos
                        let logoPath = null;
                        const possiblePaths = [
                            `/usr/share/pixmaps/${info.distro_logo}.svg`,
                            `/usr/share/pixmaps/${info.distro_logo}.png`,
                            `/usr/share/icons/hicolor/scalable/apps/${info.distro_logo}.svg`,
                            `/usr/share/icons/hicolor/128x128/apps/${info.distro_logo}.png`
                        ];
                        
                        for (let path of possiblePaths) {
                            const file = Gio.File.new_for_path(path);
                            if (file.query_exists(null)) {
                                logoPath = path;
                                break;
                            }
                        }
                        
                        if (logoPath) {
                            const logoSize = this._settings.get_int('logo-size');
                            const icon = new St.Icon({
                                gicon: Gio.icon_new_for_string(logoPath),
                                icon_size: logoSize,
                                style_class: 'logo-icon'
                            });
                            
                            let insertIndex = this._logoContainer ? 1 : 0;
                            this._mainContainer.insert_child_at_index(icon, insertIndex);
                            this._distroLogoContainer = icon;
                        }
                    }
                } catch (e) {
                    logError(e, 'Failed to load distro logo');
                }
            }
        }
    }
    
    // Update visibility of information items based on settings
    _updateItemVisibility() {
        const visibilityMap = {
            'distro-name': 'show-distro-name',
            'distro-version': 'show-distro-version',
            'hostname': 'show-hostname',
            'boot-time': 'show-boot-time',
            'ip-address': 'show-ip-address',
            'kernel': 'show-kernel',
            'asset-tag': 'show-asset-tag'
        };
        
        this._infoItems.forEach(item => {
            const settingsKey = visibilityMap[item.key];
            if (settingsKey) {
                const visible = this._settings.get_boolean(settingsKey);
                item.setVisible(visible);
            }
        });
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
            });
            this._settingsSignals.push(signal);
        });
        
        // Logo changes (affects both company and distro logo size)
        let logoKeys = ['show-logo', 'logo-path', 'logo-size'];
        logoKeys.forEach(key => {
            let signal = this._settings.connect(`changed::${key}`, () => {
                this._updateLogo();
                this._updateDistroLogo();
            });
            this._settingsSignals.push(signal);
        });
        
        // Distro logo changes
        let distroLogoSignal = this._settings.connect('changed::show-distro-logo', () => {
            this._updateDistroLogo();
        });
        this._settingsSignals.push(distroLogoSignal);
        
        // Visibility changes
        let visKeys = ['show-distro-name', 'show-distro-version', 'show-hostname', 
                       'show-boot-time', 'show-ip-address', 'show-kernel', 'show-asset-tag'];
        visKeys.forEach(key => {
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
        this._settings = this.getSettings();
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
        this._distroLogoContainer = null;
        this._infoItems = [];
        this._settings = null;
    }
}
