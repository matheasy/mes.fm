package fm.mes.upscale;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppSavePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
