/*
 * extension.js
 * Copyright (C) 2019 Tim Hughes <thughes@thegoldfish.org>
 *
 * Distributed under terms of the MIT license.
 */



const GLib = imports.gi.GLib;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const St = imports.gi.St;

let infobox;

const COMMAND = "facter hostname uptime system_uptime.seconds ipaddress kernelversion dmi.chassis.asset_tag"

function run_command() {
    let output = "";
    try {
        output = GLib.spawn_command_line_sync(COMMAND, null, null, null, null);
    } catch(e) {
        throw e;
    }
    let text = output[1] + "";
    return text.trim();
}



function _update_infobox() {
    if (infobox) {
        infobox.text = run_command();
        Mainloop.timeout_add(1000, _update_infobox);
    }
}
function create_infobox() {
    let monitor = Main.layoutManager.primaryMonitor;

    if (!infobox) {
         infobox = new St.Label({ style_class: 'infobox-label', text: '' });
    }

    _update_infobox()

    infobox.set_position(monitor.x + Math.floor(48),
                      monitor.y + Math.floor(64));



    let n_children = Main.layoutManager._backgroundGroup.get_n_children();
    Main.layoutManager._backgroundGroup.insert_child_at_index(infobox, n_children);
}


function init() {
    create_infobox()
}

function enable() {
    create_infobox()
}

function disable() {
    Main.layoutManager._backgroundGroup.remove_actor(infobox);
    infobox = null;
}
