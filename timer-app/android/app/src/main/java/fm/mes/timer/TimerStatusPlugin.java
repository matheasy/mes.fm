package fm.mes.timer;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;


/**
 * MES Timer native helper.
 *  showRunning({items, style}) / clearRunning() / takeChanges(): live notifications of running and paused timers (TimerLive,
 *    ticked by TimerService), with Pause / Resume, Cancel and Sound buttons; the "liveChanged" event fires when one is pressed.
 * schedule({items:[{at,title,body,ring}], ringStyle}), cancel(), status(), openSettings({what}).
 */
@CapacitorPlugin(name = "TimerStatus")
public class TimerStatusPlugin extends Plugin {

    @Override
    public void load() { inst = this; TimerAlarms.channels(getContext()); }

    private static TimerStatusPlugin inst;
    /** Is the app on screen (then the page rings by itself and no phone alarms are wanted). */
    static volatile boolean visible = true;

    @Override protected void handleOnResume() { visible = true; super.handleOnResume(); }
    @Override protected void handleOnPause() { visible = false; super.handleOnPause(); }

    /** A notification button changed a timer: tell the page if it is listening (it also asks with takeChanges on resume). */
    static void changed() {
        TimerStatusPlugin p = inst;
        if (p != null) { try { p.notifyListeners("liveChanged", new JSObject()); } catch (Exception ignored) {} }
    }

    /** items: see TimerLive. style: auto | big | chip. */
    @PluginMethod
    public void showRunning(PluginCall call) {
        inst = this;
        try {
            TimerLive.setItems(getContext(), new JSONArray(call.getArray("items", new JSArray()).toString()), call.getString("style", "auto"), call.getString("icon", "stack"));
            TimerLive.refresh(getContext());
        } catch (Exception e) { call.reject(e.getMessage()); return; }
        call.resolve();
    }

    @PluginMethod
    public void clearRunning(PluginCall call) {
        TimerService.stopIfRunning(getContext());
        TimerLive.clearAll(getContext());
        call.resolve();
    }

    /** Button changes the page has not taken yet: {changes: {key: item}}. */
    @PluginMethod
    public void takeChanges(PluginCall call) {
        inst = this;
        JSObject r = new JSObject();
        try { r.put("changes", new JSObject(TimerLive.takeChanges(getContext()).toString())); } catch (Exception e) { r.put("changes", new JSObject()); }
        call.resolve(r);
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        try {
            JSArray a = call.getArray("items", new JSArray());
            TimerAlarms.schedule(getContext(), new JSONArray(a.toString()), call.getBoolean("ringStyle", true));
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        TimerAlarms.cancelAll(getContext());
        TimerAlarms.stopRinging(getContext());
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext();
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        JSObject r = new JSObject();
        r.put("notifications", Build.VERSION.SDK_INT < 24 || nm.areNotificationsEnabled());
        r.put("exact", Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms());
        r.put("fullScreen", Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent());
        boolean promo = false;
        if (Build.VERSION.SDK_INT >= 36) { try { promo = (Boolean) NotificationManager.class.getMethod("canPostPromotedNotifications").invoke(nm); } catch (Exception ignored) {} }
        r.put("liveUpdates", promo);
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("big", TimerLive.bigStyle(c));
        r.put("samsung", "samsung".equalsIgnoreCase(Build.MANUFACTURER));
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Context c = getContext();
        String what = call.getString("what", "app");
        Intent i;
        if ("fullScreen".equals(what) && Build.VERSION.SDK_INT >= 34) i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + c.getPackageName()));
        else if ("promoted".equals(what) && Build.VERSION.SDK_INT >= 36) i = new Intent("android.settings.APP_NOTIFICATION_PROMOTION_SETTINGS").putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName());
        else if ("exact".equals(what) && Build.VERSION.SDK_INT >= 31) i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + c.getPackageName()));
        else if (Build.VERSION.SDK_INT >= 26) i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName());
        else i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { c.startActivity(i); } catch (Exception e) {
            c.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve();
    }
}
