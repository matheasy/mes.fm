package fm.mes.timer;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.reflect.Method;
import java.util.Locale;

/**
 * Live status of running / paused timers, kept natively so the notification can tick and its buttons work while the app's
 * page is frozen in the background.
 *
 * Items (from native.js, keys = the page's own keys):
 *   {key:"t:<id>", kind:"t", label, st:"run"|"pause", end, rem, total, mute}       countdown
 *   {key:"s:<id>", kind:"s", label, st, startAt, base}                              stopwatch
 *   {key:"po",     kind:"po", label, phase, st, end, rem, mute}                     Pomodoro
 *   {key:"iv",     kind:"iv", label, st, startAt, base, segs:[[title, ms],...], mute} interval workout
 * A button press changes the item here (and the phone alarms), and is recorded in "changes" (final state per key) for the page
 * to take over (native.js: takeChanges on resume, or the "liveChanged" event while the page runs).
 *
 * Look: style "big" = custom body with the time as the big first line + the time drawn in the status-bar icon (Samsung and
 * phones without Android 16 Live Updates); "chip" = standard notification whose title is the time, promoted to an Android 16
 * Live Update (status-bar chip). "auto" picks.
 */
final class TimerLive {
    static final String PREFS = "mes-timer-live";
    static final String ACTION = "fm.mes.timer.LIVE";
    static final int BASE = 7000;
    private TimerLive() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static JSONArray items(Context c) { try { return new JSONArray(prefs(c).getString("items", "[]")); } catch (Exception e) { return new JSONArray(); } }
    static JSONObject obj(Context c, String k) { try { return new JSONObject(prefs(c).getString(k, "{}")); } catch (Exception e) { return new JSONObject(); } }
    static void saveItems(Context c, JSONArray a) { prefs(c).edit().putString("items", a.toString()).apply(); }

    static int idFor(String key) { return BASE + 1 + Math.abs(key.hashCode() % 900); }

    /** The page's list. Keys with a button change the page has not taken yet keep the native state. */
    static void setItems(Context c, JSONArray incoming, String style) {
        JSONObject ch = obj(c, "changes");
        JSONArray old = items(c), out = new JSONArray();
        for (int i = 0; i < incoming.length(); i++) {
            JSONObject it = incoming.optJSONObject(i);
            if (it == null) continue;
            String key = it.optString("key");
            if (ch.has(key)) {
                JSONObject o = find(old, key);
                if (o != null) out.put(o);
                continue;
            }
            out.put(it);
        }
        // a key changed by a button but not in the page's list any more (e.g. paused natively, the page still says idle): keep it
        java.util.Iterator<String> ks = ch.keys();
        while (ks.hasNext()) { String k = ks.next(); if (find(out, k) == null) { JSONObject o = find(old, k); if (o != null && !"gone".equals(o.optString("st"))) out.put(o); } }
        prefs(c).edit().putString("items", out.toString()).putString("style", style == null ? "auto" : style).apply();
    }

