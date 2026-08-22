import sys
import os
from pathlib import Path

sys.path.insert(0, r"E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1")
import modal
from reconstruction_worker.modal.app import app

try:
    print("Testing Modal app connection...")
    with app.run():
        print("Modal app started successfully!")
except Exception as e:
    print("Modal app connection error:", type(e).__name__, str(e))
