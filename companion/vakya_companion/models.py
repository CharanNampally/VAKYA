import importlib.util
import json
import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = Path(os.environ.get("VAKYA_MODEL_DIR", ROOT / "models"))


@dataclass(frozen=True)
class Model:
    repo: str
    revision: str
    modules: tuple[str, ...]

    def path(self, name: str) -> Path:
        return MODEL_ROOT / name / self.revision


MODELS = {
    "en-indic": Model("ai4bharat/indictrans2-en-indic-dist-200M",
                      "173b94239f7c38886b2747b8d4a5db771a7e1232", ("torch", "transformers", "IndicTransToolkit")),
    "indic-en": Model("ai4bharat/indictrans2-indic-en-dist-200M",
                      "eb9e49d81077cfc5311e82ff36d8c1fc11557b5d", ("torch", "transformers", "IndicTransToolkit")),
    "indic-indic": Model("ai4bharat/indictrans2-indic-indic-dist-320M",
                        "ffb7582b6d43791f1fb26b2153fc065f2e9ea575", ("torch", "transformers", "IndicTransToolkit")),
    "qwen": Model("mlx-community/Qwen3-4B-4bit",
                  "4dcb3d101c2a062e5c1d4bb173588c54ea6c4d25", ("mlx_lm",)),
    "parler": Model("ai4bharat/indic-parler-tts",
                    "7b527af5ee8ed1f9a28d80b19703ed9bb8ba10ca", ()),
}


def installed(name: str) -> bool:
    model = MODELS[name]
    marker = model.path(name) / "ready.json"
    if not marker.is_file():
        return False
    data = json.loads(marker.read_text())
    return (
        data.get("repo") == model.repo
        and data.get("revision") == model.revision
        and (model.path(name) / "config.json").is_file()
        and any(model.path(name).glob("*.safetensors"))
        and all(importlib.util.find_spec(module) is not None for module in model.modules)
    )