    static JSONObject find(JSONArray a, String key) {
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && key.equals(o.optString("key"))) return o; }
        return null;
    }

    static boolean anyRunning(Context c) {
        JSONArray a = items(c);
        for (int i = 0; i < a.length(); i++) if ("run".equals(a.optJSONObject(i).optString("st"))) return true;
        return false;
    }

    /* ---------- time ---------- */
    /** Milliseconds shown: left for countdown-like items, elapsed for a stopwatch. For an interval workout: left in this phase. */
    static long shownMs(JSONObject it, long now) {
        String k = it.optString("kind"), st = it.optString("st");
        boolean run = "run".equals(st);
        if ("s".equals(k)) return it.optLong("base") + (run ? now - it.optLong("startAt") : 0);
        if ("iv".equals(k)) { long[] seg = ivSeg(it, now); return seg == null ? 0 : seg[1]; }
        return run ? Math.max(0, it.optLong("end") - now) : Math.max(0, it.optLong("rem"));
    }

    /** {index of the phase, ms left in it} or null when the workout is over. */
    static long[] ivSeg(JSONObject it, long now) {
        JSONArray segs = it.optJSONArray("segs");
        if (segs == null) return null;
        long el = it.optLong("base") + ("run".equals(it.optString("st")) ? now - it.optLong("startAt") : 0), acc = 0;
        for (int i = 0; i < segs.length(); i++) {
            acc += segs.optJSONArray(i).optLong(1);
            if (el < acc) return new long[]{i, acc - el};
        }
        return null;
    }

    static boolean finished(JSONObject it, long now) {
        String k = it.optString("kind");
        if (!"run".equals(it.optString("st")) || "s".equals(k)) return false;
        if ("iv".equals(k)) return ivSeg(it, now) == null;
        return it.optLong("end") <= now;
    }

    static String fmt(long ms, boolean up) {
        long s = up ? ms / 1000 : (ms + 999) / 1000, h = s / 3600, m = s % 3600 / 60, r = s % 60;
        return h > 0 ? String.format(Locale.US, "%d:%02d:%02d", h, m, r) : String.format(Locale.US, "%02d:%02d", m, r);
    }

    /** Short text for the status-bar icon: 4:59, 59:59, 1h05, 12h. */
    static String iconText(long ms, boolean up) {
        long s = up ? ms / 1000 : (ms + 999) / 1000, h = s / 3600, m = s % 3600 / 60, r = s % 60;
        if (h >= 10) return h + "h";
        if (h > 0) return h + "h" + String.format(Locale.US, "%02d", m);
        return m + ":" + String.format(Locale.US, "%02d", r);
    }

    static String title(JSONObject it, long now) {
        String k = it.optString("kind"), label = it.optString("label", "");
        if ("iv".equals(k)) {
            long[] seg = ivSeg(it, now);
            JSONArray segs = it.optJSONArray("segs");
            String ph = seg == null || segs == null ? "Done" : segs.optJSONArray((int) seg[0]).optString(0);
            return label.isEmpty() ? ph : ph + " · " + label;
        }
        if (!label.isEmpty()) return label;
        return "s".equals(k) ? "Stopwatch" : "po".equals(k) ? "Pomodoro" : "Countdown";
    }

    /* ---------- notifications ---------- */
    static boolean bigStyle(Context c) {
        String st = prefs(c).getString("style", "auto");
        if ("big".equals(st)) return true;
        if ("chip".equals(st)) return false;
        return !promotable(c) || "samsung".equalsIgnoreCase(Build.MANUFACTURER);
    }

    static boolean promotable(Context c) {
        if (Build.VERSION.SDK_INT < 36) return false;
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            return (Boolean) NotificationManager.class.getMethod("canPostPromotedNotifications").invoke(nm);
        } catch (Exception e) { return false; }
    }

    static PendingIntent actPi(Context c, String key, String act) {
        Intent i = new Intent(c, TimerReceiver.class).setAction(ACTION).putExtra("key", key).putExtra("act", act);
        return PendingIntent.getBroadcast(c, (key + act).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static Notification build(Context c, JSONObject it, long now, boolean big) {
        String key = it.optString("key"), k = it.optString("kind");
        boolean run = "run".equals(it.optString("st")), up = "s".equals(k);
        long ms = shownMs(it, now);
        String time = fmt(ms, up), name = title(it, now), sub = run ? name : "Paused · " + name;
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, TimerAlarms.CH_RUN) : new Notification.Builder(c);
        b.setContentTitle(time).setContentText(sub).setOnlyAlertOnce(true).setShowWhen(false)
            .setContentIntent(TimerAlarms.openAppPi(c)).setColor(0xFFA86706).setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(up ? Notification.CATEGORY_STOPWATCH : Notification.CATEGORY_PROGRESS)
            .setOngoing(run)                                    // paused: swipe it away to hide it (the timer stays paused in the app)
            .setDeleteIntent(actPi(c, key, "hide"))
            .setSortKey((run ? (up ? "1" : "0") : "2") + String.format(Locale.US, "%013d", up ? 0 : ms));   // countdowns (soonest first), stopwatches, paused
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
        if (big) {
            b.setSmallIcon(textIcon(c, iconText(ms, up)));
            if (Build.VERSION.SDK_INT >= 24) {
                RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.notif_timer);
                v.setTextViewText(R.id.nt_time, time);
                v.setTextViewText(R.id.nt_label, sub);
                b.setStyle(new Notification.DecoratedCustomViewStyle()).setCustomContentView(v).setCustomBigContentView(v);
            }
        } else {
            b.setSmallIcon(R.drawable.ic_stat_timer);
            if (run) promote(b, time);
        }
        // buttons, like the phone's own Clock app: Pause / Resume, Cancel, Sound on / off
        b.addAction(new Notification.Action.Builder(null, run ? "Pause" : "Resume", actPi(c, key, run ? "pause" : "resume")).build());
        b.addAction(new Notification.Action.Builder(null, "Cancel", actPi(c, key, "cancel")).build());
        if (!up) b.addAction(new Notification.Action.Builder(null, it.optBoolean("mute") ? "Sound on" : "Sound off", actPi(c, key, "mute")).build());
        return b.build();
    }

    static void promote(Notification.Builder b, String chip) {
        if (Build.VERSION.SDK_INT < 36) return;
        try {
            Method m = Notification.Builder.class.getMethod("setRequestPromotedOngoing", boolean.class);
            m.invoke(b, true);
            Method t = Notification.Builder.class.getMethod("setShortCriticalText", String.class);
            t.invoke(b, chip);
        } catch (Exception ignored) {}
    }

    /** The time drawn as the status-bar icon (white on transparent: the status bar tints it). */
    static Icon textIcon(Context c, String text) {
        int px = Math.max(48, Math.round(24 * c.getResources().getDisplayMetrics().density));
        Bitmap bm = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bm);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(0xFFFFFFFF);
        p.setTypeface(Typeface.create("sans-serif-condensed", Typeface.BOLD));
        p.setTextAlign(Paint.Align.CENTER);
        float size = px * 0.62f;
        p.setTextSize(size);
        float w = p.measureText(text);
        if (w > px * 0.98f) { size *= px * 0.98f / w; p.setTextSize(size); }
        Paint.FontMetrics fm = p.getFontMetrics();
        cv.drawText(text, px / 2f, px / 2f - (fm.ascent + fm.descent) / 2f, p);
        return Icon.createWithBitmap(bm);
    }

    /** Post every item (the service passes its own foreground id so that one is left to startForeground). */
    static void postAll(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        JSONArray a = items(c);
        JSONObject hidden = obj(c, "hidden"), posted = obj(c, "posted");
        JSONObject nowPosted = new JSONObject();
        long now = System.currentTimeMillis();
        boolean big = bigStyle(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject it = a.optJSONObject(i);
            String key = it.optString("key");
            if ("gone".equals(it.optString("st")) || finished(it, now)) continue;
            if (sig(it).equals(hidden.optString(key, "\u0000"))) continue;
            try {
                nm.notify(idFor(key), build(c, it, now, big));
                nowPosted.put(key, 1);
            } catch (Exception ignored) {}
        }
        java.util.Iterator<String> ks = posted.keys();
        while (ks.hasNext()) { String k = ks.next(); if (!nowPosted.has(k)) nm.cancel(idFor(k)); }
        // anything else of ours on screen that is no longer a shown timer (e.g. left behind when the ticking service moved to
        // another timer's notification) goes too
        java.util.HashSet<Integer> want = new java.util.HashSet<>();
        java.util.Iterator<String> wk = nowPosted.keys();
        while (wk.hasNext()) want.add(idFor(wk.next()));
        try {
            for (android.service.notification.StatusBarNotification sb : nm.getActiveNotifications()) {
                int id = sb.getId();
                if (id > BASE && id <= BASE + 901 && !want.contains(id)) nm.cancel(id);
            }
        } catch (Exception ignored) {}
        prefs(c).edit().putString("posted", nowPosted.toString()).apply();
    }

    static String sig(JSONObject it) { return it.optString("st") + "|" + it.optLong("rem") + "|" + it.optLong("base") + "|" + it.optLong("end") + "|" + it.optLong("startAt"); }

    static void clearAll(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        JSONObject posted = obj(c, "posted");
        java.util.Iterator<String> ks = posted.keys();
        while (ks.hasNext()) nm.cancel(idFor(ks.next()));
        for (int k = 0; k < 8; k++) nm.cancel(BASE + k);   // ids used by version 1.0.1
        prefs(c).edit().putString("items", "[]").putString("posted", "{}").apply();
    }

    /* ---------- buttons ---------- */
    static void action(Context c, String key, String act) {
        JSONArray a = items(c);
        JSONObject it = find(a, key);
        if (it == null) return;
        long now = System.currentTimeMillis();
        String k = it.optString("kind");
        try {
            if ("hide".equals(act)) {
                JSONObject h = obj(c, "hidden"); h.put(key, sig(it));
                prefs(c).edit().putString("hidden", h.toString()).apply();
                return;
            }
            if ("pause".equals(act) && "run".equals(it.optString("st"))) {
                if ("s".equals(k) || "iv".equals(k)) it.put("base", it.optLong("base") + now - it.optLong("startAt"));
                else it.put("rem", Math.max(0, it.optLong("end") - now));
                it.put("st", "pause");
                TimerAlarms.holdKey(c, key, now);
            } else if ("resume".equals(act) && "pause".equals(it.optString("st"))) {
                if ("s".equals(k) || "iv".equals(k)) it.put("startAt", now);
                else it.put("end", now + it.optLong("rem"));
                it.put("st", "run");
                if (!TimerAlarms.releaseKey(c, key, now) && !TimerStatusPlugin.visible) TimerAlarms.addOne(c, finishAlarm(it, now));
            } else if ("cancel".equals(act)) {
                it.put("st", "gone");
                TimerAlarms.dropKey(c, key);
            } else if ("mute".equals(act)) {
                it.put("mute", !it.optBoolean("mute"));
                TimerAlarms.muteKey(c, key, it.optBoolean("mute"));
            } else return;
            JSONObject ch = obj(c, "changes");
            JSONObject rec = new JSONObject(it.toString());
            rec.remove("segs");
            rec.put("at", now);
            ch.put(key, rec);
            JSONObject h = obj(c, "hidden"); h.remove(key);
            prefs(c).edit().putString("changes", ch.toString()).putString("hidden", h.toString()).apply();
            if ("gone".equals(it.optString("st"))) {
                JSONArray out = new JSONArray();
                for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i) != it) out.put(a.optJSONObject(i));
                a = out;
            }
            saveItems(c, a);
        } catch (Exception ignored) {}
        refresh(c);
        TimerStatusPlugin.changed();
    }

    /** The alarm for the end of a running item (countdown / Pomodoro phase / whole workout). */
    static JSONObject finishAlarm(JSONObject it, long now) {
        try {
            String k = it.optString("kind"), label = it.optString("label", "");
            JSONObject a = new JSONObject().put("key", it.optString("key")).put("ring", true).put("mute", it.optBoolean("mute"));
            if ("t".equals(k)) return a.put("at", it.optLong("end")).put("title", (label.isEmpty() ? "" : label + ": ") + "Time is up").put("body", "Countdown finished.");
            if ("po".equals(k)) return a.put("at", it.optLong("end")).put("title", label.isEmpty() ? "Pomodoro phase finished" : label + " finished").put("body", "");
            if ("iv".equals(k)) {
                JSONArray segs = it.optJSONArray("segs");
                long tot = 0;
                for (int i = 0; segs != null && i < segs.length(); i++) tot += segs.optJSONArray(i).optLong(1);
                long el = it.optLong("base") + now - it.optLong("startAt");
                return a.put("at", now + Math.max(0, tot - el)).put("title", (label.isEmpty() ? "" : label + ": ") + "Workout done").put("body", "");
            }
        } catch (Exception ignored) {}
        return null;
    }

    /** Start / update / stop the ticking service as needed. */
    static void refresh(Context c) {
        if (anyRunning(c)) {
            Intent i = new Intent(c, TimerService.class);
            try {
                if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
                return;
            } catch (Exception e) { /* not allowed right now: post without ticking */ }
        } else {
            TimerService.stopIfRunning(c);
        }
        postAll(c);
    }

    /** The page takes the button changes over. */
    static JSONObject takeChanges(Context c) {
        JSONObject ch = obj(c, "changes");
        prefs(c).edit().putString("changes", "{}").apply();
        return ch;
    }
}
