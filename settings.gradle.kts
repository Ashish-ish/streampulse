pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "streampulse"
include(":core")
include(":android:sdk")
include(":android:adapter-media3")
include(":android:sample")
