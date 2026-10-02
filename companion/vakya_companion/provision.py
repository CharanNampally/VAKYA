import argparse
import json

from huggingface_hub import snapshot_download
from huggingface_hub.errors import GatedRepoError

from .models import MODELS


def main():
    parser = argparse.ArgumentParser(description="Explicitly download an approved, pinned local model")
    parser.add_argument("model", choices=MODELS)
    args = parser.parse_args()
    model = MODELS[args.model]
    path = model.path(args.model)
    print(f"Downloading {model.repo} at {model.revision}. Model files may be several gigabytes.")
    try:
        snapshot_download(
            model.repo, revision=model.revision, local_dir=path,
            allow_patterns=["*.json", "*.safetensors", "*.py", "*.model", "*.txt", "*.SRC", "*.TGT", "LICENSE"],
        )
    except GatedRepoError:
        parser.exit(1, f"Access required: accept the terms at https://huggingface.co/{model.repo} and run hf auth login locally.\n")
    if not (path / "config.json").is_file() or not any(path.glob("*.safetensors")):
        parser.exit(1, "Download is incomplete; no readiness marker was written.\n")
    (path / "ready.json").write_text(json.dumps({"repo": model.repo, "revision": model.revision}))
    print(f"Provisioned {args.model}; model quality still requires evaluation.")


if __name__ == "__main__":
    main()
