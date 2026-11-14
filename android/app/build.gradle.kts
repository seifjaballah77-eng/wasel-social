plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "app.seifmessages"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.seifmessages"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }
}
dependencies {
    implementation("com.google.android.gms:play-services-nearby:19.3.0")
    implementation("androidx.activity:activity-ktx:1.10.0")
    implementation("androidx.core:core-ktx:1.15.0")
}
