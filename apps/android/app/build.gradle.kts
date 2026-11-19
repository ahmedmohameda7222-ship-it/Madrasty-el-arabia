import java.net.URI

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

fun httpsOrigin(value: String): String {
    if (value.isBlank()) return ""
    val uri = URI.create(value)
    require(uri.scheme == "https" && uri.host != null && uri.userInfo == null &&
        uri.rawQuery == null && uri.rawFragment == null && uri.path.orEmpty() in listOf("", "/"))
    return value.trimEnd('/')
}
val schoolApiOrigin = httpsOrigin(providers.gradleProperty("madrasty.apiOrigin").orElse("https://localhost").get())

android {
    namespace = "de.madrasty.app"
    compileSdk = 37

    defaultConfig {
        applicationId = providers.gradleProperty("madrasty.applicationId")
            .orElse("de.madrasty.app.prelaunch").get()
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "API_ORIGIN", "\"$schoolApiOrigin\"")
        manifestPlaceholders["appLinkHost"] = URI.create(schoolApiOrigin).host
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.material3)
}
