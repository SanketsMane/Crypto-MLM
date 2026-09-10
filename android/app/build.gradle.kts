import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.fortunex.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.fortunex.app"
        // Android 8.0. Below this there is no Keystore StrongBox and no
        // reliable biometric prompt, and both are load-bearing for a step-up.
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    /**
     * Release signing, read from a properties file that is NEVER committed.
     *
     * An unsigned release APK is not installable, so without this `assembleRelease`
     * produced a file that could only be thrown away. Credentials come from
     * `keystore.properties` (or the matching environment variables, for CI), and
     * the block is skipped entirely when neither is present — so a checkout with
     * no keystore still builds debug rather than failing to configure.
     *
     * Keep the .jks and its passwords safe and permanent: Play Store updates must
     * be signed with the same key, and losing it means publishing a new listing.
     */
    val keystoreProps = Properties().apply {
        val f = rootProject.file("keystore.properties")
        if (f.exists()) f.inputStream().use { load(it) }
    }
    val storePathValue = keystoreProps.getProperty("storeFile") ?: System.getenv("FX_STORE_FILE")
    val hasKeystore = storePathValue != null && rootProject.file(storePathValue).exists()

    signingConfigs {
        if (hasKeystore) {
            create("release") {
                storeFile = rootProject.file(storePathValue!!)
                storePassword = keystoreProps.getProperty("storePassword") ?: System.getenv("FX_STORE_PASSWORD")
                keyAlias = keystoreProps.getProperty("keyAlias") ?: System.getenv("FX_KEY_ALIAS")
                keyPassword = keystoreProps.getProperty("keyPassword") ?: System.getenv("FX_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            // The emulator reaches the host machine on 10.0.2.2.
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:4000/api/v1/\"")
        }
        release {
            if (hasKeystore) signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // The live platform. This previously named api.fortunex.com — a
            // .com the project does not own and which does not resolve, so
            // every request from a release build failed. The API is served by
            // the same host as the site, behind Caddy at /api/*.
            buildConfigField("String", "API_BASE_URL", "\"https://fortunex.cx/api/v1/\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
    buildFeatures { compose = true; buildConfig = true }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons)
    debugImplementation(libs.androidx.ui.tooling)

    implementation(libs.hilt.android)
    implementation(libs.hilt.navigation.compose)
    ksp(libs.hilt.compiler)

    implementation(libs.retrofit)
    implementation(libs.retrofit.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    testImplementation(libs.junit)
}
