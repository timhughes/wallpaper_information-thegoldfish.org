/*
 * prefs.js
 * Preferences dialog for Wallpaper Information extension
 * Copyright (C) 2019 Tim Hughes <thughes@thegoldfish.org>
 *
 * Distributed under terms of the MIT license.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import Pango from 'gi://Pango';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class WallpaperInfoPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.wallpaper-information');
        
        // Appearance Page (Combined Position and Appearance)
        const appearancePage = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'applications-graphics-symbolic'
        });
        window.add(appearancePage);

        // Position Group
        const positionGroup = new Adw.PreferencesGroup({
            title: 'Display Position',
            description: 'Choose where the information box appears on screen'
        });
        appearancePage.add(positionGroup);
        
        // Vertical position
        const verticalRow = new Adw.ComboRow({
            title: 'Vertical Position',
            subtitle: 'Top, middle, or bottom of screen'
        });
        const verticalModel = new Gtk.StringList();
        verticalModel.append('Top');
        verticalModel.append('Middle');
        verticalModel.append('Bottom');
        verticalRow.model = verticalModel;
        
        const verticalPos = settings.get_string('position-vertical');
        verticalRow.selected = ['top', 'middle', 'bottom'].indexOf(verticalPos);
        
        verticalRow.connect('notify::selected', (widget) => {
            const selected = ['top', 'middle', 'bottom'][widget.selected];
            settings.set_string('position-vertical', selected);
        });
        positionGroup.add(verticalRow);
        
        // Horizontal position
        const horizontalRow = new Adw.ComboRow({
            title: 'Horizontal Position',
            subtitle: 'Left, center, or right of screen'
        });
        const horizontalModel = new Gtk.StringList();
        horizontalModel.append('Left');
        horizontalModel.append('Center');
        horizontalModel.append('Right');
        horizontalRow.model = horizontalModel;
        
        const horizontalPos = settings.get_string('position-horizontal');
        horizontalRow.selected = ['left', 'center', 'right'].indexOf(horizontalPos);
        
        horizontalRow.connect('notify::selected', (widget) => {
            const selected = ['left', 'center', 'right'][widget.selected];
            settings.set_string('position-horizontal', selected);
        });
        positionGroup.add(horizontalRow);
        
        // Font Settings Group
        const fontGroup = new Adw.PreferencesGroup({
            title: 'Font Settings',
            description: 'Customize text appearance'
        });
        appearancePage.add(fontGroup);
        
        // Font settings
        const fontRow = new Adw.ActionRow({
            title: 'Font',
            subtitle: 'Choose the font and size'
        });
        
        const fontDialog = new Gtk.FontDialog();
        const fontButton = new Gtk.FontDialogButton({
            dialog: fontDialog,
            valign: Gtk.Align.CENTER
        });

        // Initialize button with current font
        const initialFamily = settings.get_string('font-family');
        const initialSize = settings.get_int('font-size');
        fontButton.font_desc = Pango.FontDescription.from_string(`${initialFamily} ${initialSize}`);

        fontButton.connect('notify::font-desc', () => {
            const desc = fontButton.font_desc;
            const family = desc.get_family();
            const size = desc.get_size() / Pango.SCALE;
            
            if (family)
                settings.set_string('font-family', family);
            if (size > 0)
                settings.set_int('font-size', size);
        });

        fontRow.add_suffix(fontButton);
        fontGroup.add(fontRow);
        
        // Font color
        const fontColorRow = new Adw.ActionRow({
            title: 'Font Color',
            subtitle: 'Choose the color for the information text'
        });
        
        const fontColorDialog = new Gtk.ColorDialog({
            with_alpha: true
        });
        
        const fontColorButton = new Gtk.ColorDialogButton({
            dialog: fontColorDialog,
            valign: Gtk.Align.CENTER
        });

        // Initialize button with current color
        const currentFontColor = new Gdk.RGBA();
        if (currentFontColor.parse(settings.get_string('font-color'))) {
            fontColorButton.rgba = currentFontColor;
        }

        fontColorButton.connect('notify::rgba', () => {
            settings.set_string('font-color', fontColorButton.rgba.to_string());
        });

        fontColorRow.add_suffix(fontColorButton);
        fontGroup.add(fontColorRow);
        
        // Background Settings Group
        const bgGroup = new Adw.PreferencesGroup({
            title: 'Background Settings',
            description: 'Customize background appearance'
        });
        appearancePage.add(bgGroup);
        
        // Background color
        const bgColorRow = new Adw.ActionRow({
            title: 'Background Color',
            subtitle: 'Choose the background color and transparency'
        });
        
        const bgColorDialog = new Gtk.ColorDialog({
            with_alpha: true
        });
        
        const bgColorButton = new Gtk.ColorDialogButton({
            dialog: bgColorDialog,
            valign: Gtk.Align.CENTER
        });

        // Initialize button with current color
        const currentBgColor = new Gdk.RGBA();
        if (currentBgColor.parse(settings.get_string('background-color'))) {
            bgColorButton.rgba = currentBgColor;
        }

        bgColorButton.connect('notify::rgba', () => {
            settings.set_string('background-color', bgColorButton.rgba.to_string());
        });

        bgColorRow.add_suffix(bgColorButton);
        bgGroup.add(bgColorRow);
        
        // Border radius
        const borderRadiusRow = new Adw.SpinRow({
            title: 'Border Radius',
            subtitle: 'Roundness of corners in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 50,
                step_increment: 1,
                page_increment: 5
            })
        });
        settings.bind('border-radius', borderRadiusRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        bgGroup.add(borderRadiusRow);
        
        // Padding
        const paddingRow = new Adw.SpinRow({
            title: 'Padding',
            subtitle: 'Internal spacing in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 50,
                step_increment: 1,
                page_increment: 5
            })
        });
        settings.bind('padding', paddingRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        bgGroup.add(paddingRow);
        
        // Information Items Page
        const infoPage = new Adw.PreferencesPage({
            title: 'Information',
            icon_name: 'dialog-information-symbolic'
        });
        window.add(infoPage);
        
        const infoGroup = new Adw.PreferencesGroup({
            title: 'Information Items',
            description: 'Choose which information to display'
        });
        infoPage.add(infoGroup);
        
        // Toggle switches for each information item
        const items = [
            { key: 'show-distro-name', title: 'Distribution Name', subtitle: 'Display the Linux distribution name' },
            { key: 'show-distro-version', title: 'Distribution Version', subtitle: 'Display the Linux distribution version' },
            { key: 'show-hostname', title: 'Hostname', subtitle: 'Display the system hostname' },
            { key: 'show-boot-time', title: 'Boot Time', subtitle: 'Display when the system was last booted' },
            { key: 'show-kernel', title: 'Kernel Version', subtitle: 'Display the Linux kernel version' },
            { key: 'show-hardware-vendor', title: 'Hardware Vendor', subtitle: 'Display the hardware manufacturer' },
            { key: 'show-hardware-model', title: 'Hardware Model', subtitle: 'Display the hardware model name' },
            { key: 'show-firmware-version', title: 'Firmware Version', subtitle: 'Display the BIOS/UEFI firmware version' },
            { key: 'show-os-support-end', title: 'OS Support End', subtitle: 'Display when the OS support ends' },
            { key: 'show-os-support-remaining', title: 'OS Support Remaining', subtitle: 'Display time remaining for OS support' },
            { key: 'show-asset-tag', title: 'Asset Tag', subtitle: 'Display the chassis asset tag' },
            { key: 'show-serial-number', title: 'Serial Number', subtitle: 'Display the system serial number' },
            { key: 'show-ip-address', title: 'IP Address', subtitle: 'Display network IP addresses' }
        ];
        
        items.forEach(item => {
            const row = new Adw.SwitchRow({
                title: item.title,
                subtitle: item.subtitle
            });
            settings.bind(item.key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            infoGroup.add(row);
        });
        
        // Logo Page
        const logoPage = new Adw.PreferencesPage({
            title: 'Logo',
            icon_name: 'image-x-generic-symbolic'
        });
        window.add(logoPage);
        
        const logoGroup = new Adw.PreferencesGroup({
            title: 'Logo Settings',
            description: 'Customize the logo display (defaults to distribution logo)'
        });
        logoPage.add(logoGroup);
        
        // Show logo toggle
        const showLogoRow = new Adw.SwitchRow({
            title: 'Show Logo',
            subtitle: 'Display a logo in the information box'
        });
        settings.bind('show-logo', showLogoRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        logoGroup.add(showLogoRow);
        
        // Logo path
        const logoPathRow = new Adw.ActionRow({
            title: 'Custom Logo',
            subtitle: 'Override distribution logo with a custom image'
        });
        
        const logoButton = new Gtk.Button({
            label: 'Choose File',
            valign: Gtk.Align.CENTER
        });
        
        logoButton.connect('clicked', () => {
            const dialog = new Gtk.FileChooserDialog({
                title: 'Select Logo Image',
                action: Gtk.FileChooserAction.OPEN,
                transient_for: window,
                modal: true
            });
            
            dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
            dialog.add_button('Open', Gtk.ResponseType.ACCEPT);
            
            const filter = new Gtk.FileFilter();
            filter.set_name('Image Files');
            filter.add_mime_type('image/png');
            filter.add_mime_type('image/jpeg');
            filter.add_mime_type('image/svg+xml');
            dialog.add_filter(filter);
            
            dialog.connect('response', (dialog, response) => {
                if (response === Gtk.ResponseType.ACCEPT) {
                    const file = dialog.get_file();
                    const path = file.get_path();
                    settings.set_string('logo-path', path);
                    logoPathRow.subtitle = path;
                }
                dialog.destroy();
            });
            
            dialog.show();
        });

        const clearButton = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            valign: Gtk.Align.CENTER
        });
        clearButton.connect('clicked', () => {
            settings.set_string('logo-path', '');
            logoPathRow.subtitle = 'Override distribution logo with a custom image';
        });
        
        logoPathRow.add_suffix(logoButton);
        logoPathRow.add_suffix(clearButton);
        
        const currentLogoPath = settings.get_string('logo-path');
        if (currentLogoPath) {
            logoPathRow.subtitle = currentLogoPath;
        }
        
        logoGroup.add(logoPathRow);
        
        // Logo size
        const logoSizeRow = new Adw.SpinRow({
            title: 'Logo Size',
            subtitle: 'Size in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 16,
                upper: 256,
                step_increment: 8,
                page_increment: 16
            })
        });
        settings.bind('logo-size', logoSizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        logoGroup.add(logoSizeRow);

        // Logo border radius
        const logoBorderRadiusRow = new Adw.SpinRow({
            title: 'Logo Border Radius',
            subtitle: 'Roundness of logo corners in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 128,
                step_increment: 1,
                page_increment: 5
            })
        });
        settings.bind('logo-border-radius', logoBorderRadiusRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        logoGroup.add(logoBorderRadiusRow);
        
        // Logo alignment
        const logoAlignRow = new Adw.ComboRow({
            title: 'Logo Alignment',
            subtitle: 'Horizontal alignment of the logo'
        });
        const logoAlignModel = new Gtk.StringList();
        logoAlignModel.append('Left');
        logoAlignModel.append('Center');
        logoAlignModel.append('Right');
        logoAlignRow.model = logoAlignModel;
        
        const logoAlign = settings.get_string('logo-alignment');
        logoAlignRow.selected = ['left', 'center', 'right'].indexOf(logoAlign);
        
        logoAlignRow.connect('notify::selected', (widget) => {
            const selected = ['left', 'center', 'right'][widget.selected];
            settings.set_string('logo-alignment', selected);
        });
        logoGroup.add(logoAlignRow);
    }
}
