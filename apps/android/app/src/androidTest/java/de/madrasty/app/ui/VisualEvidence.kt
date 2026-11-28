package de.madrasty.app.ui

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import org.junit.Assert.assertTrue

/** Synthetic instrumentation evidence only. Downloads survive Gradle's APK teardown. */
internal fun saveVisualEvidence(context: Context, bitmap: Bitmap, name: String, stage: String) {
    check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
    require(stage in setOf("before", "after"))
    require(name.matches(Regex("[a-z0-9-]+\\.png")))
    val font = if (context.resources.configuration.fontScale >= 1.95f) "large-text" else "normal"
    val resolver = context.contentResolver
    val uri = requireNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, name)
        put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/madrasty-foundation-qa/$font/$stage")
        put(MediaStore.MediaColumns.IS_PENDING, 1)
    }))
    try {
        requireNotNull(resolver.openOutputStream(uri)).use { assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        check(resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null) == 1)
    } catch (failure: Throwable) {
        resolver.delete(uri, null, null)
        throw failure
    }
}
