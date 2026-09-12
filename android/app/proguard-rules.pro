# Retrofit + kotlinx.serialization models are reflected over at runtime.
#
# R8 runs in full mode by default from AGP 8, which is more aggressive than the
# old ProGuard defaults: it will rename classes that only have their *members*
# kept, and strip generic signatures that Retrofit needs to work out what a
# suspend function returns. Both failures survive the build and appear only at
# runtime in a release APK, as a parse error on a response that is perfectly
# well formed — so these rules are deliberately broader than they look.

-keepattributes Signature, InnerClasses, EnclosingMethod, *Annotation*, AnnotationDefault

# ── Retrofit ────────────────────────────────────────────────────────────────
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
# A suspend function's return type lives in a generic signature R8 would drop.
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
# Service interfaces are implemented by a runtime proxy; their annotations and
# method signatures have to survive intact.
-keep,allowobfuscation interface com.fortunex.app.data.remote.FortuneXApi { *; }

# ── kotlinx.serialization ───────────────────────────────────────────────────
# The DTOs themselves: names AND members, because a generated serializer is
# looked up from the class it belongs to.
-keep class com.fortunex.app.data.remote.** { *; }
-keepclassmembers class com.fortunex.app.data.** { *; }

# Generated $serializer objects and the Companion that hands them out.
-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1> {
    static <1>$Companion Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-if @kotlinx.serialization.Serializable class **
-keep class <1>$$serializer { *; }

-dontnote kotlinx.serialization.**

# ── OkHttp ──────────────────────────────────────────────────────────────────
# Platform classes referenced only on JVMs we do not run on.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
