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
val schoolPackage = providers.gradleProperty("madrasty.applicationId")
val schoolVersionCode = providers.gradleProperty("madrasty.versionCode").map(String::toInt).orElse(1)
val schoolVersionName = providers.gradleProperty("madrasty.versionName").orElse("0.1.0")
val signingInputs = listOf("MADRASTY_ANDROID_KEYSTORE","MADRASTY_ANDROID_STORE_PASSWORD",
    "MADRASTY_ANDROID_KEY_ALIAS","MADRASTY_ANDROID_KEY_PASSWORD").map { providers.environmentVariable(it).orNull }
val requireSchoolSignature = providers.gradleProperty("madrasty.requireReleaseSignature").orNull == "true"

if (requireSchoolSignature) {
    require(signingInputs.all { !it.isNullOrBlank() }) { "School release signing inputs are incomplete." }
    require(schoolPackage.isPresent && URI.create(schoolApiOrigin).host != "localhost") {
        "Bind the permanent school package ID and HTTPS origin before signing."
    }
}

android {
    namespace = "de.madrasty.app"
    compileSdk = 37

    defaultConfig {
        applicationId = schoolPackage.orElse("de.madrasty.app.prelaunch").get()
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        minSdk = 26
        targetSdk = 37
        versionCode = schoolVersionCode.get()
        versionName = schoolVersionName.get()
        buildConfigField("String", "API_ORIGIN", "\"$schoolApiOrigin\"")
        manifestPlaceholders["appLinkHost"] = URI.create(schoolApiOrigin).host
    }

    if (requireSchoolSignature) {
        val schoolRelease = signingConfigs.create("schoolRelease") {
            storeFile = file(requireNotNull(signingInputs[0]))
            storePassword = signingInputs[1]
            keyAlias = signingInputs[2]
            keyPassword = signingInputs[3]
        }
        buildTypes.named("release") { signingConfig = schoolRelease }
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
    implementation(libs.okhttp)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test:runner:1.7.0")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
