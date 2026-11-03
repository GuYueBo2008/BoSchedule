package com.guyuebo.boschedule;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LanScanPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
