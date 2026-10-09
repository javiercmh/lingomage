package com.wynh.lingomage

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wynh.lingomage.story.Furigana
import com.wynh.lingomage.ui.FuriganaText
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.*

class FuriganaReaderTest {
    @get:Rule val compose = createComposeRule()
    @Test fun compoundsAndReadingsRemainAccessibleAtLargeFontAndNarrowWidth() {
        compose.setContent {
            MaterialTheme {
                CompositionLocalProvider(LocalDensity provides Density(LocalDensity.current.density, 2f)) {
                    Column(Modifier.width(180.dp)) {
                        FuriganaText("学校へ行く。学校へ行く。", listOf(Furigana(0,2,"がっこう"), Furigana(3,5,"いく"), Furigana(6,8,"がっこう"), Furigana(9,11,"いく")),
                            MaterialTheme.typography.bodyLarge.copy(fontSize = 22.sp), Modifier.testTag("ruby"))
                    }
                }
            }
        }
        compose.onNodeWithText("学校（がっこう）へ行（い）く。学校（がっこう）へ行（い）く。").assertIsDisplayed()
        val bounds = compose.onNodeWithTag("ruby").fetchSemanticsNode().boundsInRoot
        assertTrue(bounds.height > bounds.width)
    }
}
