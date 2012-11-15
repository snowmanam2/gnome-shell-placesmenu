//vim: expandtab shiftwidth=4 tabstop=8 softtabstop=4 encoding=utf-8 textwidth=99
/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

// Gnome Shell Places Menu
// Provides a Places menu in the upper left corner like in Gnome-2
// 
// Author:
//   Bill Smith <snowmanam2@gmail.com>
//   License: GPLv2+
//

const St = imports.gi.St;
const Main = imports.ui.main;
const Lang = imports.lang;
const Tweener = imports.ui.tweener;
const Panel = imports.ui.panel;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const PlaceDisplay = imports.ui.placeDisplay;
const ShellMountOperation = imports.ui.shellMountOperation;
const Params = imports.misc.params;
const Shell = imports.gi.Shell;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const Extension = imports.misc.extensionUtils.getCurrentExtension();
const Lib = Extension.imports.lib;

let settings = Lib.getSettings();

let button = null, restoreState = {};

function PopupMenuIconItem() {
    this._init.apply(this, arguments);
}

PopupMenuIconItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (text, icon, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);

        this.label = new St.Label({ text: text });
        this.addActor(this.label, { align: St.Align.START });

        this.icon = icon;
        if (this.icon != null) {
            this.icon.style_class = 'popup-menu-icon'; 
            this.addActor(this.icon);
        }
    }
};


function PopupMenuButtonItem() {
    this._init.apply(this, arguments);
}

PopupMenuButtonItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (place, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);

        this.label = new St.Label({ text: place.name });
        this.addActor(this.label, { align: St.Align.START });

        this.icon = place.iconFactory(settings.get_int ("place-icon-size"));
        if (this.icon != null) {
            this.icon.style_class = 'popup-menu-icon'; 
            this.addActor(this.icon);
        }

        if (place.isRemovable()) {
        
            let ejectIcon = new St.Icon({ icon_name: 'media-eject',
                          style_class: 'hotplug-resident-eject-icon' });

            let button = new St.Button(
                { style_class: 'hotplug-resident-eject-button',
                button_mask: St.ButtonMask.ONE,
                child: ejectIcon });
        
            button.connect('clicked', Lang.bind(this, function() {
                button.hide();
                place.remove();
            }));                    
        
            this.addActor(button, { align: St.Align.END });
        }
    }
};        


function _makeLaunchContext(params) {
    params = Params.parse(params, { workspace: -1,
                                    timestamp: 0 });

    let launchContext = global.create_app_launch_context();
    if (params.workspace != -1)
        launchContext.set_desktop(params.workspace);
    if (params.timestamp != 0)
        launchContext.set_timestamp(params.timestamp);

    return launchContext;
}

function _sortRecentItem(a, b) {
    return Math.max(b.get_modified(), b.get_visited()) - Math.max(a.get_modified(), a.get_visited());
}

function _mountCallback(src, res, data) {
    src.mount_finish(res,null);
}

