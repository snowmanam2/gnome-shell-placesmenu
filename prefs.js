const Gtk = imports.gi.Gtk;

const Extension = imports.misc.extensionUtils.getCurrentExtension();
const Lib = Extension.imports.lib;

let settings = Lib.getSettings();

function init() {
}

function switcher (key, l, tooltip) {
    let box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
    let label = new Gtk.Label({ label: l, xalign: 0 });
    let widget = new Gtk.Switch({ active: settings.get_boolean(key) });
    widget.connect('notify::active', function(switch_widget) {
        settings.set_boolean(key, switch_widget.active);
    });
        
    if (tooltip != "") {
        widget.set_tooltip_text(tooltip);
    }
        
    box.pack_start(label, true, true, 0);
    box.add(widget);
    return box;
}

function spinner (key, l, minv, maxv, step) {
    let box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
    let label = new Gtk.Label({ label: l, xalign: 0 });
    let widget = new Gtk.SpinButton.new_with_range(minv, maxv, step);
    widget.set_value(settings.get_int(key));
    widget.set_size_request(200, -1);
    widget.connect('value-changed', function(spinner_widget) {
        settings.set_int(key, spinner_widget.get_value());
    });
    box.pack_start(label, true, true, 0);
    box.add(widget);
    return box;
}

function buildPrefsWidget() {
    let box_panel = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, border_width: 10 });
    
    box_panel.pack_start(spinner("place-icon-size", "Icon Size", 10, 40, 1), false, false, 5);
    box_panel.pack_start(spinner("recent-number", "Number of Recent Items", 0, 20, 1), false, false, 5);
    box_panel.pack_start(switcher("show-volumes", "Show Volumes Menu", ""), false, false, 5);
	box_panel.pack_start(switcher("show-net-drives", "Show Network Drives", ""), false, false, 5);
	box_panel.pack_start(switcher("show-recent", "Show Recent Items", ""), false, false, 5);
	
	box_panel.show_all();
		
	return box_panel;
}

