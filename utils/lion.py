import copy
import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("lion")

FALLBACK_LANGUAGE = "en"
CUSTOM_SECOND_LOCALE = "zh-HK"
LOCAL_TM_FILE = Path("cache/local-tm.json")
LOCALES_DIR = Path("public/locales")
_LOCALE_REGEX = re.compile(r"^([a-zA-Z]{2}([-_][a-zA-Z]{2})?)$")


class I18n:
    def __init__(
        self,
        source_locale: str = FALLBACK_LANGUAGE,
        locales_dir: Path | str = LOCALES_DIR,
        tm_path: Path | str = LOCAL_TM_FILE,
        primary_locale: str = FALLBACK_LANGUAGE,
        second_locale: Optional[str] = CUSTOM_SECOND_LOCALE,
        user_locale: Optional[str] = None,
    ) -> None:
        self.source_locale = source_locale
        self.locales_dir = Path(locales_dir)
        self.tm_path = Path(tm_path)
        self.lang = {
            "preferLocale": primary_locale,
            "preferLangCode": _language_code(primary_locale),
            "secondLocale": second_locale,
            "secondLangCode": (
                _language_code(second_locale) if second_locale else None
            ),
        }
        self.user_locale = user_locale or primary_locale
        self.translations: Dict[str, Dict[str, Any]] = {}
        self.TM: Dict[str, Dict[str, Any]] = {}

    def load_locale(self, locale: str = FALLBACK_LANGUAGE) -> Optional[Dict[str, Any]]:
        locale_path = self.locales_dir / f"{locale}.json"
        if not locale_path.exists():
            logger.debug("Locale resource not found: %s", locale_path)
            return None

        try:
            data = json.loads(locale_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.error("Error loading locale '%s': %s", locale, exc)
            return None

        if not isinstance(data, dict):
            logger.error("Locale '%s' must be a JSON object", locale)
            return None

        self.translations[locale] = data
        return data

    def load_tm(self) -> Dict[str, Dict[str, Any]]:
        if not self.tm_path.exists():
            self.TM = {}
            return self.TM

        try:
            data = json.loads(self.tm_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.error("Error loading TM '%s': %s", self.tm_path, exc)
            self.TM = {}
            return self.TM

        self.TM = data if isinstance(data, dict) else {}
        return self.TM

    def save_tm(self) -> None:
        self.tm_path.parent.mkdir(parents=True, exist_ok=True)
        self.tm_path.write_text(
            json.dumps(self.TM, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    def t(
        self,
        key: str,
        params: Optional[Dict[str, Any]] = None,
        locale: Optional[str] = None,
    ) -> str:
        params = params or {}
        matched_locale = self.match_locale(locale or self.user_locale)
        if not matched_locale:
            return key

        raw = self._dig(self.translations.get(matched_locale, {}), key)
        if not isinstance(raw, str):
            return key
        return self._interpolate(raw, params)

    def match_locale(self, locale: Optional[str]) -> Optional[str]:
        if not locale:
            return (
                self.source_locale
                if self.source_locale in self.translations
                else None
            )

        norm = locale.replace("_", "-")
        parts = norm.split("-")
        lang = parts[0].lower()
        full = lang if len(parts) == 1 else f"{lang}-{parts[1].upper()}"

        keys = list(self.translations.keys())
        found = next((k for k in keys if k.lower() == full.lower()), None)
        if found:
            return found

        found = next((k for k in keys if k.lower().startswith(lang)), None)
        if found:
            return found

        return self.source_locale if self.source_locale in self.translations else None

    def update_tm(
        self,
        source_json: Dict[str, Any],
        target_json: Optional[Dict[str, Any]] = None,
        target_locale: Optional[str] = None,
        source_locale: str = FALLBACK_LANGUAGE,
    ) -> Dict[str, Dict[str, Any]]:
        if not isinstance(source_json, dict):
            raise ValueError("[TM] source_json error")
        if target_json is not None and not target_locale:
            raise ValueError(
                "[TM] update_tm: target_locale must be provided with target_json"
            )

        src_leaves = self._flatten_strings(source_json)
        src_paths = {record["path"] for record in src_leaves}
        tgt_leaves: list[Dict[str, str]] = []

        if target_json is not None:
            if not isinstance(target_json, dict):
                raise ValueError("[TM] target_json error")
            tgt_leaves = self._flatten_strings(target_json)
            tgt_paths = {record["path"] for record in tgt_leaves}
            for path in sorted(src_paths - tgt_paths):
                logger.warning("[TM] target missing path: %s", path)
            for path in sorted(tgt_paths - src_paths):
                logger.warning(
                    "[TM] target has extra path not in source_json: %s", path
                )

        seen_leaf_keys = set()
        src_unique = []
        for record in src_leaves:
            if record["key"] in seen_leaf_keys:
                logger.warning(
                    "[TM] Skipping duplicate leaf key '%s' on '%s'",
                    record["key"],
                    record["path"],
                )
                continue
            seen_leaf_keys.add(record["key"])
            src_unique.append(record)

        tgt_by_path = {record["path"]: record for record in tgt_leaves}
        for record in src_unique:
            msgid = self._hash_key_value(record["key"], record["value"])
            self._set_tm_record(msgid, record["key"], source_locale, record["value"])

            target_record = tgt_by_path.get(record["path"])
            if (
                target_locale
                and target_record
                and isinstance(target_record.get("value"), str)
            ):
                self._set_tm_record(
                    msgid,
                    record["key"],
                    target_locale,
                    target_record["value"],
                )

        return self.TM

    def export_tm(
        self,
        target_locale: str,
        source_json: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        source_json = source_json or self.translations.get(self.source_locale)
        if not isinstance(source_json, dict):
            raise ValueError("[TM] source_json error")

        target_json = copy.deepcopy(source_json)

        def replace_in(obj: Dict[str, Any]) -> None:
            for key, value in obj.items():
                if isinstance(value, str):
                    msgid = self._hash_key_value(key, value)
                    record = self.TM.get(msgid, {})
                    if isinstance(record.get(target_locale), str):
                        obj[key] = record[target_locale]
                elif isinstance(value, dict):
                    replace_in(value)

        replace_in(target_json)
        return target_json

    def lookup_tm(
        self,
        target_locale: str,
        source_json: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        source_json = source_json or self.translations.get(self.source_locale)
        if not isinstance(source_json, dict):
            raise ValueError("[TM] source_json error")

        missing = copy.deepcopy(source_json)

        def filter_in(obj: Dict[str, Any]) -> None:
            keys_to_delete = []
            for key, value in obj.items():
                if isinstance(value, str):
                    msgid = self._hash_key_value(key, value)
                    if isinstance(self.TM.get(msgid, {}).get(target_locale), str):
                        keys_to_delete.append(key)
                elif isinstance(value, dict):
                    filter_in(value)
                    if not value:
                        keys_to_delete.append(key)
            for key in keys_to_delete:
                del obj[key]

        filter_in(missing)
        return missing if missing else None

    def translate_locale(
        self, locale: str, load_target_file: bool = False
    ) -> bool:
        if load_target_file:
            target_file = self.load_locale(locale)
            if target_file:
                self.update_tm(
                    self.translations[self.source_locale],
                    target_file,
                    locale,
                    source_locale=self.source_locale,
                )

        missing = self.lookup_tm(locale)
        updated = False
        if missing:
            translated = self._translate_missing(missing, locale)
            if translated:
                self.update_tm(
                    missing,
                    translated,
                    locale,
                    source_locale=self.source_locale,
                )
                updated = True

        self.translations[locale] = self.export_tm(locale)
        return updated

    def _translate_missing(
        self, missing: Dict[str, Any], target_locale: str
    ) -> Optional[Dict[str, Any]]:
        try:
            from services.llm_service import LLMService

            return LLMService.translate_json_resource(
                missing, self.source_locale, target_locale
            )
        except Exception as exc:
            logger.error("Error translating locale '%s': %s", target_locale, exc)
            return None

    def _set_tm_record(
        self, msgid: str, leaf_key: str, locale: str, value: str
    ) -> None:
        if msgid not in self.TM:
            self.TM[msgid] = {"key": leaf_key}
        if self.TM[msgid].get("key") != leaf_key:
            logger.warning(
                "[TM] msgid key mismatch: keeping existing key='%s' new='%s'",
                self.TM[msgid].get("key"),
                leaf_key,
            )
        self.TM[msgid][locale] = value

    @staticmethod
    def _dig(obj: Dict[str, Any], path: str) -> Any:
        current: Any = obj
        for part in path.split("."):
            if not isinstance(current, dict) or part not in current:
                return None
            current = current[part]
        return current

    @staticmethod
    def _interpolate(text: str, params: Dict[str, Any]) -> str:
        return re.sub(
            r"\{(\w+)\}",
            lambda match: str(params.get(match.group(1), match.group(0))),
            text,
        )

    @staticmethod
    def _hash_key_value(key: str, value: str) -> str:
        data = f"{key}\u0000{value}".encode("utf-8")
        return hashlib.md5(data).hexdigest()[:8]

    @staticmethod
    def _flatten_strings(
        obj: Dict[str, Any], base_path: str = ""
    ) -> list[Dict[str, str]]:
        out: list[Dict[str, str]] = []
        for key, value in obj.items():
            path = f"{base_path}.{key}" if base_path else key
            if isinstance(value, str):
                out.append({"path": path, "key": key, "value": value})
            elif isinstance(value, dict):
                out.extend(I18n._flatten_strings(value, path))
        return out


def init_i18n(
    user_locale: Optional[str] = None,
    second_locale: Optional[str] = CUSTOM_SECOND_LOCALE,
    load_target_file: bool = False,
    locales_dir: Path | str = LOCALES_DIR,
    tm_path: Path | str = LOCAL_TM_FILE,
) -> I18n:
    i18n = I18n(
        source_locale=FALLBACK_LANGUAGE,
        locales_dir=locales_dir,
        tm_path=tm_path,
        primary_locale=FALLBACK_LANGUAGE,
        second_locale=second_locale,
        user_locale=user_locale or FALLBACK_LANGUAGE,
    )

    i18n.load_tm()
    source_file = i18n.load_locale(FALLBACK_LANGUAGE)
    if source_file:
        i18n.update_tm(source_file, source_locale=FALLBACK_LANGUAGE)

    active_locale = (
        i18n.user_locale
        if is_valid_locale(i18n.user_locale)
        else FALLBACK_LANGUAGE
    )
    if active_locale != FALLBACK_LANGUAGE and source_file:
        updated = i18n.translate_locale(
            active_locale, load_target_file=load_target_file
        )
        if updated:
            i18n.save_tm()

    return i18n


def is_valid_locale(locale: Optional[str]) -> bool:
    return bool(locale and _LOCALE_REGEX.fullmatch(locale))


def _language_code(locale: Optional[str]) -> Optional[str]:
    if not locale:
        return None
    return locale.replace("_", "-").split("-")[0].lower()


def get_country_language(country, code=None, locale="en"):
    """
    Customize specific language code based on country.
    Accepts country as a string (country name) or a dict (with 'name' and/or 'code').
    """
    if not country or _language_code(locale) != "zh":
        return locale

    country_name = ""
    country_code = ""
    if isinstance(country, str):
        country_name = country.lower()
        country_code = (code or "").upper()
    else:
        country_name = (country.get("name", "") or "").lower()
        country_code = (country.get("code", "") or code or "").upper()

    if (
        "hong kong" in country_name
        or "香港" in country_name
        or "macau" in country_name
        or "澳門" in country_name
        or "澳门" in country_name
        or country_code == "HK"
    ):
        return "zh-HK"

    if (
        "china" in country_name
        or "中國" in country_name
        or "中国" in country_name
        or country_code == "CN"
    ):
        return "zh-CN"

    if (
        any(name in country_name for name in ["taiwan", "台灣", "台湾"])
        or country_code == "TW"
    ):
        return "zh-TW"

    return locale
