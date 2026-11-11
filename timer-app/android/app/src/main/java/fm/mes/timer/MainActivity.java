package fm.mes.timer;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TimerStatusPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
