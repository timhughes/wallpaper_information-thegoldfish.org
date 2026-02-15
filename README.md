# Wallpaper Information

A GNOME Shell extension that displays system information overlaid on your desktop wallpaper.

## Description

This extension runs a command and displays the output as a transparent overlay on the desktop of the primary monitor. By default, it uses the `facter` command to show useful system information including:

- Hostname
- Uptime
- System uptime (in seconds)
- IP address
- Kernel version
- Chassis asset tag (from DMI)

The information is displayed in a semi-transparent box in the upper-left area of your screen and updates every second.

## Features

- **Real-time updates**: System information refreshes every second
- **Transparent overlay**: Styled with a semi-transparent dark background
- **Non-intrusive**: Positioned in the upper-left corner of your primary monitor
- **Customizable**: Easy to modify the command to display different information

## Requirements

- GNOME Shell 3.32 or 3.34
- `facter` command-line tool (from Puppet)

To install `facter` on most Linux distributions:

```bash
# Debian/Ubuntu
sudo apt-get install facter

# Fedora/RHEL/CentOS
sudo dnf install facter

# Arch Linux
sudo pacman -S facter
```

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

### Changing the Command

To display different information, edit the `COMMAND` constant in `extension.js`:

```javascript
const COMMAND = "facter hostname uptime system_uptime.seconds ipaddress kernelversion dmi.chassis.asset_tag"
```

You can use any command that outputs text. For example:
- `date` - Display current date/time
- `sensors` - Show temperature sensors
- `df -h /` - Show disk usage
- Custom scripts

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

To change how often the information updates, modify the timeout value in `extension.js`:

```javascript
Mainloop.timeout_add(1000, _update_infobox);  // 1000 = 1 second
```

## How It Works

1. The extension creates a text label (`St.Label`) with styling from `stylesheet.css`
2. It runs the specified command using `GLib.spawn_command_line_sync()`
3. The command output is displayed in the label
4. The label is positioned on the primary monitor
5. The label is inserted into the background group layer (behind windows, but on top of wallpaper)
6. Every second, the command is re-run and the display is updated

## Troubleshooting

### Extension not showing up
- Make sure the extension directory is named exactly `wallpaper_information@thegoldfish.org`
- Check that you have the correct GNOME Shell version (3.32 or 3.34)
- Look for errors in the GNOME Shell log: `journalctl -f /usr/bin/gnome-shell`

### No output displayed
- Verify that the `facter` command is installed and works from terminal
- Check that the command in `extension.js` runs successfully from command line
- Look for JavaScript errors: `journalctl -f /usr/bin/gnome-shell -o cat | grep wallpaper`

### Wrong position or styling
- Modify the values in `extension.js` (position) or `stylesheet.css` (appearance)
- Reload the extension after making changes

## License

Copyright (C) 2019 Tim Hughes <thughes@thegoldfish.org>

Distributed under terms of the MIT license.
