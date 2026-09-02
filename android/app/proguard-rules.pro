# Retrofit + kotlinx.serialization models are reflected over at runtime.
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keepattributes Signature, InnerClasses, *Annotation*
-keepclassmembers class com.fortunex.app.data.** { *; }
