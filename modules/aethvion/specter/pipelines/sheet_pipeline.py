"""
Specter Sheet Pipeline
Mode: Generate single Sprite Sheet via API -> Vision AI bounding-box extraction -> Slice -> Rig
Style consistency is guaranteed because ALL parts come from one single image generation call.
Background removal is NOT applied automatically - it is opt-in per layer via the Edit tab.
"""
import os
import sys
import uuid
import json
import shutil
from PIL import Image

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

from .utils import create_part_entry, generate_rig, extract_bounding_boxes


SHEET_PROMPT = """
Analyze this Concept Art Sprite Sheet. It contains a full character design AND disassembled modular parts floating separately.
Identify the bounding boxes [ymin, xmin, ymax, xmax] (normalized 0-1000) for ONLY the ISOLATED parts (ignore the fully assembled character on the top half).
I need the precise bounding boxes for these floating pieces:
1. body (the headless torso/arms/legs)
2. head (the head base with ears and back hair)
3. hair_front (the front bangs)
4. eye_left
5. eye_right
6. mouth

Return the results strictly as a JSON object with the part names as keys and the box as value.
Example: {"head": [100, 200, 500, 600], ...}
"""


class SheetPipeline:
    """Generate a Sprite Sheet via online API then Vision AI slice and rig."""

    def __init__(self, provider, image_provider, model_id: str, image_model_id: str):
        self.provider = provider
        self.image_provider = image_provider
        self.model_id = model_id
        self.image_model_id = image_model_id

    def generate_concept(self, prompt: str, output_path: str) -> str:
        """Generate a Sprite Sheet concept image. Returns path to saved image."""
        full_prompt = (
            "A VTuber character design sprite sheet on a pure white background. "
            "The TOP HALF shows the complete assembled character (A-pose, front-facing, flat colors). "
            "The BOTTOM HALF MUST contain clearly separated, floating components laid out individually: "
            "an isolated headless body, an isolated head with back-hair, isolated front hair bangs, "
            "isolated left eye, isolated right eye, and an isolated mouth. "
            f"Character design reference: {prompt}"
        )

        trace_id = f"specter-sheet-{uuid.uuid4().hex[:8]}"
        response = self.image_provider.generate_image(
            prompt=full_prompt,
            trace_id=trace_id,
            model=self.image_model_id,
            size="1024x1024"
        )

        if response.success and response.metadata and 'images' in response.metadata:
            with open(output_path, "wb") as f:
                f.write(response.metadata['images'][0])
            print("Sheet concept generated.")
            return output_path
        else:
            raise ValueError(f"Image generation failed: {response.error}")

    def generate_rig_from_sheet(self, concept_path: str, output_dir: str,
                                 output_name: str, instructions: str = None) -> str:
        """Slice a Sprite Sheet and generate the animation rig. All raws are always saved."""
        print(f"Sheet Pipeline: Rigging {output_name}...")
        os.makedirs(output_dir, exist_ok=True)
        textures_dir = os.path.join(output_dir, "textures")
        os.makedirs(textures_dir, exist_ok=True)

        # Always save full sprite sheet as permanent reference
        shutil.copy2(concept_path, os.path.join(textures_dir, "original_spritesheet.png"))

        # 1. Vision: extract bounding boxes
        print("Vision AI: Mapping sprite sheet parts...")
        with open(concept_path, "rb") as f:
            image_data = f.read()

        coords = extract_bounding_boxes(image_data, SHEET_PROMPT, self.provider, self.model_id)

        if not coords:
            raise ValueError("Vision AI returned no bounding boxes from the sprite sheet.")

        print(f"Vision mapped {len(coords)} isolated parts.")

        # 2. Slice - always save _raw.png (permanent backup), .png = active texture
        img = Image.open(concept_path).convert("RGBA")
        width, height = img.size
        parts_config = []
        canvas_w, canvas_h = 1000, 1000

        for name, box in coords.items():
            if not box or len(box) != 4:
                print(f"Skipping {name}: invalid box.")
                continue

            left   = (box[1] / 1000) * width
            top    = (box[0] / 1000) * height
            right  = (box[3] / 1000) * width
            bottom = (box[2] / 1000) * height

            cropped = img.crop((left, top, right, bottom))
            raw_path = os.path.join(textures_dir, f"{name}_raw.png")
            tex_path = os.path.join(textures_dir, f"{name}.png")
            cropped.save(raw_path)
            shutil.copy2(raw_path, tex_path)  # active texture defaults to raw crop

            parts_config.append(create_part_entry(name, f"textures/{name}.png",
                                                   left, top, right, bottom, canvas_w, canvas_h))
            print(f"Sliced: {name}")

        # 3. Generate rig
        print("Generating physics rig...")
        config = generate_rig(parts_config, self.provider, self.model_id, instructions)
        config["name"] = output_name.replace("_", " ").title()
        config["pipeline"] = "sheet"

        rig_path = os.path.join(output_dir, "avatar.specter.json")
        with open(rig_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=4)

        print(f"Sheet Pipeline complete: {output_name}")
        return rig_path
