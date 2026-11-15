package fm.mes.timer;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Keeps the running timers' notifications ticking once a second (the big time, the time in the status-bar icon, the Android 16
 * chip text) while the app's page is in the background, where Android freezes it. Runs only while something is running; paused
 * timers are plain notifications. Foreground service type specialUse (see the manifest).
 */
public class TimerService extends Service {
    private static TimerService live;
    private final Handler h = new Handler(Looper.getMainLooper());
    private int fgId = 0;
    private int tickN = 0;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!step()) return;
            long now = System.currentTimeMillis();
            h.postDelayed(this, 1000 - now % 1000 + 15);   // just after each whole second
        }
    };

    static void stopIfRunning(Context c) {
        if (live != null) live.finish();
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onCreate() { super.onCreate(); live = this; TimerAlarms.channels(this); }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!goForeground()) { finish(); return START_NOT_STICKY; }
        h.removeCallbacks(tick);
        h.post(tick);
        return START_NOT_STICKY;
    }

    /** startForeground on the soonest running item's notification. */
    private boolean goForeground() {
        JSONArray a = TimerLive.items(this);
        long now = System.currentTimeMillis();
        boolean big = TimerLive.bigStyle(this);
        JSONObject first = null;
        for (int i = 0; i < a.length(); i++) {
            JSONObject it = a.optJSONObject(i);
            if (!"run".equals(it.optString("st")) || TimerLive.finished(it, now)) continue;
            if (first == null || ("s".equals(first.optString("kind")) && !"s".equals(it.optString("kind")))) first = it;
        }
        if (first == null) return false;
        int id = TimerLive.idFor(first.optString("key"));
        Notification n = TimerLive.build(this, first, now, big);
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(id, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(id, n);
        } catch (Exception e) { return false; }
        fgId = id;
        return true;
    }

    /** One tick. Returns false when the service stopped. */
    private boolean step() {
        long now = System.currentTimeMillis();
        JSONArray a = TimerLive.items(this);
        boolean any = false, drop = false;
        JSONArray keep = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject it = a.optJSONObject(i);
            if (TimerLive.finished(it, now)) { drop = true; continue; }   // the phone alarm takes over at 0
            keep.put(it);
            if ("run".equals(it.optString("st"))) any = true;
        }
        if (drop) TimerLive.saveItems(this, keep);
        if (!any) { finish(); return false; }
        // no updates while the screen is off: nobody sees them (posted again within a second of the screen turning on)
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null && !pm.isInteractive()) return true;
        tickN++;
        // more than 4 running notifications would pass Android's 5-updates-a-second limit: then each updates every other second
        if (keep.length() > 4 && tickN % 2 == 0) return true;
        int want = fgIdFor(keep, now);
        if (want != fgId && want != 0) goForeground();
        TimerLive.postAll(this);
        return true;
    }

    private int fgIdFor(JSONArray a, long now) {
        JSONObject first = null;
        for (int i = 0; i < a.length(); i++) {
            JSONObject it = a.optJSONObject(i);
            if (!"run".equals(it.optString("st"))) continue;
            if (first == null || ("s".equals(first.optString("kind")) && !"s".equals(it.optString("kind")))) first = it;
        }
        return first == null ? 0 : TimerLive.idFor(first.optString("key"));
    }

    void finish() {
        h.removeCallbacks(tick);
        try {
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_DETACH); else stopForeground(false);
        } catch (Exception ignored) {}
        fgId = 0;
        stopSelf();
        TimerLive.postAll(this);   // paused ones again as plain, swipeable notifications; finished ones removed
    }

    @Override public void onDestroy() { h.removeCallbacks(tick); if (live == this) live = null; super.onDestroy(); }
}
