package fm.mes.audio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

import java.io.File;

/** Foreground service (type microphone) that owns the MediaRecorder, so recording keeps going with the screen off or the app in the background. */
public class RecService extends Service {
    static final String CH = "recording";
    static RecService current;
    static String lastPath;
    static String lastError;
    private MediaRecorder rec;
    private String path;
    long started;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        current = this;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
            NotificationChannel c = new NotificationChannel(CH, "Recording", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Shown while MES Audio is recording");
            nm.createNotificationChannel(c);
        }
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CH)
                .setSmallIcon(R.drawable.ic_stat_rec)
                .setContentTitle("Recording")
                .setContentText("MES Audio is recording. Tap to open it and stop.")
                .setOngoing(true).setUsesChronometer(true).setWhen(System.currentTimeMillis())
                .setContentIntent(pi).setCategory(NotificationCompat.CATEGORY_SERVICE).build();
        int type = Build.VERSION.SDK_INT >= 30 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : 0;
        ServiceCompat.startForeground(this, 41, n, type);
        startRecorder();
        return START_NOT_STICKY;
    }

    private void startRecorder() {
        if (rec != null) return;
        lastError = null; lastPath = null;
        try {
            File f = new File(getCacheDir(), "rec-" + System.currentTimeMillis() + ".m4a");
            path = f.getAbsolutePath();
            rec = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
            rec.setAudioSource(MediaRecorder.AudioSource.MIC);
            rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            rec.setAudioSamplingRate(48000);
            rec.setAudioEncodingBitRate(160000);
            rec.setAudioChannels(1);
            rec.setOutputFile(path);
            rec.prepare();
            rec.start();
            started = SystemClock.elapsedRealtime();
        } catch (Exception e) {
            lastError = e.getMessage() == null ? e.toString() : e.getMessage();
            try { if (rec != null) rec.release(); } catch (Exception ignored) {}
            rec = null; stopSelf();
        }
    }

    boolean recording() { return rec != null; }

    int amp() { try { return rec != null ? rec.getMaxAmplitude() : 0; } catch (Exception e) { return 0; } }

    /** Stops and returns the file path (null when nothing was recorded). */
    String finish() {
        String p = null;
        if (rec != null) {
            try { rec.stop(); p = path; } catch (Exception e) { lastError = "recording too short"; }
            try { rec.release(); } catch (Exception ignored) {}
            rec = null;
        }
        lastPath = p;
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
        return p;
    }

    @Override public void onDestroy() {
        if (rec != null) finish();
        if (current == this) current = null;
        super.onDestroy();
    }
}
