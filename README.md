# Wallpaper Information

A GNOME Shell extension that displays system information overlaid on your desktop wallpaper.

## Description

This extension displays system information as a transparent overlay on the desktop of the primary monitor. It shows useful system information including:

- Linux distribution name and version (from `/etc/os-release`)
- Distribution logo (automatically detected)
- Hostname
- Last Boot Time (instead of uptime)
- IP address(es)
- Kernel version
- Chassis asset tag (from DMI)
- Company logo (optional)

The information is displayed in a customizable semi-transparent box and updates intelligently:
- Network information updates automatically when network state changes (via DBus)
- Other information updates every 30 seconds

## Features

- **Fully configurable**: Comprehensive preferences UI to customize every aspect
- **OS information**: Displays Linux distribution name, version, and logo from `/etc/os-release`
- **Distribution logo**: Automatically detects and displays your distro's logo
- **Flexible positioning**: Choose from 9 positions (top/middle/bottom × left/center/right)
- **Customizable appearance**: Font family, size, color, background color, border radius, and padding
- **Toggle information items**: Show or hide any information item individually
- **Company logo support**: Display a custom logo image with configurable size
- **Event-driven network updates**: Network information updates automatically via NetworkManager DBus signals
- **Boot time display**: Shows when the system was last booted instead of uptime in seconds
- **Container-based architecture**: Each information item is in its own container for better flexibility
- **Real-time updates**: Settings changes apply immediately without restart
- **No external dependencies**: Uses native Linux APIs and GNOME Shell APIs
- **Modern GNOME support**: Compatible with GNOME Shell 45, 46, 47, 48, and 49

## Requirements

- GNOME Shell 45 or newer (tested up to GNOME 49)
- No external dependencies required!

## Installation

1. Clone this repository to your GNOME Shell extensions directory:

```bash
cd ~/.local/share/gnome-shell/extensions/
git clone <repository-url> wallpaper_information@thegoldfish.org
```

2. Restart GNOME Shell:
   - On X11: Press `Alt+F2`, type `r`, and press Enter
   - On Wayland: Log out and log back in

3. Enable the extension:

```bash
gnome-extensions enable wallpaper_information@thegoldfish.org
```

Or use GNOME Extensions app or GNOME Tweaks to enable it.

## Configuration

Access the extension preferences to customize the display:

```bash
gnome-extensions prefs wallpaper_information@thegoldfish.org
```

Or use GNOME Extensions app and click the settings icon for this extension.

### Position Settings

Choose where the information box appears on your screen:
- **Vertical Position**: Top, Middle, or Bottom
- **Horizontal Position**: Left, Center, or Right

This gives you 9 possible positions to place the information display.

### Information Items

Toggle which information to display:
- ✓ Distribution Name
- ✓ Distribution Version
- ✓ Hostname
- ✓ Boot Time
- ✓ IP Address
- ✓ Kernel Version
- ✓ Asset Tag

Each item can be individually enabled or disabled.

### Appearance Settings

