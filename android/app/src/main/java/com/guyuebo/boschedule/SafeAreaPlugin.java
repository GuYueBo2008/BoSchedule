package com.guyuebo.boschedule;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 把原生 WindowInsets 以 CSS 像素形式提供给网页层。
 * 网页在启动时主动查询一次，并监听后续变化（旋转、导航栏模式切换等），
 * 避免依赖 WebView 注入变量的时机。
 */
@CapacitorPlugin(name = "SafeArea")
public class SafeAreaPlugin extends Plugin {
    private static SafeAreaPlugin instance;
    private static float top;
    private static float bottom;
    private static float left;
    private static float right;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void get(PluginCall call) {
        call.resolve(snapshot());
    }

    static void updateInsets(float topPx, float bottomPx, float leftPx, float rightPx) {
        if (top == topPx && bottom == bottomPx && left == leftPx && right == rightPx) return;
        top = topPx;
        bottom = bottomPx;
        left = leftPx;
        right = rightPx;
        SafeAreaPlugin plugin = instance;
        if (plugin != null && plugin.getBridge() != null) {
            plugin.notifyListeners("change", snapshot());
        }
    }

    private static JSObject snapshot() {
        JSObject insets = new JSObject();
        insets.put("top", top);
        insets.put("bottom", bottom);
        insets.put("left", left);
        insets.put("right", right);
        return insets;
    }
}
