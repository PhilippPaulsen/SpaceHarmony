bl_info = {
    "name": "SpaceHarmony JSON Exporter",
    "blender": (3, 0, 0),
    "category": "Import-Export",
    "version": (1, 5),
    "author": "SpaceHarmony Team",
    "description": "Exportiert kompatible Formen im Raumharmonik-Snapshot-Format (inkl. Metadaten, Segmente, etc.)"
}

import bpy
import json
import os
import datetime
from bpy_extras.io_utils import ExportHelper
from bpy.types import Operator
from bpy.props import StringProperty
from mathutils import Vector

def export_spaceharmony_snapshot(filepath):
    obj = bpy.context.active_object
    if obj is None or obj.type != 'MESH':
        raise Exception("Aktives Objekt muss ein Mesh sein.")

    # Temporären Edge Split Modifier anwenden
    temp_modifier = obj.modifiers.new(name="TempEdgeSplit", type='EDGE_SPLIT')
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=temp_modifier.name)

    mesh = obj.data
    mesh.calc_loop_triangles()

    # Punkte erfassen
    points = [v.co.copy() for v in mesh.vertices]

    # Bounding Box bestimmen
    min_corner = Vector((min(v.x for v in points), min(v.y for v in points), min(v.z for v in points)))
    max_corner = Vector((max(v.x for v in points), max(v.y for v in points), max(v.z for v in points)))
    center = (min_corner + max_corner) * 0.5
    size_vec = max_corner - min_corner
    max_extent = max(size_vec.x, size_vec.y, size_vec.z)
    scale = 1.0 / max_extent if max_extent > 0 else 1.0

    # Normalisierung auf [-0.5, 0.5] in größter Ausdehnung
    normalized_points = [((v - center) * scale) for v in points]
    points_export = [[round(v.x, 6), round(v.y, 6), round(v.z, 6)] for v in normalized_points]

    # Linien → Segmente
    segments = []
    for edge in mesh.edges:
        i1, i2 = edge.vertices[0], edge.vertices[1]
        segments.append({
            "start": points_export[i1],
            "end": points_export[i2],
            "indices": [i1, i2],
            "origin": "manual"
        })

    # Flächen
    manual_faces = [list(face.vertices) for face in mesh.polygons if len(face.vertices) >= 3]

    now = datetime.datetime.utcnow().isoformat() + "Z"
    label = obj.name if obj.name else "Form"

    snapshot = {
        "meta": {
            "label": label,
            "pointCount": len(points_export),
            "lineCount": len(segments),
            "faceCount": len(manual_faces),
            "source": "Blender Export",
            "symmetry": "manual",
            "type": "manual",
            "description": "Exported from Blender via SpaceHarmony plugin"
        },
        "data": {
            "meta": {
                "version": "1.0.0",
                "createdAt": now
            },
            "settings": {
                "gridDivisions": 1,
                "showPoints": True,
                "showGrid": False,
                "showLabels": False,
                "snapToGrid": False
            },
            "segments": segments,
            "manualFaces": manual_faces,
            "manualVolumes": [],
            "hiddenFaces": [],
            "hiddenVolumes": []
        }
    }

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, indent=2)

class ExportSpaceHarmonySnapshot(Operator, ExportHelper):
    bl_idname = "export_mesh.spaceharmony_snapshot"
    bl_label = "Export SpaceHarmony Snapshot"
    filename_ext = ".json"

    filter_glob: StringProperty(
        default='*.json',
        options={'HIDDEN'}
    )

    def execute(self, context):
        try:
            export_spaceharmony_snapshot(self.filepath)
            self.report({'INFO'}, "Erfolgreich exportiert")
            return {'FINISHED'}
        except Exception as e:
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}

def menu_func_export(self, context):
    self.layout.operator(ExportSpaceHarmonySnapshot.bl_idname, text="SpaceHarmony Snapshot (.json)")

def register():
    bpy.utils.register_class(ExportSpaceHarmonySnapshot)
    bpy.types.TOPBAR_MT_file_export.append(menu_func_export)

def unregister():
    bpy.utils.unregister_class(ExportSpaceHarmonySnapshot)
    bpy.types.TOPBAR_MT_file_export.remove(menu_func_export)

if __name__ == "__main__":
    register()