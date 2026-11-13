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

import java.lang.reflect.Method;

/**
 * MES Timer native helper.
 *  showRunning({items:[{key, title, end?, start?, text?}]}): one ongoing notification per running countdown (end = epoch ms,
 *    counts down) or stopwatch (start = epoch ms, counts up); paused items pass a fixed text. On Android 16 they are requested as
 *    promoted "Live Updates", so the countdown also shows as a chip in the status bar.
 *  clearRunning(), schedule({items:[{at,title,body,ring}], ringStyle}), cancel(), status(), openSettings({what}).
 */
@CapacitorPlugin(name = "TimerStatus")
public class TimerStatusPlugin extends Plugin {
    private static final int RUN_BASE = 7000;
    private int shown = 0;

    @Override
    public void load() { TimerAlarms.channels(getContext()); }

    @PluginMethod
    public void showRunning(PluginCall call) {
        Context c = getContext();
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        JSArray items = call.getArray("items", new JSArray());
        int n = 0;
        try {
            for (int k = 0; k < items.length() && n < 8; k++) {
                JSONObject it = items.getJSONObject(k);
                Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, TimerAlarms.CH_RUN) : new Notification.Builder(c);
                b.setSmallIcon(R.drawable.ic_stat_timer).setContentTitle(it.optString("title", "Timer")).setOngoing(true).setOnlyAlertOnce(true)
                    .setContentIntent(TimerAlarms.openAppPi(c)).setColor(0xFFA86706).setVisibility(Notification.VISIBILITY_PUBLIC)
                    .setCategory(it.has("start") ? Notification.CATEGORY_STOPWATCH : Notification.CATEGORY_PROGRESS);
                if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
                if (it.has("end")) {
                    b.setWhen(it.getLong("end")).setShowWhen(true).setUsesChronometer(true);
                    if (Build.VERSION.SDK_INT >= 24) b.setChronometerCountDown(true);
                    b.setContentText(it.optString("text", "Counting down"));
                } else if (it.has("start")) {
                    b.setWhen(it.getLong("start")).setShowWhen(true).setUsesChronometer(true);
                    b.setContentText(it.optString("text", "Stopwatch running"));
                } else {
                    b.setShowWhen(false).setContentText(it.optString("text", "Paused"));
                }
                promote(b, it.optString("chip", ""));
                nm.notify(RUN_BASE + n, b.build());
                n++;
            }
        } catch (Exception e) { call.reject(e.getMessage()); return; }
        for (int k = n; k < Math.max(shown, 8); k++) nm.cancel(RUN_BASE + k);
        shown = n;
        call.resolve();
    }

    /** Android 16 Live Updates: ask for the notification to be promoted (status-bar chip). Reflection keeps older SDKs happy. */
    private static void promote(Notification.Builder b, String chip) {
        if (Build.VERSION.SDK_INT < 36) return;
        try {
            Method m = Notification.Builder.class.getMethod("setRequestPromotedOngoing", boolean.class);
            m.invoke(b, true);
            if (chip != null && !chip.isEmpty()) {
                Method t = Notification.Builder.class.getMethod("setShortCriticalText", String.class);
                t.invoke(b, chip);
            }
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void clearRunning(PluginCall call) {
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        for (int k = 0; k < 8; k++) nm.cancel(RUN_BASE + k);
        shown = 0;
        call.resolve();
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
