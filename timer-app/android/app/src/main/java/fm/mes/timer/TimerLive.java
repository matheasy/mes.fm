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
    static void setItems(Context c, JSONArray incoming, String style, String icon) {
        prefs(c).edit().putString("icon", "full".equals(icon) ? "full" : "big").apply();
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
        if (style != null && !style.equals(prefs(c).getString("lastStyle", ""))) prefs(c).edit().putString("lastStyle", style).putLong("chipFail", 0).apply();
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

    /**
     * What the status-bar icon shows, as parts of [text, size] (size 1 = digits as tall as the icon, smaller = a unit letter
     * sitting on the baseline). The icon is a small square, so fewer characters = bigger digits.
     *   "big" (default): seconds under a minute (45s), then whole minutes (5m, countdowns round up like the Clock app),
     *                    then hours (2h). The exact time is in the notification.
     *   "full":          4:59, 59:59, 1h05 (squeezed, so smaller).
     */
    static Object[][] iconParts(long ms, boolean up, String fmtMode) {
        long s = up ? ms / 1000 : (ms + 999) / 1000, h = s / 3600, m = s % 3600 / 60, r = s % 60;
        if ("full".equals(fmtMode)) {
            if (h >= 10) return new Object[][]{{String.valueOf(h), 1f}, {"h", .55f}};
            if (h > 0) return new Object[][]{{String.valueOf(h), 1f}, {"h", .55f}, {String.format(Locale.US, "%02d", m), 1f}};
            return new Object[][]{{String.valueOf(m), 1f}, {":", 1f}, {String.format(Locale.US, "%02d", r), 1f}};
        }
        if (s < 60) return new Object[][]{{String.valueOf(s), 1f}, {"s", .55f}};   // a unit on every value, so it never looks like the clock
        long mins = up ? s / 60 : (s + 59) / 60;
        if (mins < 100) return new Object[][]{{String.valueOf(mins), 1f}, {"m", .55f}};
        long hrs = up ? s / 3600 : (s + 3599) / 3600;
        return new Object[][]{{String.valueOf(hrs), 1f}, {"h", .55f}};
    }

    static String iconFmt(Context c) { return prefs(c).getString("icon", "big"); }

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
        // Automatic: an Android 16 Live Update (a chip with the timer icon and the time, like the phone's own Clock app) wherever
        // the system lets this app post one. Samsung's One UI 8+ shows Live Updates in its status bar and Now Bar too. If the
        // system turns the request down (the FLAG_PROMOTED_ONGOING check in postAll), fall back to the big style for a day.
        if (!promotable(c)) return true;
        // Samsung: One UI grants the request (the flag is set) but its status bar shows no chip for other apps' Live Updates
        // (seen on an S25 on 2026-11-17: only the plain timer icon, the time small in the shade). So on Samsung, Automatic
        // always uses the time-in-the-icon style, which always shows in the status bar. "chip" can still be picked by hand.
        if ("samsung".equalsIgnoreCase(Build.MANUFACTURER)) return true;
        return System.currentTimeMillis() - prefs(c).getLong("chipFail", 0) < 24L * 3600 * 1000;
    }


    static final int FLAG_PROMOTED_ONGOING = 0x00040000;

    /** After posting in chip style: did the system really promote it? Returns false when it was turned down. */
    static boolean chipGranted(NotificationManager nm, int id) {
        try {
            for (android.service.notification.StatusBarNotification sb : nm.getActiveNotifications())
                if (sb.getId() == id) return (sb.getNotification().flags & FLAG_PROMOTED_ONGOING) != 0;
        } catch (Exception ignored) {}
        return true;
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
            b.setSmallIcon(textIcon(c, iconParts(ms, up, iconFmt(c))));
            if (Build.VERSION.SDK_INT >= 24) {
                RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.notif_timer);
                v.setTextViewText(R.id.nt_time, time);
                v.setTextViewText(R.id.nt_label, sub);
                b.setStyle(new Notification.DecoratedCustomViewStyle()).setCustomContentView(v).setCustomBigContentView(v);
            }
        } else {
            b.setSmallIcon(R.drawable.ic_stat_timer);
            if (run) {
                // the chip shows the timer icon + a chronometer the system itself ticks (smooth, never a second late)
                long when = up ? now - ms : now + ms;
                // the chronometer IS the time here, so the title is the name (otherwise the time shows twice)
                b.setContentTitle(name).setContentText(null);
                b.setShowWhen(true).setWhen(when).setUsesChronometer(true);
                if (!up && Build.VERSION.SDK_INT >= 24) b.setChronometerCountDown(true);
                promote(b);
            }
        }
        // buttons, like the phone's own Clock app: Pause / Resume, Cancel, Sound on / off
        b.addAction(new Notification.Action.Builder(null, run ? "Pause" : "Resume", actPi(c, key, run ? "pause" : "resume")).build());
        b.addAction(new Notification.Action.Builder(null, "Cancel", actPi(c, key, "cancel")).build());
        if (!up) b.addAction(new Notification.Action.Builder(null, it.optBoolean("mute") ? "Sound on" : "Sound off", actPi(c, key, "mute")).build());
        return b.build();
    }

    static void promote(Notification.Builder b) {
        if (Build.VERSION.SDK_INT < 36) return;
        try {
            Method m = Notification.Builder.class.getMethod("setRequestPromotedOngoing", boolean.class);
            m.invoke(b, true);
        } catch (Exception ignored) {}
    }

    /**
     * The time drawn as the status-bar icon (white on transparent: the status bar tints it). Android fits every notification
     * icon into a small square and draws nothing wider, so the digits are cropped to their own ink (no font padding), as tall as
     * the square, in a condensed bold font; the colon is drawn narrow; text still too wide is squeezed sideways.
     */
    static Icon textIcon(Context c, Object[][] parts) {
        int px = Math.max(64, Math.round(24 * c.getResources().getDisplayMetrics().density));
        Bitmap bm = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bm);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(0xFFFFFFFF);
        p.setTypeface(Typeface.create("sans-serif-condensed", Typeface.BOLD));
        android.graphics.Rect r = new android.graphics.Rect();
        p.setTextSize(100f);
        p.getTextBounds("0123456789", 0, 10, r);
        float size = px * 100f / r.height();             // digits exactly as tall as the icon
        float gap = size * 0.03f;                        // between parts
        // widths at scaleX 1 (ink widths, so no side bearings are wasted)
        int n = parts.length;
        float[] w = new float[n], left = new float[n];
        float total = 0;
        for (int i = 0; i < n; i++) {
            String t = (String) parts[i][0];
            p.setTextSize(size * (Float) parts[i][1]);
            p.getTextBounds(t, 0, t.length(), r);
            w[i] = r.width(); left[i] = r.left;
            if (":".equals(t)) w[i] += gap * 5;           // room round the colon, or 2:54 reads as 254
            total += w[i] + (i > 0 ? gap : 0);
        }
        float sx = total > px ? px / total : 1f;
        float x = (px - total * sx) / 2f;
        for (int i = 0; i < n; i++) {
            String t = (String) parts[i][0];
            p.setTextSize(size * (Float) parts[i][1]);
            p.setTextScaleX(sx);
            float pad = ":".equals(t) ? gap * 2.5f * sx : 0;
            cv.drawText(t, x + pad - left[i] * sx, px, p);    // baseline on the bottom edge: digits fill the square top to bottom
            x += (w[i] + gap) * sx;
        }
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
                if (!big && "run".equals(it.optString("st")) && !chipGranted(nm, idFor(key))) {
                    prefs(c).edit().putLong("chipFail", now).apply();
                    big = true;
                    nm.notify(idFor(key), build(c, it, now, true));
                }
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
