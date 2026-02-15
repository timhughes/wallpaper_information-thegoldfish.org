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
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class WallpaperInfoPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.wallpaper-information');
        
        // Position Page
        const positionPage = new Adw.PreferencesPage({
            title: 'Position',
            icon_name: 'preferences-desktop-display-symbolic'
        });
        window.add(positionPage);
        
        const positionGroup = new Adw.PreferencesGroup({
            title: 'Display Position',
            description: 'Choose where the information box appears on screen'
        });
        positionPage.add(positionGroup);
        
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
            { key: 'show-ip-address', title: 'IP Address', subtitle: 'Display network IP addresses' },
            { key: 'show-kernel', title: 'Kernel Version', subtitle: 'Display the Linux kernel version' },
            { key: 'show-asset-tag', title: 'Asset Tag', subtitle: 'Display the chassis asset tag' }
        ];
        
        items.forEach(item => {
            const row = new Adw.SwitchRow({
                title: item.title,
                subtitle: item.subtitle
            });
            settings.bind(item.key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            infoGroup.add(row);
        });
        
        // Appearance Page
        const appearancePage = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'applications-graphics-symbolic'
        });
        window.add(appearancePage);
        
        // Font Settings Group
        const fontGroup = new Adw.PreferencesGroup({
            title: 'Font Settings',
            description: 'Customize text appearance'
        });
        appearancePage.add(fontGroup);
        
        // Font family
        const fontFamilyRow = new Adw.EntryRow({
            title: 'Font Family',
        });
        settings.bind('font-family', fontFamilyRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        fontGroup.add(fontFamilyRow);
        
        // Font size
        const fontSizeRow = new Adw.SpinRow({
            title: 'Font Size',
            subtitle: 'Size in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 8,
                upper: 72,
                step_increment: 1,
                page_increment: 5
            })
        });
        settings.bind('font-size', fontSizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        fontGroup.add(fontSizeRow);
        
        // Font color
        const fontColorRow = new Adw.EntryRow({
            title: 'Font Color',
            'placeholder-text': '#ffffff'
        });
        settings.bind('font-color', fontColorRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        fontGroup.add(fontColorRow);
        
        // Background Settings Group
        const bgGroup = new Adw.PreferencesGroup({
            title: 'Background Settings',
            description: 'Customize background appearance'
        });
        appearancePage.add(bgGroup);
        
        // Background color
        const bgColorRow = new Adw.EntryRow({
            title: 'Background Color',
            'placeholder-text': 'rgba(10,10,10,0.5)'
        });
        settings.bind('background-color', bgColorRow, 'text', Gio.SettingsBindFlags.DEFAULT);
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
        
        // Logo Page
        const logoPage = new Adw.PreferencesPage({
            title: 'Logo',
            icon_name: 'image-x-generic-symbolic'
        });
        window.add(logoPage);
        
        const logoGroup = new Adw.PreferencesGroup({
            title: 'Company Logo',
            description: 'Add a custom logo to the display'
        });
        logoPage.add(logoGroup);
        
        // Show logo toggle
        const showLogoRow = new Adw.SwitchRow({
            title: 'Show Logo',
            subtitle: 'Display a company logo'
        });
        settings.bind('show-logo', showLogoRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        logoGroup.add(showLogoRow);
        
        // Logo path
        const logoPathRow = new Adw.ActionRow({
            title: 'Logo File',
            subtitle: 'Select an image file'
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
        
        logoPathRow.add_suffix(logoButton);
        logoPathRow.activatable_widget = logoButton;
        
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
        
        // Distribution Logo Group
        const distroLogoGroup = new Adw.PreferencesGroup({
            title: 'Distribution Logo',
            description: 'Display your Linux distribution logo (from /etc/os-release)'
        });
        logoPage.add(distroLogoGroup);
        
        // Show distro logo toggle
        const showDistroLogoRow = new Adw.SwitchRow({
            title: 'Show Distribution Logo',
            subtitle: 'Display the Linux distribution logo automatically'
        });
        settings.bind('show-distro-logo', showDistroLogoRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        distroLogoGroup.add(showDistroLogoRow);
    }
}
