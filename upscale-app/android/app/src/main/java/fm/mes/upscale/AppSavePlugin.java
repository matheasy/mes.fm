package fm.mes.upscale;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * MES app save helper (Android):
 *  saveBegin({name}), saveChunk({data: base64}), saveEnd({mode: "share" | "save" | "download", mime, folder}) - a finished file to the share
 *  sheet, or saved into the phone's gallery (Pictures/<folder>) for images and Download/<folder> for anything else
 *  (MediaStore, Android 10+; older phones get the share sheet).
 */
@CapacitorPlugin(name = "AppSave")
public class AppSavePlugin extends Plugin {
    private File out;
    private String outName;

    @PluginMethod
    public void saveBegin(PluginCall call) {
        String name = call.getString("name", "file");
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
        String mode = call.getString("mode", "share"), mime = call.getString("mime", "application/octet-stream");
        String folder = call.getString("folder", "MES");
        JSObject r = new JSObject();
        if (("save".equals(mode) || "download".equals(mode)) && Build.VERSION.SDK_INT >= 29) {
            boolean img = "save".equals(mode) && mime.startsWith("image/");
            try {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, outName);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, (img ? "Pictures/" : "Download/") + folder);
                Uri base = img ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI : MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                Uri u = getContext().getContentResolver().insert(base, v);
                if (u == null) throw new Exception("could not create the file");
                try (InputStream in = new FileInputStream(out); OutputStream os = getContext().getContentResolver().openOutputStream(u)) {
                    byte[] b = new byte[65536]; int n; while ((n = in.read(b)) > 0) os.write(b, 0, n);
                }
                r.put("msg", (img ? "Saved to your gallery (Pictures / " : "Saved to Downloads / ") + folder + "): " + outName);
                r.put("saved", true);
                call.resolve(r); return;
            } catch (Exception e) { r.put("msg", "Could not save (" + e.getMessage() + "), opened the share sheet instead"); }
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
