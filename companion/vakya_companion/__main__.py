import argparse
import os
import secrets
from pathlib import Path

from .models import ROOT


def pairing_token() -> str:
    state = ROOT / ".state"
    state.mkdir(mode=0o700, exist_ok=True)
    path = state / "pairing-token"
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        token = path.read_text().strip()
        if len(token) < 32:
            raise RuntimeError("Invalid pairing token file. Remove it locally to create a new token.")
        return token
    token = secrets.token_urlsafe(32)
    with os.fdopen(descriptor, "w") as file:
        file.write(token)
    return token


def main():
    parser = argparse.ArgumentParser(description="Vākya loopback-only local model companion")
    parser.add_argument("--show-token", action="store_true", help="Display the pairing token in your own terminal")
    args = parser.parse_args()
    token = pairing_token()
    if args.show_token:
        print(token)
        return
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    from .app import create_app
    import uvicorn
    print("Vākya companion: http://127.0.0.1:8765")
    print("To pair, run vakya-companion --show-token in your own terminal.")
    uvicorn.run(create_app(token), host="127.0.0.1", port=8765, access_log=False)


if __name__ == "__main__":
    main()