Customize the look and feel:
- **Font Family**: Choose any installed font (e.g., "Sans", "Monospace", "Ubuntu")
- **Font Size**: Set text size from 8 to 72 pixels
- **Font Color**: Set text color using hex format (e.g., #ffffff)
- **Background Color**: Set background using rgba format (e.g., rgba(10,10,10,0.5))
- **Border Radius**: Set corner roundness from 0 to 50 pixels
- **Padding**: Set internal spacing from 0 to 50 pixels

### Logos

#### Company Logo
Add a custom logo to your display:
- **Enable/Disable**: Toggle logo display on or off
- **Logo File**: Choose an image file (PNG, JPEG, or SVG)
- **Logo Size**: Set logo size from 16 to 256 pixels

The company logo appears at the top of the information display when enabled.

#### Distribution Logo
Display your Linux distribution logo automatically:
- **Enable/Disable**: Toggle distro logo display on or off
- **Automatic Detection**: Reads LOGO field from `/etc/os-release`
- **Icon Lookup**: Searches system icon theme and common locations:
  - Icon theme (e.g., `ubuntu-logo`, `fedora-logo-icon`)
  - `/usr/share/pixmaps/`
  - `/usr/share/icons/`
- **Shared Size**: Uses the same size setting as company logo

The distribution logo appears after the company logo (or at the top if no company logo is set).

## Customization

### Advanced Styling

For additional customization beyond the preferences UI, you can modify `stylesheet.css`:

```css
.infobox-container {
    font-size: 24px;
    font-weight: bold;
    color: #ffffff;
    background-color: rgba(10,10,10,0.5);
    border-radius: 10px;
    padding: 12px;
}

.info-item {
    margin-bottom: 4px;
}

.logo-icon {
    margin-bottom: 8px;
}
```

### Update Interval

The extension uses smart updates:
- Network information updates automatically via DBus when network state changes
- Other system information updates every 30 seconds

To change the polling interval, modify the timeout value in `extension.js`:

```javascript
this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
    return this._updateInfobox();
});
```

## How It Works

1. The extension creates a container-based layout using `St.BoxLayout` with styling from `stylesheet.css`
2. Each information item is in its own `St.Label` container for independent control
3. It gathers system information using native Linux APIs:
   - OS information from `/etc/os-release` (NAME, VERSION, LOGO)
   - Distribution logo from icon theme or common pixmap locations
   - Hostname from `GLib.get_host_name()`
   - Boot time from `/proc/uptime`
   - Kernel version from `/proc/version`
   - IP addresses from `hostname -I` command
   - Asset tag from `/sys/class/dmi/id/chassis_asset_tag`
4. The container is positioned on the primary monitor based on user preferences
5. The container is inserted into the background group layer (behind windows, but on top of wallpaper)
6. Network information updates automatically when NetworkManager detects changes (via DBus)
7. Other information is refreshed every 30 seconds
8. Settings changes trigger real-time updates via GSettings signals

## Troubleshooting

### Extension not showing up
- Make sure the extension directory is named exactly `wallpaper_information@thegoldfish.org`
- Check that you have GNOME Shell 45 or newer
- Look for errors in the GNOME Shell log: `journalctl --user -f -u org.gnome.Shell.desktop`

### No output displayed
- Check for JavaScript errors: `journalctl --user -f -u org.gnome.Shell.desktop -o cat | grep wallpaper`
- Verify that at least one information item is enabled in preferences

### Settings not saving
- Make sure the `schemas` directory contains the compiled GSettings schema
- Recompile the schema if needed: `glib-compile-schemas schemas/`

### Wrong position or styling
- Use the preferences UI to adjust position and appearance settings
- Changes apply in real-time without needing to reload the extension

## Changes from Previous Version

- ✅ **OS release information**: Display Linux distribution name, version, and logo from `/etc/os-release`
- ✅ **Distribution logo**: Automatic distro logo detection and display
- ✅ **Fully configurable**: Added comprehensive preferences UI with GSettings
- ✅ **Flexible positioning**: 9 position options (3×3 grid)
- ✅ **Customizable appearance**: Font, colors, size, padding, and border radius
- ✅ **Toggle information items**: Each item can be individually shown/hidden
- ✅ **Company logo support**: Display custom logo images
- ✅ **Container-based architecture**: Each info item in its own container
- ✅ **Real-time updates**: Settings apply immediately
- ✅ **Removed facter dependency**: Now uses native Linux APIs
- ✅ **Event-driven network updates**: Uses NetworkManager DBus signals instead of polling
- ✅ **Boot time instead of uptime**: Shows when system was last booted
- ✅ **Modern GNOME support**: Updated for GNOME 45-49
- ✅ **ESM imports**: Uses modern JavaScript module syntax
- ✅ **Reduced polling**: Updates every 30 seconds instead of every second

## Future Extensibility

The extension is designed to easily support additional information items:

1. **Add new information sources**: Define new data collection functions in `getSystemInfo()`
2. **Add new display items**: Create new `InfoItem` instances in `_createInfoItems()`
3. **Add new settings**: Add entries to the GSettings schema
4. **Extend preferences UI**: Add new rows to the preferences dialog

The container-based architecture makes it simple to add new information items without modifying the core display logic.

## License

Copyright (C) 2019 Tim Hughes <thughes@thegoldfish.org>

Distributed under terms of the MIT license.