PlacesMenuButton.prototype = {
    __proto__: PanelMenu.Button.prototype,

    _init: function() {
        PanelMenu.Button.prototype._init.call(this, 0.0);
        
        let bin = new St.Bin({ name: 'appMenu' });
        this.actor.add_actor(bin);
        
        this._label = new Panel.TextShadower();
        this._label.setText('Places');
        bin.set_child(this._label.actor);
        
        this._createDefaultPlaces();
                
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._bookMenu = new PopupMenu.PopupSubMenuMenuItem('Bookmarks');
        let bookmarksPath = GLib.build_filenamev([GLib.get_home_dir(), '.gtk-bookmarks']);
        let bookmarksFile = Gio.file_new_for_path(bookmarksPath);
        this._mon = bookmarksFile.monitor_file(0, null);
        this._monChangedId = this._mon.connect("changed", 
            Lang.bind(this,function(){this._createBookmarks();}));
        this._createBookmarks();
        this.menu.addMenuItem(this._bookMenu);
        
        this._volumesMenu = new PopupMenu.PopupSubMenuMenuItem('Volumes');
        this._createVolumes();
        this._mountsUpdatedId = Main.placesManager.connect('mounts-updated',
            Lang.bind(this,function() {
                this._createVolumes();
                this._createMounts();
            }
        ));
        this.menu.addMenuItem(this._volumesMenu);
        
        this._mountMenu = new PopupMenu.PopupSubMenuMenuItem('Mounts');
        this._createMounts();
        this.menu.addMenuItem(this._mountMenu);
        
        this._recentManager = Gtk.RecentManager.get_default();
        this._recentList = new PopupMenu.PopupSubMenuMenuItem('Recently Used');
        this._recentChangedId = this._recentManager.connect("changed", 
            Lang.bind(this,function(){this._buildRecentList();}));
        this._buildRecentList();
        this.menu.addMenuItem(this._recentList);
        
        this._settingsChangedId = settings.connect('changed', Lang.bind(this, function (){ 
            this._buildRecentList();
            this._createVolumes();
            this._createBookmarks();
        }));
        
    },
    
    destroy : function() {
        Main.placesManager.disconnect (this._mountsUpdatedId); 
        
        this._mon.disconnect(this._monChangedId);
        this._mon.cancel();
        this._recentManager.disconnect(this._recentChangedId);
        settings.disconnect(this._settingsChangedId);
           
        PanelMenu.Button.prototype.destroy.call(this);
    },
 
    _addPlace : function(place, menu) {
        
        let icon = place.iconFactory(settings.get_int ("place-icon-size"));
        let item = new PopupMenuIconItem(place.name,icon);
        item.place = place;
        menu.addMenuItem(item);
        item.connect('activate', function(actor,event) {actor.place.launch();});
    },
     
    _addMount : function(place, menu) {
        
        let item = new PopupMenuButtonItem(place);
        item.place = place;
        menu.addMenuItem(item);
        item.connect('activate', function(actor,event) {actor.place.launch();});
    },
 
    _addNoIconPlace : function(place, menu) {
        let item = new PopupMenu.PopupMenuItem(place.name);
        item.place = place;
        menu.addMenuItem(item);
        item.connect('activate', function(){});
    },
     
    _addVolume : function (volume, menu) {
         let gicon = volume.get_icon();
         let icon = St.TextureCache.get_default().load_gicon(null, gicon, settings.get_int ("place-icon-size"));
         let item = new PopupMenuIconItem (volume.get_drive().get_name() + " : " + volume.get_name(), icon);
         item.volume = volume;
         menu.addMenuItem(item);
         item.connect('activate', Lang.bind(this, function(actor, event) {
             let m = actor.volume.get_mount();
             if (m) {
                 let launcher = new PlaceDisplay.PlaceDeviceInfo(m);
                launcher.launch();
             }
             else {
                 this._mountVolume(actor.volume);
             }
         }));
    },
 
    _createDefaultPlaces : function() {
        this.defaultPlaces = Main.placesManager.getDefaultPlaces();

        for (let placeid = 0; placeid < this.defaultPlaces.length; placeid++) {
            this._addPlace(this.defaultPlaces[placeid], this.menu);
        }
        
        let gicon = Shell.util_get_icon_for_uri("network:///");
        let icon = St.TextureCache.get_default().load_gicon(null, gicon, settings.get_int ("place-icon-size"));
        
        let item = new PopupMenuIconItem ("Network", icon);
        
        this.menu.addMenuItem(item);
        
        item.connect('activate', Lang.bind(this, function(actor, event) {
            GLib.spawn_command_line_async ("nautilus network:///");
        }));
    }, 
    
    /* The existance of this function may warrant explanation. See, currently only LOCAL uris work in PlacesManager, 
    so to handle remote locations, we have this reimplementation. Once this is fixed, this nasty function goes away. */
    _getBookmarks : function() {
        let bookmarksPath = GLib.build_filenamev([GLib.get_home_dir(), '.gtk-bookmarks']);
        let bookmarksFile = Gio.file_new_for_path(bookmarksPath);
        
        let bookmarks = [];

        if (!GLib.file_test(bookmarksPath, GLib.FileTest.EXISTS))
            return [];

        let bookmarksContent = Shell.get_file_contents_utf8_sync(bookmarksPath);

        let bookmarks = bookmarksContent.split('\n');

        let bookmarksToLabel = {};
        let bookmarksOrder = [];
        
        let book_places = [];
        for (let i = 0; i < bookmarks.length; i++) {
            let bookmarkLine = bookmarks[i];
            let components = bookmarkLine.split(' ');
            let bookmark = components[0];
            let label = null;
            if (components.length > 1) label = components.slice(1).join(' ');

            if (label == null)
                label = Shell.util_get_label_for_uri(bookmark);
            if (label == null)
                label = bookmark;
            
            if (bookmark == "") continue;
            
            if (bookmark.substring(0,4) != 'file') {
                if (!settings.get_boolean('show-net-drives')) continue;
            
                let icon = Shell.util_get_icon_for_uri("network:///");
                let item = new PlaceDisplay.PlaceInfo('bookmark:' + bookmark, label,
                function(size) {
                    return St.TextureCache.get_default().load_gicon(null, icon, size);
                },
                function(params) {
                    GLib.spawn_command_line_async ('nautilus '+bookmark);
                });
                book_places.push(item);
                continue;
            }
            
            let icon = Shell.util_get_icon_for_uri(bookmark);
            let item = new PlaceDisplay.PlaceInfo('bookmark:' + bookmark, label,
                function(size) {
                    return St.TextureCache.get_default().load_gicon(null, icon, size);
                },
                function(params) {
                    Gio.app_info_launch_default_for_uri(bookmark, 
                        _makeLaunchContext(params));
                });
            book_places.push(item);
        }
        return book_places;
    },
    
    _createBookmarks : function() {
        this._bookMenu.menu.removeAll();
        
        this.bookmarks = this._getBookmarks();

        for (let bookmarkid = 0; bookmarkid < this.bookmarks.length; bookmarkid++) {
            this._addPlace(this.bookmarks[bookmarkid], this._bookMenu.menu);
        }
        
        if (this.bookmarks.length == 0) this._bookMenu.actor.hide();
        else this._bookMenu.actor.show();
    },
    
    _createVolumes: function() {
        this._volumesMenu.menu.removeAll();
        let vm = Gio.VolumeMonitor.get();
        
        let drives = vm.get_connected_drives();
        
        for (let i = 0; i < drives.length; i++) {
            let volumes = drives[i].get_volumes();
            for (let j = 0; j < volumes.length; j++) {
                if (volumes[j].can_mount()) {
                    this._addVolume(volumes[j], this._volumesMenu.menu);
                }
            }
        }
        
        if (settings.get_boolean("show-volumes") && drives.length > 0) this._volumesMenu.actor.show();
        else this._volumesMenu.actor.hide();
    },
    
    _createMounts : function() {
        this._mountMenu.menu.removeAll();
        this.mountPlaces = Main.placesManager.getMounts();

        for (let placeid = 0; placeid < this.mountPlaces.length; placeid++) {
            this._addMount(this.mountPlaces[placeid], this._mountMenu.menu);
        }
        
        if (this.mountPlaces.length == 0) this._mountMenu.actor.hide();
        else this._mountMenu.actor.show();
    },
    
    _buildRecentList: function()
    {
        this._recentList.menu.removeAll();
        let items = this._recentManager.get_items();
        
        let displayItems = [];
        
        items.sort(_sortRecentItem);
        for (let i = 0; i < items.length && i < settings.get_int ("recent-number"); i++) {
            let uri = items[i].get_uri();
            let label = items[i].get_display_name();
            let icon = Shell.util_get_icon_for_uri(uri);
            let item = new PlaceDisplay.PlaceInfo('bookmark:' + uri, label,
                function(size) {
                    return St.TextureCache.get_default().load_gicon(null, icon, size);
                },
                function(params) {
                    Gio.app_info_launch_default_for_uri(uri, _makeLaunchContext(params));
                });
            displayItems.push(item);
        }
        
        // The sorted list is reversed, so iterate backwards
        for (let i = displayItems.length-1; i >= 0; i--) {
            this._addPlace(displayItems[i], this._recentList.menu);
        }
        
        this._recentList.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        let clearitem = new PopupMenu.PopupMenuItem("Clear Recent");
        clearitem.connect("activate", 
            Lang.bind(this,function(){this._recentManager.purge_items();}));
        this._recentList.menu.addMenuItem(clearitem);
        
        if (items.length == 0 || !settings.get_boolean("show-recent")) { 
            this._recentList.actor.reactive = false;
            this._recentList.label.style_class = "inactive-label";
            this._recentList._triangle.style_class = "inactive-label"
            this._recentList.actor.hide();
        }
        else { 
            this._recentList.actor.reactive = true;
            this._recentList.label.style_class = "default-label";
            this._recentList._triangle.style_class = "default-label";
            this._recentList.actor.show();
        }
    },
    
    _mountVolume: function(volume) {
        volume.mount(0, null, null,
                     Lang.bind(this, this._onVolumeMounted));
    },
    
    _onVolumeMounted: function (volume, res) {

        try {
            volume.mount_finish(res);
            let launcher = new PlaceDisplay.PlaceDeviceInfo(volume.get_mount());
            launcher.launch();
        } catch (e) {
            let string = e.toString();

            if (string.indexOf('No key available with this passphrase') != -1)
                this._reaskPassword(volume);
            else
                log('Unable to mount volume ' + volume.get_name() + ': ' + string);
        }
    },
      
    _launch: function(place) {
        GLib.spawn_command_line_async ('nautilus '+place);
    },
    
    _connectServer: function() {
        GLib.spawn_command_line_async ('nautilus-connect-server');
    }
};

function PlacesMenuButton()
{
    this._init();
}

function init() {
    
}

function enable() {
    
    button = new PlacesMenuButton();
    
    Main.panel._leftBox.add (button.actor);
    Main.panel._menus.addMenu (button.menu);
     
}

function disable() {
    
    if (button) {
        Main.panel._leftBox.remove_actor (button.actor);
        Main.panel._menus.removeMenu (button.menu);
        button.destroy();
        button = null;
    }
  
}

