package fm.mes.timer;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.text.DateFormat;
import java.util.Date;

/** Full-screen "time is up" screen shown over the lock screen, like a phone's own alarm clock. */
public class AlarmActivity extends Activity {
    private JSONObject item;

    @Override
    protected void onCreate(Bundle s) {
        super.onCreate(s);
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        try { item = new JSONObject(getIntent().getStringExtra("item")); } catch (Exception e) { item = new JSONObject(); }

        float d = getResources().getDisplayMetrics().density;
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.rgb(40, 24, 4));
        root.setPadding((int) (28 * d), (int) (40 * d), (int) (28 * d), (int) (40 * d));

        TextView clock = text(DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date()), 64, true);
        TextView title = text(item.optString("title", "Time is up"), 28, true);
        TextView body = text(item.optString("body", ""), 18, false);
        body.setAlpha(0.85f);
        root.addView(clock); root.addView(space(d, 18)); root.addView(title); root.addView(space(d, 8)); root.addView(body); root.addView(space(d, 44));

        Button stop = button("Stop", Color.rgb(246, 155, 20), Color.rgb(30, 18, 2), d);
        stop.setOnClickListener(v -> { TimerAlarms.stopRinging(this); finish(); });
        Button snooze = button("Snooze 5 min", Color.argb(40, 255, 255, 255), Color.WHITE, d);
        snooze.setOnClickListener(v -> { TimerAlarms.snooze(this, item); finish(); });
        Button open = button("Open MES Timer", Color.TRANSPARENT, Color.WHITE, d);
        open.setOnClickListener(v -> {
            TimerAlarms.stopRinging(this);
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && km != null) km.requestDismissKeyguard(this, null);
            startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            finish();
        });
        root.addView(stop); root.addView(space(d, 14)); root.addView(snooze); root.addView(space(d, 14)); root.addView(open);
        setContentView(root);
    }

    private TextView text(String s, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(sp); t.setTextColor(Color.WHITE); t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private View space(float d, int dp) { View v = new View(this); v.setLayoutParams(new LinearLayout.LayoutParams(1, (int) (dp * d))); return v; }

    private Button button(String s, int bg, int fg, float d) {
        Button b = new Button(this);
        b.setText(s); b.setAllCaps(false); b.setTextSize(20); b.setTextColor(fg);
        GradientDrawable g = new GradientDrawable(); g.setColor(bg); g.setCornerRadius(40 * d);
        if (bg == Color.TRANSPARENT) g.setStroke((int) (1.5f * d), Color.argb(150, 255, 255, 255));
        b.setBackground(g);
        b.setLayoutParams(new LinearLayout.LayoutParams((int) (260 * d), (int) (60 * d)));
        return b;
    }

    @Override
    public void onBackPressed() { TimerAlarms.stopRinging(this); super.onBackPressed(); }
}
