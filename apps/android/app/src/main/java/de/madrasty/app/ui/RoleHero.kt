package de.madrasty.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import de.madrasty.app.R

@Composable
fun RoleHero(persona: Persona, title: String, detail: String, action: String, onAction: () -> Unit) {
    val (background, artwork) = when (persona) {
        Persona.Admin -> Color(0xFF2355A0) to R.drawable.notebook_admin
        Persona.Teacher -> Color(0xFF096656) to R.drawable.notebook_teacher
        Persona.Guardian -> Color(0xFFA84647) to R.drawable.notebook_guardian
    }
    Row(
        Modifier.fillMaxWidth().background(background, RoundedCornerShape(24.dp)).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CompositionLocalProvider(LocalContentColor provides Color.White) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(title, Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
                Text(detail)
                Button(
                    onClick = onAction,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (persona == Persona.Teacher) Color(0xFFD6F668) else Color.White,
                        contentColor = Color(0xFF172C37),
                    ),
                ) { Text(action) }
            }
        }
        if (LocalDensity.current.fontScale < 1.5f) Image(painterResource(artwork), null, Modifier.width(94.dp))
    }
}
