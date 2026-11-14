"""Integrity tests for the shipped static data packs.

These tests check the packs that ship in this repository
(backend/static_data/<slug>/): every pack must contain a manifest that
parses, exactly the frames the manifest lists, and PNG frames at the
render size the manifest declares. They run on the standard library
only — no third-party packages needed:

    python -m unittest discover -s backend/tests -v
    # or simply
    python backend/tests/test_packs.py
"""

import json
import struct
import unittest
from pathlib import Path

PACKS_ROOT = Path(__file__).resolve().parents[1] / "static_data"

# slug -> total SPHEREx epochs the archive holds on that field
# (as recorded when the packs were generated; see each manifest).
EXPECTED_EPOCH_TOTALS = {
    "3i-atlas": 184,
    "barnards-star": 183,
    "epsilon-indi": 238,
    "wise-0855": 129,
    "rw-aurigae": 168,
    "r-draconis": 1258,
}

EXPECTED_FRAMES_PER_PACK = 12


def png_dimensions(path: Path) -> tuple[int, int]:
    """Read a PNG's width/height from its IHDR chunk (no imaging lib)."""
    with open(path, "rb") as fh:
        header = fh.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(f"{path} is not a PNG file")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


class TestPacks(unittest.TestCase):
    def test_all_packs_present(self):
        for slug in EXPECTED_EPOCH_TOTALS:
            self.assertTrue(
                (PACKS_ROOT / slug).is_dir(), f"missing data pack: {slug}"
            )

    def test_pack_contents(self):
        for slug, expected_total in EXPECTED_EPOCH_TOTALS.items():
            with self.subTest(pack=slug):
                pack_dir = PACKS_ROOT / slug
                manifest = json.loads((pack_dir / "manifest.json").read_text())

                # Manifest headline numbers
                self.assertEqual(manifest["n_epochs_total"], expected_total)
                self.assertEqual(manifest["n_frames"], EXPECTED_FRAMES_PER_PACK)
                self.assertEqual(len(manifest["frames"]), EXPECTED_FRAMES_PER_PACK)
                self.assertAlmostEqual(manifest["field_size_deg"], 0.5)

                display_px = manifest["display_px"]
                for frame in manifest["frames"]:
                    # Required per-frame metadata
                    for field in ("utc", "obs_id", "detector", "band_um", "file"):
                        self.assertIn(field, frame)
                    self.assertEqual(len(frame["band_um"]), 2)
                    self.assertLess(frame["band_um"][0], frame["band_um"][1])

                    # The frame file exists and is a correctly sized PNG
                    frame_path = pack_dir / frame["file"]
                    self.assertTrue(frame_path.is_file(), f"missing {frame_path}")
                    self.assertEqual(png_dimensions(frame_path), (display_px, display_px))


if __name__ == "__main__":
    unittest.main()
