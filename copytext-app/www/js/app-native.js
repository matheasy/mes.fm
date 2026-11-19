/* Native clipboard + file saving for the app (Capacitor). Loaded before copy-text.js. */
(function(){
  var C = window.Capacitor;
  function native(){ return !!(C && C.isNativePlatform && C.isNativePlatform() && C.nativePromise); }
  if (!native()) return;
  var clip = {
    writeText: function(t){ return C.nativePromise("Clipboard", "write", { string: String(t) }).then(function(){}); },
    readText: function(){ return C.nativePromise("Clipboard", "read", {}).then(function(r){ return (r && r.value) || ""; }); }
  };
  /* <a download> of a blob does nothing in the WebView: hand the file to the share sheet instead (Save to Files, Drive, mail...) */
  window.MESAppSave = function(name, text, type){
    var safe = String(name || "copy-text.txt").replace(/[\\/:*?"<>|]+/g, "-");
    C.nativePromise("Filesystem", "writeFile", { path: safe, data: String(text), directory: "CACHE", encoding: "utf8", recursive: true })
      .then(function(r){ return C.nativePromise("Share", "share", { title: safe, files: [r.uri], dialogTitle: "Save " + safe }); })
      .catch(function(e){
        var m = String(e && e.message || e || "");
        if (/cancel/i.test(m)) return;
        alert("Could not save the file here (" + m + "). Use \u201cCopy all\u201d instead.");
      });
    return true;
  };
  try { Object.defineProperty(navigator, "clipboard", { value: clip, configurable: true }); }
  catch (e) { try { navigator.clipboard.writeText = clip.writeText; navigator.clipboard.readText = clip.readText; } catch (x) {} }
})();
