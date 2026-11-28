package de.madrasty.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
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
fun RoleHero(persona: Persona, title: String, detail: String, action: String, onAction: () -> Unit) =
    RoleHeroContent(persona,title,detail,action,emptyList(),false,onAction)

@Composable
fun AdminRoleHero(title:String,detail:String,action:String,highlights:List<String>,onAction:()->Unit) =
    RoleHeroContent(Persona.Admin,title,detail,action,highlights,true,onAction)

@Composable
private fun RoleHeroContent(persona: Persona, title: String, detail: String, action: String,
    highlights:List<String>, emphasizeDetail:Boolean,onAction: () -> Unit) {
    val (roleColor, artwork) = when (persona) {
        Persona.Admin -> Color(0xFF173F39) to R.drawable.notebook_admin
        Persona.Teacher -> Color(0xFF195345) to R.drawable.notebook_teacher
        Persona.Guardian -> Color(0xFF733F46) to R.drawable.notebook_guardian
    }
    val background = if (LocalSchoolDarkTheme.current) MaterialTheme.colorScheme.surface else roleColor
    Row(
        Modifier.fillMaxWidth().background(background, RoundedCornerShape(30.dp)).padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CompositionLocalProvider(LocalContentColor provides Color.White) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(title, Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
                Text(detail,style=if(emphasizeDetail)MaterialTheme.typography.titleLarge else MaterialTheme.typography.bodyLarge)
                highlights.forEach{Text(it,style=MaterialTheme.typography.bodySmall)}
                Button(
                    onClick = onAction,
                    modifier = Modifier.heightIn(min = 48.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (persona == Persona.Teacher) Color(0xFFD6EF8A) else Color.White,
                        contentColor = Color(0xFF20311F),
                    ),
                ) { Text(action) }
            }
        }
        if (LocalDensity.current.fontScale < 1.5f) Image(painterResource(artwork), null, Modifier.width(94.dp))
    }
}
