import shutil
import subprocess
import os

class ColmapRunner:
    def __init__(self, workspace_dir):
        self.workspace_dir = workspace_dir
        self.colmap_bin = shutil.which("colmap")

    def is_available(self):
        return self.colmap_bin is not None

    def run_sfm(self, image_dir, progress_callback=None):
        """
        Runs COLMAP feature extraction, exhaustive matching, and mapper.
        """
        if not self.is_available():
            raise RuntimeError(
                "COLMAP executable not found in system PATH. "
                "Please install COLMAP (https://colmap.github.io/install.html) or run worker in DRY_RUN=true mode."
            )

        db_path = os.path.join(self.workspace_dir, "database.db")
        sparse_dir = os.path.join(self.workspace_dir, "sparse")
        os.makedirs(sparse_dir, exist_ok=True)

        # Stage 1: Feature Extraction
        if progress_callback:
            progress_callback(15, "colmap_feature_extraction")
        subprocess.run([
            self.colmap_bin, "feature_extractor",
            "--database_path", db_path,
            "--image_path", image_dir,
            "--ImageReader.camera_model", "OPENCV"
        ], check=True)

        # Stage 2: Feature Matching
        if progress_callback:
            progress_callback(30, "colmap_matching")
        subprocess.run([
            self.colmap_bin, "exhaustive_matcher",
            "--database_path", db_path
        ], check=True)

        # Stage 3: Sparse Reconstruction (Mapper)
        if progress_callback:
            progress_callback(45, "colmap_mapping")
        subprocess.run([
            self.colmap_bin, "mapper",
            "--database_path", db_path,
            "--image_path", image_dir,
            "--output_path", sparse_dir
        ], check=True)

        return {
            "database_path": db_path,
            "sparse_dir": sparse_dir
        }
