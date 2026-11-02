# Capacitor 8 — keep only reflective plugin entry points
# (Rules from @capacitor/android/proguard-rules.pro, cleaned up for no-plugins use.)

# v3 plugins: annotated classes with plugin method annotations
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.Permission <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin { *; }

# v2 plugins (deprecated, still supported)
-keep @com.getcapacitor.NativePlugin public class * {
    @com.getcapacitor.PluginMethod public <methods>;
}

# Cordova plugin rules — included for safety even though cordova-android-plugins
# subproject is conditionally excluded in settings.gradle when no plugins exist.
-keep public class * extends org.apache.cordova.* {
    public <methods>;
    public <fields>;
}

# Standard WebView JS bridge — needed for Android API compatibility
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclasseswithmembernames class * {
    native <methods>;
}

# AndroidX keep rules — keep component entry points referenced by Manifest
-keep class * extends android.app.Activity
-keep class * extends android.app.Service
-keep class * extends android.content.BroadcastReceiver
-keep class * extends android.content.ContentProvider

# Strip Kotlin stdlib metadata if Kotlin runtime somehow gets pulled in
# (org.jetbrains.kotlin:kotlin-stdlib is NOT required for pure Java Capacitor)
-assumenosideeffects class kotlin.jvm.internal.Intrinsics {
    public static void checkNotNullExpressionValue(...);
    public static void checkNotNull(...);
    public static void checkParameterIsNotNull(...);
    public static void checkFieldIsNotNull(...);
    public static void checkPropertyIsNotNull(...);
    public static void throwNpe(...);
    public static void throwIllegalParameter(...);
    public static void throwIllegalState(...);
    public static void throwUndefinedForReified(...);
    public static void throwMarker(...);
}
