# Capacitor core rules
-keep class com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class ** {
    @com.getcapacitor.annotation.CapPlugin *;
}

# WebView JS bridge (no custom interfaces used, keep defaults)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor plugin reflection
-keepclasseswithmembernames class * {
    native <methods>;
}
-keepclassmembers class * extends com.getcapacitor.Plugin {
    public <methods>;
}

# Don't warn for missing classes in Cordova/legacy libs
-dontwarn org.apache.cordova.**
-dontwarn com.ionicframework.**

# Optimize: strip debug info but keep line numbers for crashlytics
# -keepattributes SourceFile,LineNumberTable

# Remove unused AndroidX code
-dontwarn androidx.**
