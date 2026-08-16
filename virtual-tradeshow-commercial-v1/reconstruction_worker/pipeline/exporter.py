import shutil
import subprocess
import os

class SplatExporter:
    def __init__(self, workspace_dir):
        self.workspace_dir = workspace_dir
        self.ns_export = shutil.which("ns-export")

    def export_ply(self, config_path, output_ply_path):
        """
        Exports trained splatfacto model into a standard Gaussian Splat PLY asset.
        """
        if not self.ns_export:
            raise RuntimeError("ns-export tool not found.")

        subprocess.run([
            self.ns_export, "gaussian-splat",
            "--load-config", config_path,
            "--output-dir", os.path.dirname(output_ply_path)
        ], check=True)

        return output_ply_path
