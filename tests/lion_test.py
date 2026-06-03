#!/usr/bin/env python3
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(
    0, str(Path(__file__).resolve().parent.parent)
)

from utils.lion import FALLBACK_LANGUAGE, I18n, init_i18n


class LionI18nTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name)
        self.locales_dir = self.base_dir / "locales"
        self.locales_dir.mkdir(parents=True, exist_ok=True)
        self.tm_path = self.base_dir / "cache" / "local-tm.json"

        self.source_json = {
            "app": {
                "loading_text": "Loading map…",
                "search_placeholder": "Search location…",
            },
            "streamlit": {
                "sidebar": {
                    "view_landmarks": "View {count} Landmarks",
                },
                "errors": {
                    "fetch_landmarks": "Error fetching landmarks: {error}",
                },
            },
        }
        self.target_json = {
            "app": {
                "loading_text": "載入地圖…",
                "search_placeholder": "搜尋此位置…",
            },
            "streamlit": {
                "sidebar": {
                    "view_landmarks": "檢視 {count} 個地標",
                },
                "errors": {
                    "fetch_landmarks": "取得地標時發生錯誤：{error}",
                },
            },
        }

        (self.locales_dir / "en.json").write_text(
            json.dumps(self.source_json, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def build_i18n(self, user_locale: str = FALLBACK_LANGUAGE) -> I18n:
        i18n = I18n(
            locales_dir=self.locales_dir,
            tm_path=self.tm_path,
            user_locale=user_locale,
            second_locale="zh-HK",
        )
        source = i18n.load_locale(FALLBACK_LANGUAGE)
        assert source is not None
        i18n.update_tm(source, source_locale=FALLBACK_LANGUAGE)
        return i18n

    def test_update_tm_export_and_lookup(self) -> None:
        i18n = self.build_i18n()
        i18n.update_tm(self.source_json, self.target_json, "zh-HK")

        self.assertIsNone(i18n.lookup_tm("zh-HK"))
        exported = i18n.export_tm("zh-HK")
        self.assertEqual(
            exported["app"]["loading_text"], self.target_json["app"]["loading_text"]
        )
        self.assertEqual(
            exported["streamlit"]["sidebar"]["view_landmarks"],
            self.target_json["streamlit"]["sidebar"]["view_landmarks"],
        )

    def test_t_nested_lookup_and_placeholder_interpolation(self) -> None:
        i18n = self.build_i18n()
        i18n.update_tm(self.source_json, self.target_json, "zh-HK")
        i18n.translations["zh-HK"] = i18n.export_tm("zh-HK")

        self.assertEqual(
            i18n.t("streamlit.sidebar.view_landmarks", {"count": 3}, "zh-HK"),
            "檢視 3 個地標",
        )
        self.assertEqual(
            i18n.t(
                "streamlit.errors.fetch_landmarks",
                {"error": "timeout"},
                "zh-HK",
            ),
            "取得地標時發生錯誤：timeout",
        )
        self.assertEqual(i18n.t("missing.key"), "missing.key")

    def test_match_locale_falls_back_by_language_then_source(self) -> None:
        i18n = self.build_i18n()
        i18n.update_tm(self.source_json, self.target_json, "zh-HK")
        i18n.translations["zh-HK"] = i18n.export_tm("zh-HK")

        self.assertEqual(i18n.match_locale("zh_TW"), "zh-HK")
        self.assertEqual(i18n.match_locale("fr-FR"), "en")

    def test_init_i18n_translates_missing_and_persists_tm(self) -> None:
        with patch.object(I18n, "_translate_missing", return_value=self.target_json):
            i18n = init_i18n(
                user_locale="zh-HK",
                second_locale="zh-HK",
                locales_dir=self.locales_dir,
                tm_path=self.tm_path,
            )

        self.assertTrue(self.tm_path.exists())
        self.assertEqual(i18n.t("app.loading_text", locale="zh-HK"), "載入地圖…")
        self.assertEqual(
            i18n.t("streamlit.sidebar.view_landmarks", {"count": 5}, "zh-HK"),
            "檢視 5 個地標",
        )

    def test_init_i18n_reuses_existing_tm_without_translation(self) -> None:
        seed = self.build_i18n()
        seed.update_tm(self.source_json, self.target_json, "zh-HK")
        seed.save_tm()

        with patch.object(I18n, "_translate_missing", return_value=None) as mock_translate:
            i18n = init_i18n(
                user_locale="zh-HK",
                second_locale="zh-HK",
                locales_dir=self.locales_dir,
                tm_path=self.tm_path,
            )

        mock_translate.assert_not_called()
        self.assertEqual(i18n.t("app.search_placeholder", locale="zh-HK"), "搜尋此位置…")

    def test_project_en_json_contains_streamlit_keys(self) -> None:
        repo_root = Path(__file__).resolve().parent.parent
        actual_i18n = init_i18n(
            user_locale="en",
            second_locale="zh-HK",
            locales_dir=repo_root / "public" / "locales",
            tm_path=self.tm_path,
        )

        self.assertEqual(
            actual_i18n.t("streamlit.status.test_mode_enabled"),
            "TEST MODE ENABLED",
        )
        self.assertEqual(
            actual_i18n.t("streamlit.sidebar.view_landmarks", {"count": 4}),
            "View 4 Landmarks",
        )
        self.assertEqual(
            actual_i18n.t("streamlit.map.popup.radius", {"radius_km": 15}),
            "15km radius",
        )


if __name__ == "__main__":
    unittest.main()
