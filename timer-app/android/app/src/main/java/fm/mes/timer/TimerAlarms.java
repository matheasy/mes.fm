package fm.mes.timer;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/** Alarm scheduling, notification channels and the ringing notification for MES Timer (shared by the plugin, the receiver and the alarm screen). */
public final class TimerAlarms {
    public static final String CH_RUN = "mes-timer-running";
    public static final String CH_RING = "mes-timer-ring";
    public static final String CH_PLAIN = "mes-timer-plain";
    static final String PREFS = "mes-timer-alarms";
    static final String ACTION_FIRE = "fm.mes.timer.FIRE";
    static final String ACTION_STOP = "fm.mes.timer.STOP";
    static final String ACTION_SNOOZE = "fm.mes.timer.SNOOZE";
    static final int RING_ID = 4242;

    private TimerAlarms() {}

    public static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel run = new NotificationChannel(CH_RUN, "Running timers", NotificationManager.IMPORTANCE_LOW);
        run.setDescription("Shows a running countdown or stopwatch in the status bar and on the lock screen");
        run.setShowBadge(false);
        run.setSound(null, null);
        nm.createNotificationChannel(run);
        NotificationChannel ring = new NotificationChannel(CH_RING, "Alarms and finished timers", NotificationManager.IMPORTANCE_HIGH);
        ring.setDescription("Rings when a countdown, alarm, Pomodoro phase or workout finishes");
        ring.setSound(soundUri(c), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        ring.enableVibration(true);
        ring.setVibrationPattern(new long[]{0, 600, 400, 600, 400, 600});
        ring.setBypassDnd(true);
        ring.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ring);
        NotificationChannel plain = new NotificationChannel(CH_PLAIN, "Timer phases", NotificationManager.IMPORTANCE_HIGH);
        plain.setDescription("Short alerts: interval WORK / REST changes, or every alert when \"ring like an alarm\" is off");
        plain.enableVibration(true);
        plain.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(plain);
    }

    static Uri soundUri(Context c) { return Uri.parse("android.resource://" + c.getPackageName() + "/" + R.raw.mes_alarm); }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static PendingIntent firePi(Context c, int id, JSONObject item) {
        Intent i = new Intent(c, TimerReceiver.class).setAction(ACTION_FIRE).putExtra("item", item.toString()).putExtra("id", id);
        return PendingIntent.getBroadcast(c, 9000 + id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent openAppPi(Context c) {
        Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** items: [{at, title, body, ring}] ; replaces every alarm scheduled before. */
    public static void schedule(Context c, JSONArray items, boolean ringStyle) {
        cancelAll(c);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        int n = 0;
        for (int k = 0; k < items.length() && n < 60; k++) {
            JSONObject it = items.optJSONObject(k);
            if (it == null) continue;
            long at = it.optLong("at");
            if (at <= System.currentTimeMillis()) continue;
            try { it.put("ringStyle", ringStyle); } catch (Exception ignored) {}
            PendingIntent pi = firePi(c, n, it);
            boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
            try {
                if (it.optBoolean("ring") && exact) am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, openAppPi(c)), pi);
                else if (exact && Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                else if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                else am.set(AlarmManager.RTC_WAKEUP, at, pi);
            } catch (SecurityException e) {
                am.set(AlarmManager.RTC_WAKEUP, at, pi);
            }
            n++;
        }
        JSONArray kept = new JSONArray();
        for (int k = 0; k < items.length(); k++) kept.put(items.opt(k));
        prefs(c).edit().putString("items", kept.toString()).putBoolean("ringStyle", ringStyle).putInt("n", n).apply();
    }

    public static void cancelAll(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        int n = Math.max(prefs(c).getInt("n", 0), 60);
        for (int k = 0; k < n; k++) {
            Intent i = new Intent(c, TimerReceiver.class).setAction(ACTION_FIRE);
            PendingIntent pi = PendingIntent.getBroadcast(c, 9000 + k, i, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (pi != null) { am.cancel(pi); pi.cancel(); }
        }
        prefs(c).edit().remove("items").putInt("n", 0).apply();
    }

    /** After a reboot: put back what is still in the future. */
    public static void restore(Context c) {
        try {
            String s = prefs(c).getString("items", null);
            if (s != null) schedule(c, new JSONArray(s), prefs(c).getBoolean("ringStyle", true));
        } catch (Exception ignored) {}
    }

    /** Called by the receiver at the alarm time. */
    public static void fire(Context c, JSONObject it) {
        channels(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        String title = it.optString("title", "Time is up");
        String body = it.optString("body", "");
        boolean ring = it.optBoolean("ring") && it.optBoolean("ringStyle", true);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, ring ? CH_RING : CH_PLAIN) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_timer).setContentTitle(title).setContentText(body).setAutoCancel(true)
            .setContentIntent(openAppPi(c)).setColor(0xFFA86706).setShowWhen(true).setWhen(System.currentTimeMillis())
            .setVisibility(Notification.VISIBILITY_PUBLIC);
        if (ring) {
            Intent full = new Intent(c, AlarmActivity.class).putExtra("item", it.toString()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
            PendingIntent fullPi = PendingIntent.getActivity(c, 2, full, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.setCategory(Notification.CATEGORY_ALARM).setFullScreenIntent(fullPi, true).setOngoing(true).setAutoCancel(false);
            Intent stop = new Intent(c, TimerReceiver.class).setAction(ACTION_STOP);
            Intent snooze = new Intent(c, TimerReceiver.class).setAction(ACTION_SNOOZE).putExtra("item", it.toString());
            b.addAction(new Notification.Action.Builder(null, "Stop", PendingIntent.getBroadcast(c, 3, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build());
            b.addAction(new Notification.Action.Builder(null, "Snooze 5 min", PendingIntent.getBroadcast(c, 4, snooze, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build());
            if (Build.VERSION.SDK_INT < 26) { b.setSound(soundUri(c)); b.setPriority(Notification.PRIORITY_MAX); }
            Notification n = b.build();
            n.flags |= Notification.FLAG_INSISTENT;   // the sound repeats until Stop / Snooze
            nm.notify(RING_ID, n);
        } else {
            b.setCategory(Notification.CATEGORY_REMINDER);
            if (Build.VERSION.SDK_INT < 26) { b.setDefaults(Notification.DEFAULT_ALL); b.setPriority(Notification.PRIORITY_HIGH); }
            nm.notify(5000 + (int) (it.optLong("at") % 1000), b.build());
        }
    }

    public static void stopRinging(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(RING_ID);
    }

    public static void snooze(Context c, JSONObject it) {
        stopRinging(c);
        try {
            it.put("at", System.currentTimeMillis() + 5 * 60000L);
            it.put("body", "Snoozed 5 minutes. " + it.optString("body", ""));
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            PendingIntent pi = firePi(c, 59, it);
            if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setAlarmClock(new AlarmManager.AlarmClockInfo(it.getLong("at"), openAppPi(c)), pi);
            else am.set(AlarmManager.RTC_WAKEUP, it.getLong("at"), pi);
        } catch (Exception ignored) {}
    }
}
