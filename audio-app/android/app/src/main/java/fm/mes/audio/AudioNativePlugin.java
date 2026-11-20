package fm.mes.audio;

import android.Manifest;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * MES Audio native helper (Android):
 *  start() - asks for the microphone, starts RecService (foreground, keeps recording with the screen off).
 *  level() - {db} of the loudest sample since the last call.  stop() - {path} of the .m4a (cache dir).  remove({path}).
 *  saveBegin({name}), saveChunk({data: base64}), saveEnd({mode: "share" | "save", mime}) - a finished export to the share sheet
 *  or to Downloads (MediaStore, Android 10+; older phones get the share sheet).
 */
@CapacitorPlugin(name = "AudioNative", permissions = {
        @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notify", strings = { "android.permission.POST_NOTIFICATIONS" })
})
public class AudioNativePlugin extends Plugin {
    private File out;
    private String outName;

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) {
            if (Build.VERSION.SDK_INT >= 33) requestPermissionForAliases(new String[] { "mic", "notify" }, call, "micDone");
            else requestPermissionForAlias("mic", call, "micDone");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void micDone(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) { call.reject("Microphone access is off. Turn it on in Settings > Apps > MES Audio > Permissions."); return; }
        begin(call);
    }

    private void begin(PluginCall call) {
        Intent i = new Intent(getContext(), RecService.class);
        ContextCompat.startForegroundService(getContext(), i);
        final Handler h = new Handler(Looper.getMainLooper());
        final long t0 = System.currentTimeMillis();
        h.postDelayed(new Runnable() {
            public void run() {
                RecService s = RecService.current;
                if (s != null && s.recording()) { call.resolve(); return; }
                if (RecService.lastError != null) { call.reject("Could not start recording: " + RecService.lastError); return; }
                if (System.currentTimeMillis() - t0 > 4000) { call.reject("Could not start recording"); return; }
                h.postDelayed(this, 60);
            }
        }, 60);
    }

    @PluginMethod
    public void level(PluginCall call) {
        RecService s = RecService.current; JSObject r = new JSObject();
        int a = s != null ? s.amp() : 0;
        r.put("db", a > 0 ? 20 * Math.log10(a / 32767.0) : -90);
        r.put("recording", s != null && s.recording());
        call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        RecService s = RecService.current;
        String p = s != null ? s.finish() : RecService.lastPath;
        if (p == null) { call.reject(RecService.lastError != null ? RecService.lastError : "nothing was recorded"); return; }
        JSObject r = new JSObject(); r.put("path", p); call.resolve(r);
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String p = call.getString("path");
        if (p != null && p.startsWith(getContext().getCacheDir().getAbsolutePath())) new File(p).delete();
        call.resolve();
    }

    /** readChunk({path, offset, length}) -> {data: base64, size}: the page reads a recording in pieces. */
    @PluginMethod
    public void readChunk(PluginCall call) {
        String p = call.getString("path");
        if (p == null || !p.startsWith(getContext().getCacheDir().getAbsolutePath())) { call.reject("no such recording"); return; }
        File f = new File(p); int off = call.getInt("offset", 0), len = call.getInt("length", 2097152);
        try (java.io.RandomAccessFile r = new java.io.RandomAccessFile(f, "r")) {
            r.seek(off); int n = (int) Math.max(0, Math.min(len, f.length() - off)); byte[] b = new byte[n]; r.readFully(b);
            JSObject o = new JSObject(); o.put("data", Base64.encodeToString(b, Base64.NO_WRAP)); o.put("size", f.length()); call.resolve(o);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void saveBegin(PluginCall call) {
        String name = call.getString("name", "audio");
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
        File dir = new File(getContext().getCacheDir(), "out");
        dir.mkdirs();
        File[] old = dir.listFiles(); if (old != null) for (File f : old) f.delete();
        out = new File(dir, name); outName = name;
        try { new FileOutputStream(out).close(); call.resolve(); } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void saveChunk(PluginCall call) {
        if (out == null) { call.reject("saveBegin first"); return; }
        try (FileOutputStream o = new FileOutputStream(out, true)) {
            o.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT)); call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void saveEnd(PluginCall call) {
        if (out == null) { call.reject("saveBegin first"); return; }
        String mode = call.getString("mode", "share"), mime = call.getString("mime", "audio/*");
        JSObject r = new JSObject();
        if ("save".equals(mode) && Build.VERSION.SDK_INT >= 29) {
            try {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, outName);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/MES Audio");
                Uri u = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (u == null) throw new Exception("could not create the file");
                try (InputStream in = new FileInputStream(out); OutputStream os = getContext().getContentResolver().openOutputStream(u)) {
                    byte[] b = new byte[65536]; int n; while ((n = in.read(b)) > 0) os.write(b, 0, n);
                }
                r.put("msg", "Saved to Downloads / MES Audio: " + outName);
                call.resolve(r); return;
            } catch (Exception e) { r.put("msg", "Could not save to Downloads (" + e.getMessage() + "), opened the share sheet instead"); }
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", out);
        Intent send = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_TITLE, outName).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent ch = Intent.createChooser(send, "Share " + outName);
        ch.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(ch);
        if (!r.has("msg")) r.put("msg", "Opened the share sheet for " + outName);
        call.resolve(r);
    }
}
