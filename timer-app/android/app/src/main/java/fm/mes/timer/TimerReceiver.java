package fm.mes.timer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

public class TimerReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        if (a == null) return;
        try {
            if (TimerAlarms.ACTION_FIRE.equals(a)) TimerAlarms.fire(c, new JSONObject(i.getStringExtra("item")));
            else if (TimerAlarms.ACTION_STOP.equals(a)) TimerAlarms.stopRinging(c);
            else if (TimerAlarms.ACTION_SNOOZE.equals(a)) TimerAlarms.snooze(c, new JSONObject(i.getStringExtra("item")));
            else if (Intent.ACTION_BOOT_COMPLETED.equals(a) || "android.intent.action.MY_PACKAGE_REPLACED".equals(a)) TimerAlarms.restore(c);
        } catch (Exception ignored) {}
    }
}
