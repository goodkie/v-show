import shutil
import subprocess
import os

class NerfstudioRunner:
    def __init__(self, workspace_dir):
        self.workspace_dir = workspace_dir
        self.ns_process = shutil.which("ns-process-data")
        self.ns_train = shutil.which("ns-train")
        self.ns_export = shutil.which("ns-export")

    def is_available(self):
        return self.ns_process is not None and self.ns_train is not None

    def run_splatfacto(self, image_dir, colmap_dir, quality_preset="standard", progress_callback=None):
        """
        Runs ns-process-data and ns-train splatfacto.
        """
        if not self.is_available():
            raise RuntimeError(
                "Nerfstudio CLI tools (ns-process-data, ns-train) not found in system PATH. "
                "Please install Nerfstudio (https://docs.nerf.studio/) or run worker in DRY_RUN=true mode."
            )

        processed_data_dir = os.path.join(self.workspace_dir, "nerfstudio_data")
        output_dir = os.path.join(self.workspace_dir, "outputs")
        os.makedirs(processed_data_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        # Stage 1: ns-process-data
        if progress_callback:
            progress_callback(60, "nerfstudio_processing")
        subprocess.run([
            self.ns_process, "images",
            "--data", image_dir,
            "--output-dir", processed_data_dir,
            "--skip-colmap" # Use existing COLMAP
        ], check=True)

        # Preset Iteration Mapping
        max_iters = 10000
        if quality_preset == "preview":
            max_iters = 5000
        elif quality_preset == "high":
            max_iters = 20000

        # Stage 2: ns-train splatfacto
        if progress_callback:
            progress_callback(75, "splat_training")
        subprocess.run([
            self.ns_train, "splatfacto",
            "--data", processed_data_dir,
            "--output-dir", output_dir,
            "--max-num-iterations", str(max_iters),
            "--vis", "none"
        ], check=True)

        return output_dir
