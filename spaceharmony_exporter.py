bl_info = {
    "name": "SpaceHarmony Exporter",
    "author": "OpenAI / Codex",
    "version": (1, 0),
    "blender": (3, 0, 0),
    "location": "File > Export > SpaceHarmony (.json)",
    "description": "Export geometry as SpaceHarmony-compatible JSON",
    "category": "Import-Export",
}

import bpy
import json
from bpy_extras.io_utils import ExportHelper
from bpy.props import StringProperty
from mathutils import Vector
from datetime import datetime

class ExportSpaceHarmony(bpy.types.Operator, ExportHelper):
    bl_idname = "export_scene.spaceharmony"
    bl_label = "Export SpaceHarmony"
    filename_ext = ".json"

    filter_glob: StringProperty(
        default="*.json",
        options={'HIDDEN'},
    )

    def execute(self, context):
        obj = context.active_object
        if not obj or obj.type != 'MESH':
            self.report({'ERROR'}, "Select a mesh object to export.")
            return {'CANCELLED'}

        mesh = obj.to_mesh()
        mesh.calc_loop_triangles()

        vertices = [list(v.co) for v in mesh.vertices]
        faces = [list(tri.vertices) for tri in mesh.loop_triangles]

        segments = []
        segment_keys = set()

        def get_segment_key(v_idx1, v_idx2):
            return tuple(sorted((v_idx1, v_idx2)))

        def format_coord(val):
            return f"{val:.5f}"

        def point_key_from_coords(coords):
            return f"{format_coord(coords[0])}|{format_coord(coords[1])}|{format_coord(coords[2])}"

        def segment_key_from_point_keys(key1, key2):
            return '->'.join(sorted([key1, key2]))

        for face in faces:
            for i in range(len(face)):
                v1_idx = face[i]
                v2_idx = face[(i + 1) % len(face)]
                
                key = get_segment_key(v1_idx, v2_idx)
                if key not in segment_keys:
                    segment_keys.add(key)
                    
                    v1_coords = vertices[v1_idx]
                    v2_coords = vertices[v2_idx]
                    
                    key1 = point_key_from_coords(v1_coords)
                    key2 = point_key_from_coords(v2_coords)
                    
                    segments.append({
                        "start": v1_coords,
                        "end": v2_coords,
                        "key": segment_key_from_point_keys(key1, key2),
                        "origin": "import"
                    })

        default_symmetry_settings = {
            "reflections": {"xy": True, "yz": True, "zx": True},
            "rotation": {"axis": "all", "steps": 4},
            "translation": {"axis": "none", "count": 0, "step": 0.5},
            "inversion": False,
            "rotoreflection": {"enabled": False, "axis": "none", "plane": "xy", "angleDeg": 180, "count": 0},
            "screw": {"enabled": False, "axis": "none", "angleDeg": 180, "distance": 0.5, "count": 0},
        }

        export_data = {
            "meta": {
                "version": "1.0.0",
                "createdAt": datetime.now().isoformat(),
                "source": "blender-exporter-v2"
            },
            "settings": {
                "gridDivisions": 1,
                "showPoints": True,
                "showLines": True,
                "useCurvedLines": False,
                "useCurvedSurfaces": False,
                "showClosedForms": True,
                "autoCloseFaces": False,
                "useRegularHighlight": False,
                "symmetry": default_symmetry_settings
            },
            "segments": segments,
            "manualFaces": [],
            "manualVolumes": [],
            "hiddenFaces": [],
            "hiddenVolumes": [],
        }

        with open(self.filepath, 'w') as f:
            json.dump(export_data, f, indent=2)

        self.report({'INFO'}, f"Exported {len(segments)} segments to {self.filepath}")
        return {'FINISHED'}

def menu_func_export(self, context):
    self.layout.operator(ExportSpaceHarmony.bl_idname, text="SpaceHarmony (.json)")

def register():
    bpy.utils.register_class(ExportSpaceHarmony)
    bpy.types.TOPBAR_MT_file_export.append(menu_func_export)

def unregister():
    bpy.utils.unregister_class(ExportSpaceHarmony)
    bpy.types.TOPBAR_MT_file_export.remove(menu_func_export)

if __name__ == "__main__":
    register()