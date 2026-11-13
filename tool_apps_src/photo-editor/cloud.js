/* ☁ Cloud for the Photo Editor: keep a project (.mesproj) saved to a synced folder, Dropbox, OneDrive or Google Drive
   (main_js/cloud-files.js, the same button and window as /excel, /docx, /text). While a project is linked to the cloud,
   Save project / Ctrl+S save it there and changes are saved by themselves; the local "linked file" saving (projects.js) is
   used when it is not. The cloud has its own "changed" mark (d.__cRev / d.__cSaved) because PE.dirty means "not in the
   project file". */
(function () {
	"use strict";
	var PE = window.PE; if (!PE || !window.MESCloud) return;
	var top = document.getElementById("pe-copy"); if (!top) return;
	function base() { return (PE.docBaseName ? PE.docBaseName() : (PE.doc && PE.doc.name) || "image").replace(/\.mesproj$/i, ""); }
	var cloud = window.MESCloud.attach({
		app: "photo", folder: "MES Apps/Photo", what: "project", title: "Photo", defExt: "mesproj", btnClass: "pe-btn", before: top,
		toast: function (m) { PE.toast(m); },
		exts: [".mesproj"],
		accept: [{ description: "MES Photo Editor project", accept: { "application/zip": [".mesproj"] } }],
		doc: function () { return PE.doc; },
		name: function () { return base() + ".mesproj"; },
		writeName: function (n) { return /\.mesproj$/i.test(n || "") ? n : String(n || "image").replace(/\.[A-Za-z0-9]{1,8}$/, "") + ".mesproj"; },
		bytes: function (d) {
			if (d !== PE.doc) return Promise.reject(new Error("That project was closed."));
			if (PE.flushPending) PE.flushPending();
			d.__cTry = d.__cRev || 0;
			return PE.projectBlob().then(function (b) { return b.arrayBuffer(); }).then(function (ab) { return new Uint8Array(ab); });
		},
		open: function (u8, name) {
			return PE.loadProject(u8.slice().buffer, name, { file: name }).then(function () { if (PE.setTool) PE.setTool("move"); PE.doc.__cRev = PE.doc.__cSaved = 0; return PE.doc; });
		},
		dirty: function (d) { return d.__mcl ? (d.__cRev || 0) !== (d.__cSaved || 0) : !!(PE.dirty && PE.hist.stack.length > 1); },
		markDirty: function (d) { d.__cRev = (d.__cRev || 0) + 1; PE.dirty = true; if (PE.saveState) PE.saveState(); },
		saved: function (d) { d.__cSaved = d.__cTry != null ? d.__cTry : d.__cRev || 0; if (!(PE.projectLink && PE.projectLink())) { PE.dirty = false; } if (PE.saveState) PE.saveState(); },
		replaces: true
	});
	PE.cloud = cloud;
	// every undo step counts as a change for the cloud copy
	PE.on("history", function () { var d = PE.doc; if (!d) return; d.__cRev = (d.__cRev || 0) + 1; if (cloud.linked(d)) cloud.changed(d); });
	// Save project / Ctrl+S: to the cloud when this project is linked there, else the usual (linked file / Save as / download)
	var orig = PE.saveProject;
	PE.saveProject = function () { if (PE.doc && cloud.save(PE.doc)) return; return orig.apply(this, arguments); };
})();
