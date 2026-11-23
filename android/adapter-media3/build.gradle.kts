plugins {
    id("com.android.library")
    kotlin("android")
}

kotlin {
    jvmToolchain(21)
}

android {
    namespace = "dev.streampulse.media3"
    compileSdk = 35

    defaultConfig {
        minSdk = 23
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
}

dependencies {
    api(project(":core"))
    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-common:1.5.1")
}
