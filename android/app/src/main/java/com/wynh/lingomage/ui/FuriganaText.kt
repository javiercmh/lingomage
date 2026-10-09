package com.wynh.lingomage.ui

import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.text.selection.DisableSelection
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.Text
import androidx.compose.material3.LocalContentColor
import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.sp
import com.wynh.lingomage.story.Furigana
import com.wynh.lingomage.story.FuriganaPlacement

/** Canonical text stays separate from readings. Each compound is one inline layout unit. */
@Composable
fun FuriganaText(canonical: String, annotations: List<Furigana>, style: TextStyle, modifier: Modifier = Modifier) {
    SelectionContainer { SelectableFuriganaText(canonical, annotations, style, modifier) }
}

@Composable
private fun SelectableFuriganaText(canonical: String, annotations: List<Furigana>, style: TextStyle, modifier: Modifier) {
    if (annotations.isEmpty()) { Text(canonical, modifier, style = style); return }
    val placed = FuriganaPlacement.display(canonical, annotations)
    val resolvedStyle = style.copy(color = if (style.color == Color.Unspecified) LocalContentColor.current else style.color)
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    BoxWithConstraints(modifier) {
        val widthLimit = with(density) { maxWidth.roundToPx() }.coerceAtLeast(1)
        val readingSize = (style.fontSize.value * .55f).coerceAtLeast(11f).sp
        val readingStyle = resolvedStyle.copy(fontSize = readingSize, lineHeight = readingSize * 1.2f, textAlign = TextAlign.Center)
        val baseStyle = resolvedStyle.copy(lineHeight = style.fontSize * 1.25f, textAlign = TextAlign.Center)
        val content = mutableMapOf<String, InlineTextContent>()
        var tallest = 0
        val annotated = buildAnnotatedString {
            var offset = 0
            placed.forEachIndexed { index, annotation ->
                append(canonical.substring(offset, annotation.start))
                val surface = canonical.substring(annotation.start, annotation.end)
                val base = measurer.measure(surface, baseStyle, constraints = Constraints(maxWidth = widthLimit)).size
                val reading = measurer.measure(annotation.reading, readingStyle, constraints = Constraints(maxWidth = widthLimit)).size
                val width = maxOf(base.width, reading.width).coerceAtMost(widthLimit)
                val height = base.height + reading.height
                tallest = maxOf(tallest, height)
                val id = "ruby_$index"
                appendInlineContent(id, surface)
                content[id] = InlineTextContent(Placeholder(with(density) { width.toSp() }, with(density) { height.toSp() }, PlaceholderVerticalAlign.TextBottom)) {
                    DisableSelection { Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(annotation.reading, style = readingStyle)
                        Text(surface, style = baseStyle)
                    } }
                }
                offset = annotation.end
            }
            append(canonical.substring(offset))
        }
        val accessible = buildString {
            var offset = 0
            placed.forEach { annotation ->
                append(canonical.substring(offset, annotation.end)); append("（"); append(annotation.reading); append("）")
                offset = annotation.end
            }
            append(canonical.substring(offset))
        }
        BasicText(annotated, inlineContent = content,
            style = resolvedStyle.copy(lineHeight = with(density) { (tallest + 4.sp.roundToPx()).toSp() }),
            modifier = Modifier.clearAndSetSemantics { text = AnnotatedString(accessible) })
    }
}
