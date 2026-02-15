# Wallpaper Information

A GNOME Shell extension that displays system information overlaid on your desktop wallpaper.

## Description

This extension displays system information as a transparent overlay on the desktop of the primary monitor. It shows useful system information including:

- Hostname
- Last Boot Time (instead of uptime)
- IP address(es)
- Kernel version
- Chassis asset tag (from DMI)

The information is displayed in a semi-transparent box in the upper-left area of your screen and updates intelligently:
- Network information updates automatically when network state changes (via DBus)
- Other information updates every 30 seconds

## Features

- **Event-driven network updates**: Network information updates automatically via NetworkManager DBus signals
- **Boot time display**: Shows when the system was last booted instead of uptime in seconds
- **No external dependencies**: Uses native Linux APIs and GNOME Shell APIs
- **Transparent overlay**: Styled with a semi-transparent dark background
- **Non-intrusive**: Positioned in the upper-left corner of your primary monitor
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

## Customization

### Styling

Modify `stylesheet.css` to change the appearance:

```css
.infobox-label {
    font-size: 24px;           /* Text size */
    font-weight: bold;         /* Text weight */
    color: #ffffff;            /* Text color */
    background-color: rgba(10,10,10,0.5);  /* Background with transparency */
    border-radius: 10px;       /* Rounded corners */
    padding: .5em;             /* Spacing inside box */
}
```

### Position

To change the position, edit the `set_position` call in `extension.js`:

```javascript
infobox.set_position(monitor.x + Math.floor(48),  // X offset from left
                     monitor.y + Math.floor(64));  // Y offset from top
```

### Update Interval

The extension uses smart updates:
- Network information updates automatically via DBus when network state changes
- Other system information updates every 30 seconds

To change the polling interval, modify the timeout value in `extension.js`:

```javascript
timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, updateInfobox);
```

## How It Works

1. The extension creates a text label (`St.Label`) with styling from `stylesheet.css`
2. It gathers system information using native Linux APIs:
   - Hostname from `GLib.get_host_name()`
   - Boot time from `/proc/uptime`
   - Kernel version from `/proc/version`
   - IP addresses from `hostname -I` command
   - Asset tag from `/sys/class/dmi/id/chassis_asset_tag`
3. The label is positioned on the primary monitor
4. The label is inserted into the background group layer (behind windows, but on top of wallpaper)
5. Network information updates automatically when NetworkManager detects changes (via DBus)
6. Other information is refreshed every 30 seconds

## Troubleshooting

### Extension not showing up
- Make sure the extension directory is named exactly `wallpaper_information@thegoldfish.org`
- Check that you have GNOME Shell 45 or newer
- Look for errors in the GNOME Shell log: `journalctl --user -f -u org.gnome.Shell.desktop`

### No output displayed
- Check for JavaScript errors: `journalctl --user -f -u org.gnome.Shell.desktop -o cat | grep wallpaper`

### Wrong position or styling
- Modify the values in `extension.js` (position) or `stylesheet.css` (appearance)
- Reload the extension after making changes

## Changes from Previous Version

- ✅ **Removed facter dependency**: Now uses native Linux APIs
- ✅ **Event-driven network updates**: Uses NetworkManager DBus signals instead of polling
- ✅ **Boot time instead of uptime**: Shows when system was last booted
- ✅ **Modern GNOME support**: Updated for GNOME 45-49
- ✅ **ESM imports**: Uses modern JavaScript module syntax
- ✅ **Reduced polling**: Updates every 30 seconds instead of every second

## License

Copyright (C) 2019 Tim Hughes <thughes@thegoldfish.org>

Distributed under terms of the MIT license.
