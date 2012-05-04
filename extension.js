
const St = imports.gi.St;
const Main = imports.ui.main;
const Lang = imports.lang;
const Tweener = imports.ui.tweener;
const Panel = imports.ui.panel;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const PlaceDisplay = imports.ui.placeDisplay;
const Params = imports.misc.params;
const Shell = imports.gi.Shell;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const PLACE_ICON_SIZE = 22;
const RECENT_NUMBER = 5;

let button, restoreState = {};

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
        if (this.icon != null)
        {
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

        this.icon = place.iconFactory(PLACE_ICON_SIZE);
        if (this.icon != null)
        {
            this.icon.style_class = 'popup-menu-icon'; 
            this.addActor(this.icon);
        }

		if (place.isRemovable())
		{
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


function _makeLaunchContext(params)
{
    params = Params.parse(params, { workspace: -1,
                                    timestamp: 0 });

    let launchContext = global.create_app_launch_context();
    if (params.workspace != -1)
        launchContext.set_desktop(params.workspace);
    if (params.timestamp != 0)
        launchContext.set_timestamp(params.timestamp);

    return launchContext;
}

function _sortRecentItem(a, b)
{
	return Math.max(b.get_modified(), b.get_visited()) - Math.max(a.get_modified(), a.get_visited());
}

function _mountCallback(src, res, data)
{
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
        this._mon.connect("changed", 
        	Lang.bind(this,function(){this._createBookmarks();}));
        this._createBookmarks();
        this.menu.addMenuItem(this._bookMenu);
        
        this._mountMenu = new PopupMenu.PopupSubMenuMenuItem('Mounts');
        this._createMounts();
        Main.placesManager.connect('mounts-updated',
        	Lang.bind(this,function(){this._createMounts();}));
        this.menu.addMenuItem(this._mountMenu);
        
        this._recentManager = Gtk.RecentManager.get_default();
        this._recentList = new PopupMenu.PopupSubMenuMenuItem('Recently Used');
        this._recentManager.connect("changed", 
        	Lang.bind(this,function(){this._buildRecentList();}));
        this._buildRecentList();
        this.menu.addMenuItem(this._recentList);
        
    },
 
 	_addPlace : function(place, menu) 
 	{
        
        let icon = place.iconFactory(PLACE_ICON_SIZE);
        let item = new PopupMenuIconItem(place.name,icon);
        //item.addActor(icon, { align: St.Align.END });
        item.place = place;
        menu.addMenuItem(item);
        item.connect('activate', function(actor,event) {actor.place.launch();});
 	},
 	
 	_addMount : function(place, menu) 
 	{
        
		//let icon = place.iconFactory(PLACE_ICON_SIZE);
		let item = new PopupMenuButtonItem(place);
		//item.addActor(icon, { align: St.Align.END });
		item.place = place;
		menu.addMenuItem(item);
		item.connect('activate', function(actor,event) {actor.place.launch();});
	},
 
 
 	_addNoIconPlace : function(place, menu) 
 	{
        let item = new PopupMenu.PopupMenuItem(place.name);
        item.place = place;
        menu.addMenuItem(item);
        item.connect('activate', function(){});
 	},
 
    _createDefaultPlaces : function() {
        this.defaultPlaces = Main.placesManager.getDefaultPlaces();

        for (let placeid = 0; placeid < this.defaultPlaces.length; placeid++) {
            this._addPlace(this.defaultPlaces[placeid], this.menu);
        }
    }, 
    
    /* The existance of this function may warrant explanation. See, currently only LOCAL uris work, 
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
            
            if (bookmark.substring(0,4) != 'file')
            {
                let icon = Shell.util_get_icon_for_uri("network:///");
            	let item = new PlaceDisplay.PlaceInfo('bookmark:' + bookmark, label,
                function(size) {
                    return St.TextureCache.get_default().load_gicon(null, icon, size);
                },
                function(params) {
                    // HACK - we shouldn't depend on nautilus
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
        
        //this.bookmarks = Main.placesManager.getBookmarks();
        this.bookmarks = this._getBookmarks();

        for (let bookmarkid = 0; bookmarkid < this.bookmarks.length; bookmarkid++) {
            this._addPlace(this.bookmarks[bookmarkid], this._bookMenu.menu);
        }
        
        if (this.bookmarks.length == 0) this._bookMenu.actor.hide();
        else this._bookMenu.actor.show();
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
    	for (let i = 0; i < items.length && i < RECENT_NUMBER; i++)
    	{
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
    	for (let i = displayItems.length-1; i >= 0; i--)
        {
            this._addPlace(displayItems[i], this._recentList.menu);
        }
    	
    	this._recentList.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    	
        let clearitem = new PopupMenu.PopupMenuItem("Clear Recent");
        clearitem.connect("activate", 
        	Lang.bind(this,function(){this._recentManager.purge_items();}));
    	this._recentList.menu.addMenuItem(clearitem);
    	
    	if (items.length == 0)
    	{ 
    	    this._recentList.actor.reactive = false;
    	    this._recentList.label.style_class = "inactive-label";
    	    this._recentList._triangle.style_class = "inactive-label"
    	    //this._recentList.actor.hide();
    	}
    	else
    	{ 
    	    this._recentList.actor.reactive = true;
    	    this._recentList.label.style_class = "default-label";
    	    this._recentList._triangle.style_class = "default-label";
    	    //this._recentList.actor.show();
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
    button = new PlacesMenuButton();
}

function enable() {
    /* Remove Application Menu */
    //restoreState["applicationMenu"] = Main.panel._appMenu.actor;
    //Main.panel._leftBox.remove_actor(restoreState["applicationMenu"]);  

    /* Place the menu */
    Main.panel._leftBox.add(button.actor);
    Main.panel._menus.addMenu(button.menu); // Hack to make menu work ...
}

function disable() {
    /* Remove the extension menu */
    Main.panel._leftBox.remove_actor(button.actor);

    /* Restore Application Menu */
    //Main.panel._leftBox.add(restoreState["applicationMenu"]);  
}
