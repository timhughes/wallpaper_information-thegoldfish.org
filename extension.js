/*
 * extension.js
 * Copyright (C) 2026 Tim Hughes <thughes@thegoldfish.org>
 *
 * Distributed under terms of the MIT license.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Import local modules
import * as SystemInfo from './lib/systemInfo.js';

// Constants
const FALLBACK_WIDTH = 200;  // Fallback width if dimension calculation fails
const FALLBACK_HEIGHT = 100;  // Fallback height if dimension calculation fails
const POSITION_MARGIN = 48;  // Margin from screen edges
const SHELL_MAJOR = parseInt(Config.PACKAGE_VERSION.split('.')[0], 10);
const CSS_COLOR_RE = /^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/;

function createBoxLayout(isVertical, props = {}) {
    if (SHELL_MAJOR >= 48) {
        return new St.BoxLayout({
            ...props,
            orientation: isVertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL,
        });
    }
    return new St.BoxLayout({
        ...props,
        vertical: isVertical,
    });
}

function sanitizeCssColor(value, fallback) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return CSS_COLOR_RE.test(trimmed) ? trimmed : fallback;
}

function logError(context, error, cancellable = null) {
    if (!cancellable?.is_cancelled())
        console.error(`${context}: ${error.message}`);
}

// Information item definition
class InfoItem {
    constructor(key, label, getValue) {
        this.key = key;
        this.label = label;
        this.getValue = getValue;
        this.container = null;
    }
    
    createContainer() {
        this.container = createBoxLayout(false, {
            style_class: 'info-row',
        });

        this._labelWidget = new St.Label({
            text: `${this.label}:`,
            style_class: 'info-label',
            y_align: Clutter.ActorAlign.START
        });
        
        this._valuesContainer = createBoxLayout(true, {
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
                            text: String(v),
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
        this._nmDebounceId = null;
        this._nmProxy = null;
        this._settings = null;
        this._cancellable = null;
        this._updatingInfobox = false;
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
    async _initNetworkMonitoring() {
        try {
            const proxy = await new Promise((resolve, reject) => {
                Gio.DBusProxy.new_for_bus(
                    Gio.BusType.SYSTEM,
                    Gio.DBusProxyFlags.NONE,
                    null,
                    'org.freedesktop.NetworkManager',
                    '/org/freedesktop/NetworkManager',
                    'org.freedesktop.NetworkManager',
                    this._cancellable,
                    (_source, res) => {
                        try {
                            resolve(Gio.DBusProxy.new_for_bus_finish(res));
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });

            if (!this._cancellable || this._cancellable.is_cancelled())
                return;

            this._nmProxy = proxy;

            // Listen for relevant state/connection changes (debounced)
            this._nmProxy.connectObject('g-properties-changed', (_proxy, changed) => {
                const props = changed?.deep_unpack?.() ?? {};
                const relevant = ['State', 'PrimaryConnection', 'ActiveConnections', 'Connectivity'];
                if (!relevant.some(k => k in props))
                    return;

                if (this._nmDebounceId) {
                    GLib.Source.remove(this._nmDebounceId);
                    this._nmDebounceId = null;
                }
                this._nmDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                    this._nmDebounceId = null;
                    this._updateInfobox().catch(e => {
                        logError('Failed to update infobox on network change', e, this._cancellable);
                    });
                    return GLib.SOURCE_REMOVE;
                });
            }, this);
        } catch (e) {
            logError('Failed to initialize NetworkManager monitoring', e, this._cancellable);
        }
    }

    // Clean up NetworkManager monitoring
    _cleanupNetworkMonitoring() {
        if (this._nmDebounceId) {
            GLib.Source.remove(this._nmDebounceId);
            this._nmDebounceId = null;
        }
        if (this._nmProxy) {
            this._nmProxy.disconnectObject(this);
            this._nmProxy = null;
        }
    }

    // Update the infobox with current system information
    async _updateInfobox() {
        if (!this._mainContainer || this._updatingInfobox || this._cancellable?.is_cancelled())
            return GLib.SOURCE_CONTINUE;

        this._updatingInfobox = true;
        try {
            // Pass cached OS release info to avoid redundant file I/O
            let info = await SystemInfo.getSystemInfo(this._osReleaseInfo, this._cancellable);
            if (!this._mainContainer || this._cancellable?.is_cancelled())
                return GLib.SOURCE_CONTINUE;
            
            // Update each information item
            this._infoItems.forEach(item => {
                item.update(info);
            });
            
            // Update logo
            await this._updateLogo();
            if (!this._mainContainer || this._cancellable?.is_cancelled())
                return GLib.SOURCE_CONTINUE;

            // Re-align in case content size changed
            this._updatePosition();
        } finally {
            this._updatingInfobox = false;
        }
        return GLib.SOURCE_CONTINUE;
    }
    
    // Calculate position based on settings and usable work area
    _calculatePosition(workArea) {
        const verticalPos = this._settings.get_string('position-vertical');
        const horizontalPos = this._settings.get_string('position-horizontal');
        
        // Always query preferred dimensions so recent style/content changes are reflected immediately
        let [minWidth, naturalWidth] = this._mainContainer.get_preferred_width(-1);
        let [minHeight, naturalHeight] = this._mainContainer.get_preferred_height(-1);
        const width = naturalWidth || minWidth || this._mainContainer.width || FALLBACK_WIDTH;
        const height = naturalHeight || minHeight || this._mainContainer.height || FALLBACK_HEIGHT;
        
        let x, y;

        // Calculate X position
        if (horizontalPos === 'left') {
            x = workArea.x + POSITION_MARGIN;
        } else if (horizontalPos === 'center') {
            x = workArea.x + Math.floor((workArea.width - width) / 2);
        } else { // right
            x = workArea.x + workArea.width - width - POSITION_MARGIN;
        }
        
        // Calculate Y position
        if (verticalPos === 'top') {
            y = workArea.y + POSITION_MARGIN;
        } else if (verticalPos === 'middle') {
            y = workArea.y + Math.floor((workArea.height - height) / 2);
        } else { // bottom
            y = workArea.y + workArea.height - height - POSITION_MARGIN;
        }

        // Clamp within workArea bounds (handles small or portrait-rotated monitors)
        const maxX = Math.max(workArea.x, workArea.x + workArea.width - width);
        const maxY = Math.max(workArea.y, workArea.y + workArea.height - height);
        x = Math.max(workArea.x, Math.min(x, maxX));
        y = Math.max(workArea.y, Math.min(y, maxY));
        
        return [x, y];
    }
    
    // Update position
    _updatePosition() {
        if (!this._mainContainer || !this._mainContainer.get_stage())
            return;

        const primaryIndex = Main.layoutManager.primaryIndex;
        const monitorCount = Main.layoutManager.monitors?.length ?? 0;
        const workArea = (primaryIndex >= 0 && primaryIndex < monitorCount)
            ? Main.layoutManager.getWorkAreaForMonitor(primaryIndex)
            : Main.layoutManager.primaryMonitor;
        if (!workArea)
            return;

        const [x, y] = this._calculatePosition(workArea);
        this._mainContainer.set_position(x, y);
    }

    // Re-attach and reposition overlay when monitors change or rotate
    _onMonitorsChanged() {
        if (!this._mainContainer)
            return;

        const backgroundGroup = Main.layoutManager.backgroundGroup || Main.layoutManager._backgroundGroup;
        if (backgroundGroup && this._mainContainer.get_parent() !== backgroundGroup) {
            const parent = this._mainContainer.get_parent();
            if (parent)
                parent.remove_child(this._mainContainer);
            backgroundGroup.add_child(this._mainContainer);
        }

        this._updatePosition();
    }
    
    // Apply styling from settings
    _applyStyles() {
        if (!this._mainContainer) return;
        
        const fontFamily = this._settings.get_string('font-family').replace(/["\\;\n\r{}]/g, '').trim() || 'Sans';
        const fontSize = Math.max(8, Math.min(72, this._settings.get_int('font-size')));
        const fontColor = sanitizeCssColor(this._settings.get_string('font-color'), '#ffffff');
        const bgColor = sanitizeCssColor(this._settings.get_string('background-color'), 'rgba(10,10,10,0.5)');
        const borderRadius = Math.max(0, Math.min(50, this._settings.get_int('border-radius')));
        const padding = Math.max(0, Math.min(50, this._settings.get_int('padding')));
        
        const style = `
            font-family: "${fontFamily}";
            font-size: ${fontSize}px;
            color: ${fontColor};
            background-color: ${bgColor};
            border-radius: ${borderRadius}px;
            padding: ${padding}px;
        `;
        
        this._mainContainer.set_style(style);
    }
    
    // Update logo display
    async _updateLogo() {
        if (!this._mainContainer || !this._settings || this._cancellable?.is_cancelled())
            return;

        const showLogo = this._settings.get_boolean('show-logo');
        const logoPath = this._settings.get_string('logo-path');
        const logoSize = this._settings.get_int('logo-size');
        const logoBorderRadius = this._settings.get_int('logo-border-radius');
        const logoAlignment = this._settings.get_string('logo-alignment');
        
        if (!showLogo) {
            if (this._logoContainer) {
                this._logoContainer.destroy();
                this._logoContainer = null;
            }
            return;
        }

        let align = Clutter.ActorAlign.START;
        if (logoAlignment === 'center') {
            align = Clutter.ActorAlign.CENTER;
        } else if (logoAlignment === 'right') {
            align = Clutter.ActorAlign.END;
        }

        let icon = null;
        let customLogoFile = null;

        // Try custom logo first
        if (logoPath && logoPath.length > 0) {
            try {
                const file = Gio.File.new_for_path(logoPath);
                const fileInfo = await new Promise((resolve, reject) => {
                    file.query_info_async(
                        'standard::type',
                        Gio.FileQueryInfoFlags.NONE,
                        GLib.PRIORITY_DEFAULT,
                        this._cancellable,
                        (src, res) => {
                            try {
                                resolve(src.query_info_finish(res));
                            } catch (e) {
                                reject(e);
                            }
                        }
                    );
                });
                if (!this._mainContainer || this._cancellable?.is_cancelled())
                    return;

                if (fileInfo.get_file_type() === Gio.FileType.REGULAR) {
                    customLogoFile = file;
                    icon = new St.Icon({
                        gicon: Gio.FileIcon.new(file),
                        icon_size: logoSize
                    });
                }
            } catch (e) {
                if (this._cancellable?.is_cancelled())
                    return;
                logError('Failed to load custom logo', e, this._cancellable);
            }
        }

        // Fallback to distro logo if no custom logo was loaded
        if (!icon) {
            if (!this._osReleaseInfo) {
                this._osReleaseInfo = await SystemInfo.getOSReleaseInfo(this._cancellable);
                if (!this._mainContainer || this._cancellable?.is_cancelled())
                    return;
            }
            
            if (this._osReleaseInfo.logo) {
                try {
                    icon = new St.Icon({
                        icon_name: this._osReleaseInfo.logo,
                        icon_size: logoSize,
                        fallback_icon_name: 'start-here-symbolic'
                    });
                } catch (e) {
                    logError('Failed to load distro logo', e);
                }
            }
        }

        if (!this._mainContainer || this._cancellable?.is_cancelled())
            return;

        // Remove existing logo only after async work completes
        if (this._logoContainer) {
            this._logoContainer.destroy();
            this._logoContainer = null;
        }

        if (icon || customLogoFile) {
            let finalWidget = icon;
            if (logoBorderRadius > 0 && customLogoFile) {
                // Use background-image on St.Bin so border-radius clips custom images reliably in St
                const safeUri = customLogoFile.get_uri().replace(/["()\\]/g, encodeURIComponent);
                finalWidget = new St.Bin({
                    width: logoSize,
                    height: logoSize,
                    style: `background-image: url("${safeUri}"); background-size: cover; background-position: center; border-radius: ${logoBorderRadius}px;`,
                    x_align: align,
                    x_expand: true
                });
            } else if (logoBorderRadius > 0) {
                finalWidget = new St.Bin({
                    child: icon,
                    style: `border-radius: ${logoBorderRadius}px; overflow: hidden;`,
                    x_align: align,
                    x_expand: true
                });
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
        if (!this._mainContainer || !this._mainContainer.get_stage())
            return;

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

    async _createInfobox() {
        // Create main container as a vertical box layout
        this._mainContainer = createBoxLayout(true, {
            style_class: 'infobox-container'
        });

        // Create information items
        this._infoItems = this._createInfoItems();
        
        // Add each item container to main container
        this._infoItems.forEach(item => {
            const container = item.createContainer();
            this._mainContainer.add_child(container);
        });

        // Initial update
        await this._updateInfobox();
        if (!this._mainContainer || this._cancellable?.is_cancelled())
            return;
        
        // Apply styles
        this._applyStyles();
        
        // Update visibility
        this._updateItemVisibility();

        // Add to background group to appear behind windows but on top of wallpaper
        // This must be done before calculating position to ensure layout is complete
        const backgroundGroup = Main.layoutManager.backgroundGroup || Main.layoutManager._backgroundGroup;
        if (backgroundGroup)
            backgroundGroup.add_child(this._mainContainer);
        
        // Recalculate label widths now that we are on stage
        this._updateLabelWidths();
        
        // Set initial position after adding to stage so layout is complete
        this._updatePosition();

        // Keep overlay attached and positioned across monitor/rotation changes
        Main.layoutManager.connectObject('monitors-changed', () => {
            this._onMonitorsChanged();
        }, this);
        
        // Initialize network monitoring for event-based updates
        this._initNetworkMonitoring().catch(e => {
            logError('Failed to start network monitoring', e, this._cancellable);
        });
        
        // Setup settings change listeners
        this._setupSettingsListeners();
        
        // Still poll periodically for boot time and other info (every 30 seconds)
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            this._updateInfobox().catch(e => {
                logError('Failed to update infobox', e, this._cancellable);
            });
            return GLib.SOURCE_CONTINUE;
        });
    }
    
    // Setup settings change listeners
    _setupSettingsListeners() {
        // Position changes
        this._settings.connectObject(
            'changed::position-vertical', () => this._updatePosition(),
            'changed::position-horizontal', () => this._updatePosition(),
            this
        );
        
        // Appearance changes
        let styleKeys = ['font-family', 'font-size', 'font-color', 'background-color', 
                         'border-radius', 'padding'];
        styleKeys.forEach(key => {
            this._settings.connectObject(`changed::${key}`, () => {
                this._applyStyles();
                this._updateLabelWidths();
                this._updatePosition();
            }, this);
        });
        
        // Logo changes
        let logoKeys = ['show-logo', 'logo-path', 'logo-size', 'logo-border-radius', 'logo-alignment'];
        logoKeys.forEach(key => {
            this._settings.connectObject(`changed::${key}`, () => {
                this._updateLogo()
                    .then(() => this._updatePosition())
                    .catch(e => {
                        logError('Failed to update logo', e, this._cancellable);
                    });
            }, this);
        });
        
        // Visibility changes - derive keys from visibility map to avoid duplication
        Object.values(this._visibilityMap).forEach(key => {
            this._settings.connectObject(`changed::${key}`, () => {
                this._updateItemVisibility();
                this._updatePosition();
            }, this);
        });
    }

    async enable() {
        this._cancellable = new Gio.Cancellable();
        this._settings = this.getSettings();
        // Cache OS release info once at startup
        this._osReleaseInfo = await SystemInfo.getOSReleaseInfo(this._cancellable);
        if (!this._cancellable || this._cancellable.is_cancelled())
            return;
        await this._createInfobox();
    }

    disable() {
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }

        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        
        this._cleanupNetworkMonitoring();

        Main.layoutManager.disconnectObject(this);
        
        // Disconnect settings signals
        if (this._settings) {
            this._settings.disconnectObject(this);
        }
        
        // Destroy child logo before _mainContainer so both are cleanly disposed
        if (this._logoContainer) {
            this._logoContainer.destroy();
            this._logoContainer = null;
        }

        if (this._mainContainer) {
            const parent = this._mainContainer.get_parent();
            if (parent)
                parent.remove_child(this._mainContainer);
            this._mainContainer.destroy();
            this._mainContainer = null;
        }
        this._osReleaseInfo = null;
        this._infoItems = [];
        this._settings = null;
        this._updatingInfobox = false;
    }
}
